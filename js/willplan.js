/*
	Will-Wallet — Inheritance Plan Builder (#newInheritancePlan)

	Composes existing pieces of the app; no transaction, script or key logic is duplicated:
	 - coinjs.simpleHodlAddress() — the same derivation the Time Lock page (#newTimeLocked) uses
	 - coinjs.pubkey2address() — for portions that unlock immediately
	 - #redeemFrom / #redeemFromBtn — the Transaction page's existing vault load
	 - #recipients rows + #transactionBtn — the Transaction page's existing output list and builder
	   (the Outputs tab becomes a read-only rollup of the plan; nLockTime and non-final
	    sequence numbers are handled by the existing engine once lock_time is set)
*/

$(document).ready(function(){

	var COLORS = ['#337ab7','#5cb85c','#f0ad4e','#d9534f','#9b59b6','#16a085','#e67e22','#7f8c8d'];
	var STORAGE_KEY = 'willwallet_plan_draft';
	var DUST = 0.00001;

	var plan = { name:'Untitled Inheritance Plan', vaultSource:'', release:{mode:null, lock:0}, feeRate:'1', lastSize:400, beneficiaries:[] };
	var built = null;
	var uid = 1;
	var saveT = null;

	/* ---------- small helpers ---------- */

	function esc(s){
		return (''+(s===undefined||s===null?'':s)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}
	function fmt(n){
		n = (n*1 || 0);
		var s = n.toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
		return (s=='' || s=='-')?'0':s;
	}
	function fmtDate(unix){ return moment.unix(unix).format('MMM D, YYYY HH:mm'); }
	function blockToApprox(h){ return moment.unix(1231006505 + (h*600)); } /* genesis + ~10 min/block, display only */

	function benefById(id){
		var r = null;
		$.each(plan.beneficiaries, function(i,b){ if(b.id==id){ r = b; } });
		return r;
	}
	function allocInB(b, id){
		var r = null;
		if(b){ $.each(b.allocations, function(i,a){ if(a.id==id){ r = a; } }); }
		return r;
	}
	function benefByDom(el){
		return benefById($(el).closest('.planBenefCard').attr('data-bid'));
	}
	function allocByDom(el){
		var $row = $(el).closest('.planAllocRow');
		var b = benefById($row.closest('.planBenefCard').attr('data-bid'));
		var a = allocInB(b, $row.attr('data-aid'));
		return (b && a) ? {b:b, a:a} : null;
	}
	function eachAlloc(cb){
		$.each(plan.beneficiaries, function(i,b){ $.each(b.allocations, function(j,a){ cb(b,a); }); });
	}
	function nextColor(){
		var used = {};
		$.each(plan.beneficiaries, function(i,b){ used[b.color] = 1; });
		for(var i=0; i<COLORS.length; i++){ if(!used[COLORS[i]]){ return COLORS[i]; } }
		return COLORS[plan.beneficiaries.length % COLORS.length];
	}

	/* ---------- vault (delegates to the Transaction page) ---------- */

	function vaultBalance(){ return ($("#totalInput").html()*1) || 0; }

	function vaultAddress(){
		var s = $.trim(plan.vaultSource || $("#redeemFrom").val() || '');
		if(s==''){ return null; }
		try {
			var d = coinjs.addressDecode(s);
			if(d.version==coinjs.pub || d.version==coinjs.multisig || d.type=='bech32'){ return s; }
			if(d.version==coinjs.priv){ return coinjs.wif2address(s)['address']; }
			var rs = coinjs.script().decodeRedeemScript(s);
			if(rs){ return rs['address']; }
		} catch(e) { }
		return null;
	}

	function feeRate(){
		var r = parseFloat(plan.feeRate);
		return (isNaN(r) || r<=0) ? 1 : r;
	}
	function feeBTC(){
		return Math.ceil(feeRate() * ((plan.lastSize*1)||400)) / 100000000;
	}

	/* estimated virtual size via the Fees page's existing analyser (#feesAnalyseBtn) */
	function analyzeSizeFromHex(hex){
		$("#fees .txhex").val(hex);
		$("#feesAnalyseBtn").click();
		$("#fees .txhex").val('');
		var bytes = 10;
		$("#fees .txinputs .bytes, #fees .txoutputs .bytes").each(function(){
			bytes += ($(this).html()*1) || 0;
		});
		return bytes;
	}

	function allocatable(){
		var a = vaultBalance() - feeBTC();
		return (a>0) ? a : 0;
	}
	function allocatedTotal(){
		var t = 0;
		eachAlloc(function(b,a){ t += (a.amount*1 || 0); });
		return t;
	}

	/* ---------- derivation (same calls as the Time Lock page) ---------- */

	function pubkeyOk(pk){
		if(!pk){ return false; }
		try { return coinjs.pubkeydecompress(pk) ? true : false; } catch(e){ return false; }
	}

	function allocConfigured(a){
		return (a.mode=='immediate') || (a.mode=='date' && a.lock*1>=500000000) || (a.mode=='block' && a.lock*1>0 && a.lock*1<500000000);
	}

	function deriveAlloc(b, a){
		if(!pubkeyOk(b.pubkey) || !allocConfigured(a)){ return null; }
		try {
			if(a.mode=='immediate'){
				return {address: coinjs.pubkey2address(b.pubkey), redeemScript: null};
			}
			var h = coinjs.simpleHodlAddress(b.pubkey, a.lock*1);
			return {address: h['address'], redeemScript: h['redeemScript']};
		} catch(e) { return null; }
	}

	function unlockLabel(a){
		if(a.mode=='immediate'){ return 'available immediately once the plan takes effect'; }
		if(a.mode=='date' && a.lock*1>=500000000){ return 'from '+fmtDate(a.lock*1); }
		if(a.mode=='block' && a.lock*1>0){ return 'from around '+blockToApprox(a.lock*1).format('MMM YYYY')+' (block '+a.lock+', approximate)'; }
		return 'unlock not set yet';
	}

	function allocSentence(b, a){
		var name = b.name || 'This beneficiary';
		if(a.mode=='immediate'){ return name+' can access this portion as soon as the plan takes effect.'; }
		if(a.mode=='date' && a.lock*1>=500000000){ return name+' can access this portion starting '+fmtDate(a.lock*1)+'.'+earlyNote(a); }
		if(a.mode=='block' && a.lock*1>0 && a.lock*1<500000000){ return name+' can access this portion starting around '+blockToApprox(a.lock*1).format('MMM YYYY')+' (block '+a.lock+', approximate).'; }
		return 'Choose when this portion unlocks.';
	}

	function earlyNote(a){
		if(plan.release.mode=='date' && plan.release.lock*1>0 && a.mode=='date' && a.lock*1>=500000000 && a.lock*1<plan.release.lock*1){
			return ' Note: this unlocks before the plan takes effect, so it is available immediately on release.';
		}
		return '';
	}

	function releaseSentence(){
		if(plan.release.mode=='date' && plan.release.lock*1>0){
			return 'This plan takes effect on '+fmtDate(plan.release.lock*1)+'. Until then, you can change or cancel it at any time.';
		}
		if(plan.release.mode=='monitored'){
			return 'This plan takes effect when your monitoring arrangement confirms you are no longer able to manage it.';
		}
		return null;
	}

	/* ---------- beneficiary cards ---------- */

	function newAlloc(suggestion){
		return {id: uid++, mode:'date', lock:0, amount: (suggestion>DUST)? suggestion.toFixed(8) : ''};
	}
	function remainderSuggestion(){
		var r = allocatable() - allocatedTotal();
		return (r>0)? r : 0;
	}

	function allocHtml(b, a){
		var h = '';
		h += '<div class="well well-sm planAllocRow" data-aid="'+a.id+'">';
		h += '<div class="row">';
		h += '<div class="col-sm-3"><label class="small">Unlocks</label><select class="form-control planAllocMode">';
		h += '<option value="date"'+((a.mode=='date')?' selected':'')+'>On a date</option>';
		h += '<option value="immediate"'+((a.mode=='immediate')?' selected':'')+'>Immediately</option>';
		h += '<option value="block"'+((a.mode=='block')?' selected':'')+'>At a block height</option>';
		h += '</select></div>';
		h += '<div class="col-sm-4"><label class="small">&nbsp;</label>';
		h += '<div class="input-group date planAllocDatePicker'+((a.mode!='date')?' hidden':'')+'"><input type="text" class="form-control" placeholder="MM/DD/YYYY HH:mm"><span class="input-group-addon"><span class="glyphicon glyphicon-calendar"></span></span></div>';
		h += '<input type="text" class="form-control planAllocBlock'+((a.mode!='block')?' hidden':'')+'" placeholder="Block height" value="'+((a.mode=='block' && a.lock*1>0)?a.lock:'')+'">';
		h += '<p class="form-control-static small text-muted planAllocNoDate'+((a.mode!='immediate')?' hidden':'')+'" style="margin:0;">No waiting period.</p>';
		h += '</div>';
		h += '<div class="col-sm-4"><label class="small">Amount</label><div class="input-group"><input type="text" class="form-control planAllocAmount" placeholder="0.00" value="'+esc(a.amount)+'"><span class="input-group-addon planAllocPct">&mdash;</span></div></div>';
		h += '<div class="col-sm-1 text-right"><label class="small">&nbsp;</label><br><a href="javascript:;" class="planAllocRemove" title="Remove this portion"><span class="glyphicon glyphicon-minus"></span></a></div>';
		h += '</div>';
		h += '<div class="planAddr planAllocAddress"></div>';
		h += '<div class="small text-muted planAllocSentence"></div>';
		h += '<div class="small text-warning planAllocDupWarn hidden"></div>';
		h += '<a href="javascript:;" class="small planAllocDetailsToggle">Details &#9662;</a>';
		h += '<div class="planAllocDetails hidden"><label class="small">Redeem script</label><textarea class="form-control planAllocScript" style="height:60px;" readonly></textarea><label class="small">Shareable URL</label><input type="text" class="form-control planAllocUrl" readonly></div>';
		h += '</div>';
		return h;
	}

	function cardHtml(b){
		var h = '';
		h += '<div class="panel panel-default planBenefCard" data-bid="'+b.id+'" style="border-left-color:'+b.color+';">';
		h += '<div class="panel-heading">';
		h += '<a href="javascript:;" class="planBenefToggle"><span class="glyphicon '+(b.collapsed?'glyphicon-collapse-down':'glyphicon-collapse-up')+'"></span></a> ';
		h += '<input type="text" class="planBenefName" value="'+esc(b.name)+'" placeholder="Beneficiary name" title="A label for you only — never written to the blockchain">';
		h += '<span class="pull-right"><span class="planBenefSubtotal text-muted small"></span> ';
		h += '<a href="javascript:;" class="planBenefDup" title="Duplicate this beneficiary"><span class="glyphicon glyphicon-duplicate"></span></a> ';
		h += '<a href="javascript:;" class="planBenefRemove" title="Remove this beneficiary"><span class="glyphicon glyphicon-trash"></span></a></span>';
		h += '</div>';
		h += '<div class="panel-body planBenefBody'+(b.collapsed?' hidden':'')+'">';
		h += '<label>Public key</label> <span class="text-muted small">&mdash; the key that will be able to unlock this beneficiary\'s portions (can be <a href="#newAddress">generated in your browser</a> or from their bitcoin client)</span>';
		h += '<input type="text" class="form-control planBenefPubkey" value="'+esc(b.pubkey)+'">';
		h += '<br><div class="planAllocList">';
		$.each(b.allocations, function(i,a){ h += allocHtml(b,a); });
		h += '</div>';
		h += '<button class="btn btn-default btn-sm planAllocAdd" type="button"><span class="glyphicon glyphicon-plus"></span> Add another lock time</button>';
		h += '</div></div>';
		return h;
	}

	function renderBeneficiaries(){
		var h = '';
		$.each(plan.beneficiaries, function(i,b){ h += cardHtml(b); });
		$("#planBeneficiaries").html(h);
		$("#planBenefEmpty").toggleClass('hidden', plan.beneficiaries.length>0);
		initAllocPickers();
		refreshDerived();
	}

	function initAllocPickers(){
		$("#planBeneficiaries .planAllocDatePicker").each(function(){
			var self = this;
			$(self).datetimepicker({format:'MM/DD/YYYY HH:mm', useCurrent:false});
			var x = allocByDom(self);
			if(x && x.a.mode=='date' && x.a.lock*1>=500000000){
				$(self).data("DateTimePicker").date(moment.unix(x.a.lock*1));
			}
			$(self).on('dp.change', function(e){
				var x2 = allocByDom(this);
				if(x2 && e.date && e.date.isValid()){
					if(x2.a.lock != e.date.unix()){
						x2.a.lock = e.date.unix();
						refreshDerived();
					}
				}
			});
		});
	}

	/* ---------- derived refresh (never rebuilds inputs, so focus is preserved) ---------- */

	function findDup(b, a){
		if(!allocConfigured(a)){ return null; }
		var other = null;
		$.each(b.allocations, function(i,o){
			if(!other && o.id!=a.id && o.mode==a.mode && (o.lock*1||0)==(a.lock*1||0)){ other = o; }
		});
		if(!other){ return null; }
		return 'This portion unlocks at the same time as another of '+esc(b.name||'this beneficiary')+'\'s portions &mdash; consider <a href="javascript:;" class="planDupCombine" data-o="'+other.id+'">combining them</a>.';
	}

	function refreshDerived(){
		var base = allocatable();

		$("#planBeneficiaries .planBenefCard").each(function(){
			var card = this;
			var b = benefById($(card).attr('data-bid'));
			if(!b){ return; }
			var sub = 0;

			$('.planBenefPubkey', card).toggleClass('planBadKey', !(b.pubkey=='' || pubkeyOk(b.pubkey)));

			$('.planAllocRow', card).each(function(){
				var a = allocInB(b, $(this).attr('data-aid'));
				if(!a){ return; }
				sub += (a.amount*1 || 0);

				var d = deriveAlloc(b, a);
				$('.planAllocAddress', this).html(d ? ('&rarr; '+d.address) : '&rarr; <i>address appears once the public key and unlock time are set</i>');
				$('.planAllocSentence', this).text(allocSentence(b, a));
				$('.planAllocPct', this).text((base>0 && a.amount*1>0) ? (((a.amount*1/base)*100).toFixed(1)+'%') : '—');

				if(d && d.redeemScript){
					$('.planAllocScript', this).val(d.redeemScript);
					$('.planAllocUrl', this).val(document.location.origin+''+document.location.pathname+'?verify='+d.redeemScript+'#verify');
					$('.planAllocDetailsToggle', this).removeClass('hidden');
				} else {
					$('.planAllocScript', this).val('');
					$('.planAllocUrl', this).val(d ? d.address : '');
					$('.planAllocDetailsToggle', this).addClass('hidden');
					$('.planAllocDetails', this).addClass('hidden');
				}

				var dup = findDup(b, a);
				$('.planAllocDupWarn', this).toggleClass('hidden', !dup).html(dup||'');
			});

			$('.planBenefSubtotal', card).text('total: '+fmt(sub)+((base>0)?(' ('+((sub/base)*100).toFixed(1)+'%)'):''));
		});

		updateLedger();
		renderOverview();
		renderSummaryAndChecklist();
		syncPlanToOutputs(false);
		resetBuildBtn();
		saveDraftSoon();
	}

	/* ---------- ledger ---------- */

	function updateLedger(){
		var bal = vaultBalance(), alloc = allocatedTotal();
		var base = allocatable();
		var rem = base - alloc;
		var va = vaultAddress();

		$("#planLedgerBal").text(fmt(bal));
		$("#planLedgerAlloc").text(fmt(alloc));
		$("#planLedgerAllocPct").text((base>0)?(((alloc/base)*100).toFixed(1)+'%'):'');
		$("#planLedgerRemRow").toggleClass('hidden', !(rem>DUST));
		$("#planLedgerRemLabel").text(va?'Returned to vault':'Unassigned');
		$("#planLedgerRem").text(fmt(rem));
		$("#planLedgerRemPct").text((base>0)?(((rem/base)*100).toFixed(1)+'%'):'');
		$("#planLedgerFee").text(feeBTC().toFixed(8));
		$("#planLedgerFeeSize").text('≈ '+((plan.lastSize*1)||400)+' vB');

		var $st = $("#planAllocStatus");
		if(bal<=0){
			$st.attr('class','small text-muted').text('Load your vault to see what you can allocate.');
		} else if((alloc-base)>DUST){
			$st.attr('class','small text-danger').text('Over-allocated by '+fmt(alloc-base)+' — reduce the portions above.');
		} else if(rem<=DUST && alloc>0){
			$st.attr('class','small text-success').text('Fully allocated.');
		} else {
			$st.attr('class','small text-muted').text(fmt(rem)+' unassigned'+(va?' — anything left over is returned to your vault.':' — assign it; without a vault return address, leftovers would be burned as an oversized fee.'));
		}

		if(va){
			$("#planVaultInfo").removeClass('hidden').html('<span class="glyphicon glyphicon-info-sign"></span> Vault address: <span class="planAddr" style="color:inherit;">'+va+'</span> &mdash; anything not allocated is returned here.');
		} else {
			$("#planVaultInfo").addClass('hidden');
		}
	}

	/* ---------- overview: list + timeline ---------- */

	function renderOverview(){
		var h = '';
		$.each(plan.beneficiaries, function(i,b){
			h += '<p style="margin-bottom:4px;"><span class="planDot" style="background:'+b.color+';"></span> <b>'+esc(b.name||'Unnamed beneficiary')+'</b><br>';
			$.each(b.allocations, function(j,a){
				h += '<span class="small text-muted" style="margin-left:18px;">'+fmt(a.amount*1||0)+' — '+unlockLabel(a)+'</span><br>';
			});
			h += '</p>';
		});
		$("#planOverviewList").html(h || '<p class="text-muted small">Nothing to show yet.</p>');
		renderTimeline();
	}

	function renderTimeline(){
		var rel = (plan.release.mode=='date' && plan.release.lock*1>0) ? plan.release.lock*1 : null;
		var pts = [];
		eachAlloc(function(b,a){
			var t = null;
			if(a.mode=='date' && a.lock*1>=500000000){ t = a.lock*1; }
			else if(a.mode=='block' && a.lock*1>0 && a.lock*1<500000000){ t = blockToApprox(a.lock*1).unix(); }
			else if(a.mode=='immediate'){ t = rel || moment().unix(); }
			if(t){ pts.push({t:t, b:b, a:a, early:(rel && t<rel)}); }
		});
		if(!pts.length){
			$("#planOverviewTimeline").html('<p class="text-muted small">Nothing to show yet.</p>');
			return;
		}
		var min = rel || pts[0].t, max = rel || pts[0].t;
		$.each(pts, function(i,p){ if(p.t<min){min=p.t;} if(p.t>max){max=p.t;} });
		if(rel){ if(rel<min){min=rel;} if(rel>max){max=rel;} }
		var span = (max-min) || 86400;
		var pad = span*0.08;
		min -= pad; max += pad; span = max-min;

		function pos(t){ return (((t-min)/span)*100).toFixed(2); }

		var h = '<div class="planTimelineWrap">';
		$.each(plan.beneficiaries, function(i,b){
			h += '<div class="planTimelineLane"><span class="planTimelineName" style="color:'+b.color+';">'+esc(b.name||'?')+'</span><div class="planTimelineTrack">';
			if(rel){
				h += '<div class="planTimelineShade" style="width:'+pos(rel)+'%;"></div>';
				h += '<div class="planTimelineRel" style="left:'+pos(rel)+'%;" title="Plan takes effect '+esc(fmtDate(rel))+'"></div>';
			}
			$.each(pts, function(j,p){
				if(p.b.id!=b.id){ return; }
				var title = fmt(p.a.amount*1||0)+' — '+unlockLabel(p.a)+(p.early?' ⚠ unlocks before the plan takes effect':'');
				h += '<span class="planTimelineDot'+(p.early?' planEarly':'')+'" style="left:'+pos(p.t)+'%;background:'+b.color+';" title="'+esc(title)+'"></span>';
			});
			h += '</div></div>';
		});
		h += '<div class="planTimelineLane" style="height:16px;"><span class="planTimelineName"></span><div class="planTimelineTrack planTimelineAxis"><span>'+moment.unix(min).format('MMM YYYY')+'</span><span class="pull-right">'+moment.unix(max).format('MMM YYYY')+'</span></div></div>';
		if(rel){ h += '<p class="small text-muted" style="margin:4px 0 0 0;"><span style="color:#d9534f;">|</span> plan takes effect &middot; shaded = before release. A marker inside the shaded area unlocks before the plan takes effect (available immediately on release).</p>'; }
		h += '</div>';
		$("#planOverviewTimeline").html(h);
	}

	/* ---------- review, checklist, build ---------- */

	function shortUnlock(a){
		if(a.mode=='immediate'){ return 'immediately on release'; }
		if(a.mode=='date' && a.lock*1>=500000000){ return 'starting '+fmtDate(a.lock*1); }
		if(a.mode=='block' && a.lock*1>0){ return 'starting around '+blockToApprox(a.lock*1).format('MMM YYYY')+' (block '+a.lock+')'; }
		return '(unlock not set)';
	}

	function planOutputsList(){
		var list = [];
		$.each(plan.beneficiaries, function(i,b){
			$.each(b.allocations, function(j,a){
				var d = deriveAlloc(b,a);
				if(d && (a.amount*1)>0){
					list.push({address:d.address, amount:(a.amount*1).toFixed(8), label:(b.name||'Beneficiary')+' — '+unlockLabel(a)});
				}
			});
		});
		var rem = allocatable() - allocatedTotal();
		var va = vaultAddress();
		if(va && rem>DUST && list.length){
			list.push({address:va, amount:rem.toFixed(8), label:'Returned to vault'});
		}
		return list;
	}

	function buildChecks(){
		var checks = [];
		var bal = vaultBalance();
		checks.push({ok:bal>0, text: (bal>0)?('Vault funds loaded — '+fmt(bal)):'Load your vault above (or enter inputs on the Transaction page)'});
		checks.push({ok:!!releaseSentence(), text:'Release condition set'});
		checks.push({ok:plan.beneficiaries.length>0, text:(plan.beneficiaries.length>0)?'Beneficiaries added':'Add at least one beneficiary'});

		var keysOk = plan.beneficiaries.length>0, portionsOk = plan.beneficiaries.length>0;
		$.each(plan.beneficiaries, function(i,b){
			if(!pubkeyOk(b.pubkey)){ keysOk = false; }
			if(!b.allocations.length){ portionsOk = false; }
			$.each(b.allocations, function(j,a){
				if(!allocConfigured(a) || !((a.amount*1)>0)){ portionsOk = false; }
			});
		});
		checks.push({ok:keysOk, text:'Every beneficiary has a valid public key'});
		checks.push({ok:portionsOk, text:'Every portion has an unlock time and an amount'});

		var base = allocatable(), alloc = allocatedTotal(), va = vaultAddress();
		checks.push({ok:(alloc>0 && (alloc-base)<=DUST), text:'Portions fit within the vault balance (after the network fee)'});
		if(!va){
			checks.push({ok:((base-alloc)<=DUST && alloc>0), text:'Everything allocated — no vault return address is available, so the full balance must be assigned'});
		}
		return checks;
	}

	function renderSummaryAndChecklist(){
		var rs = releaseSentence();
		var h = '';
		if(rs){ h += '<p>'+esc(rs)+'</p>'; }
		$.each(plan.beneficiaries, function(i,b){
			var parts = [];
			$.each(b.allocations, function(j,a){
				if((a.amount*1)>0){ parts.push(fmt(a.amount*1)+' '+shortUnlock(a)); }
			});
			if(parts.length){
				h += '<p style="margin-bottom:4px;"><span class="planDot" style="background:'+b.color+';"></span> <b>'+esc(b.name||'Unnamed beneficiary')+'</b> receives '+esc(parts.join(', '))+'.</p>';
			}
		});
		$("#planSummary").html(h || '<p class="text-muted small">Your plan summary appears here as you fill things in.</p>');

		var t = '';
		var list = planOutputsList();
		if(list.length){
			t += '<table class="table table-condensed small"><tr><th>Output</th><th>Address</th><th class="text-right">Amount</th></tr>';
			$.each(list, function(i,o){ t += '<tr><td>'+esc(o.label)+'</td><td class="planAddr" style="margin:0;">'+o.address+'</td><td class="text-right">'+o.amount+'</td></tr>'; });
			t += '</table>';
		}
		t += '<p class="small text-muted">Transaction lock (nLockTime): '+((plan.release.mode=='date' && plan.release.lock*1>0)?(plan.release.lock+' — '+fmtDate(plan.release.lock*1)):'none (release timing is handled by your monitoring arrangement)')+'. Network fee: '+feeRate()+' sat/vB × ≈'+((plan.lastSize*1)||400)+' vB = '+feeBTC().toFixed(8)+' (size estimated by the Fees page analyser; measured exactly at build). The transaction is built RBF-enabled with non-final sequence numbers, so the lock is enforced and the fee can still be raised at broadcast time.</p>';
		$("#planTechList").html(t);

		var checks = buildChecks();
		var c = '', allOk = true;
		$.each(checks, function(i,x){
			if(!x.ok){ allOk = false; }
			c += '<li class="'+(x.ok?'text-success':'text-danger')+'"><span class="glyphicon '+(x.ok?'glyphicon-ok':'glyphicon-remove')+'"></span> '+x.text+'</li>';
		});
		$("#planChecklist").html('<ul class="list-unstyled">'+c+'</ul>');
		$("#planBuildBtn").prop('disabled', !allOk);
	}

	/* ---------- feeding the Outputs tab (§3.3a — the rollup) ---------- */

	function recalcTotals(){
		var f = 0;
		$("#recipients .amount").each(function(){
			if($(this).val()!='' && !isNaN($(this).val())){ f += $(this).val()*1; }
		});
		$("#totalOutput").html(f.toFixed(8));
		var fee = vaultBalance() - f;
		$("#transactionFee").val((fee>0)?fee.toFixed(8):'0.00');
	}

	function syncPlanToOutputs(strict){
		var list = planOutputsList();

		$("#recipients .planOutput").remove();
		var $first = $("#recipients .recipient:first");
		if($first.hasClass('planFilled')){
			$('.address,.amount', $first).val('').attr('readonly', false).attr('title','');
			$first.removeClass('planFilled');
		}
		if(!list.length){ recalcTotals(); return; }

		/* fill the original template row first — its "+" handler must stay alive */
		if($.trim($('.address',$first).val())=='' && $.trim($('.amount',$first).val())==''){
			$('.address',$first).val(list[0].address).attr('readonly', true).attr('title', list[0].label);
			$('.amount',$first).val(list[0].amount).attr('readonly', true).attr('title', list[0].label);
			$first.addClass('planFilled');
			list = list.slice(1);
		}

		var h = '';
		$.each(list, function(i,o){
			h += '<div class="row recipient planOutput"><br>';
			h += '<div class="col-xs-8"><input type="text" class="form-control address" readonly title="'+esc(o.label)+'" value="'+o.address+'"></div>';
			h += '<div class="col-xs-3"><input type="text" class="form-control amount" readonly title="'+esc(o.label)+'" value="'+o.amount+'"></div>';
			h += '<div class="col-xs-1"></div></div>';
		});
		$("#recipients").append(h);

		if(strict){
			/* an empty leftover manual row would invalidate the build */
			$("#recipients .recipient").not('.planOutput').not('.planFilled').each(function(){
				if($.trim($('.address',this).val())=='' && $.trim($('.amount',this).val())==''){ $(this).remove(); }
			});
		}
		recalcTotals();
	}

	/* ---------- build ---------- */

	function resetBuildBtn(){
		$("#planBuildBtn").removeClass('planConfirm btn-warning').addClass('btn-primary').text('Build Inheritance Transaction');
		$("#planBuildNote").addClass('hidden');
	}

	$("#planBuildBtn").click(function(){
		if($(this).prop('disabled')){ return; }
		if(!$(this).hasClass('planConfirm')){
			$(this).addClass('planConfirm btn-warning').removeClass('btn-primary').text('Confirm — build the transaction now');
			$("#planBuildNote").removeClass('hidden');
			return;
		}
		resetBuildBtn();
		planBuild();
	});

	function planBuild(){
		$("#planResult").addClass('hidden');
		$("#planBuildError").addClass('hidden');

		/* Layer 1: the plan-wide release condition becomes the transaction's nLockTime */
		if(plan.release.mode=='date' && plan.release.lock*1>0){
			$("#nLockTime").val(plan.release.lock*1).trigger('change');
		} else {
			$("#nLockTime").val(0).trigger('change');
		}

		/* RBF-enabled, via the Transaction page's existing option — the fee set now can
		   still be bumped at broadcast time without reconstructing the transaction */
		var rbfWas = $("#txRBF").is(":checked");

		function buildOnce(){
			syncPlanToOutputs(true);
			$("#txRBF").prop('checked', true);
			$("#transactionBtn").click();
			$("#txRBF").prop('checked', rbfWas);
			var h = $("#transactionCreate textarea").val();
			return ($("#transactionCreate").hasClass('hidden') || !h) ? null : h;
		}

		/* pass 1: construct, then measure with the Fees page's estimator */
		var hex = buildOnce();
		if(hex){
			var size = analyzeSizeFromHex(hex);
			if(size>10){ plan.lastSize = size; }
			/* does the plan still fit at the exact fee? */
			if(allocatable() - allocatedTotal() < -DUST){
				$("#planBuildError").removeClass('hidden').text('At '+feeRate()+' sat/vB the network fee is '+feeBTC().toFixed(8)+', which no longer fits — reduce the portions by '+fmt(allocatedTotal()-allocatable())+' and build again.');
				refreshDerived();
				return;
			}
			/* pass 2: rebuild with the exact fee reflected in the change output */
			hex = buildOnce();
		}
		if(!hex){
			var msg = $.trim($("#transactionCreateStatus").text()) || 'The transaction could not be constructed. Check the Transaction page for details.';
			$("#planBuildError").removeClass('hidden').text(msg);
			return;
		}

		built = {hex:hex, fee:$("#transactionFee").val(), rate:feeRate(), size:plan.lastSize, when:moment().format('MMM D, YYYY HH:mm'), signed:''};
		$("#planSignedTx").val('');
		$("#planSignKey").val('');
		$("#planSignError").addClass('hidden');
		refreshDerived();
		renderResult();
		saveDraft();
	}

	function renderResult(){
		if(!built){ return; }
		$("#planResultTx").val(built.hex);
		$("#planResultFee").text(fmt(built.fee)+' ('+built.rate+' sat/vB × ≈'+built.size+' vB)');
		$("#planResultWhen").text('— built '+built.when);
		/* decode the exact bytes about to be signed, reusing the Sign/Verify pages'
		   own decoder - never trust our own bookkeeping over what the tx itself says */
		if(window.decodeTransactionScript){
			window.decodeTransactionScript(built.hex, $("#planSignPreview"));
		}
		renderPackages();
		$("#planResult").removeClass('hidden');
	}

	function renderPackages(){
		if(!built || !built.signed){
			$("#planPackagesWrap").addClass('hidden');
			$("#planPackages").html('');
			return;
		}
		$("#planPackagesNote").text((plan.release.mode=='monitored')
			? 'These packages are intended for your monitoring arrangement — it holds them and delivers each one to its beneficiary when the release condition is confirmed.'
			: 'Give each beneficiary their package now. It cannot be used before the release date, and it becomes void if you ever revise the plan.');
		var h = '';
		$.each(plan.beneficiaries, function(i,b){ h += packagePanel(b); });
		$("#planPackages").html(h);
		$("#planPackagesWrap").removeClass('hidden');
	}

	/* Step 2 — owner signs. This is the Sign page's own mechanism, verbatim:
	   fill its fields, click its button, read its result. No extra signing
	   logic and no assumptions about which of the vault keys is being used. */
	$("#planSignBtn").click(function(){
		if(!built){ return; }
		$("#planSignError").addClass('hidden');

		$("#signPrivateKey").val($.trim($("#planSignKey").val()));
		$("#signTransaction").val(built.hex);
		$("#sighashType").val('1');
		$("#signedData").addClass('hidden');
		$("#signedData textarea").val('');
		$("#signBtn").click();

		/* the Sign page's own success signal */
		var ok = !$("#signedData").hasClass('hidden');
		var signed = $.trim($("#signedData textarea").val());
		$("#signPrivateKey").val('');
		$("#signTransaction").val('');

		if(!ok || !signed){
			$("#planSignError").removeClass('hidden').text('There is a problem with the key or transaction, please check and try again.');
			return;
		}

		built.signed = signed;
		$("#planSignedTx").val(signed);
		$("#planSignKey").val('');
		renderPackages();
	});

	function packageText(b){
		var L = [];
		L.push('WILL-WALLET — INHERITANCE PACKAGE');
		L.push('=================================');
		L.push('Plan: '+plan.name);
		L.push('Built: '+built.when);
		L.push('For: '+(b.name||'Beneficiary'));
		L.push('');
		L.push('WHEN THIS TAKES EFFECT');
		if(plan.release.mode=='date' && plan.release.lock*1>0){
			L.push('This inheritance takes effect on '+fmtDate(plan.release.lock*1)+'.');
			L.push('The transaction below is rejected by the network before that date.');
		} else {
			L.push('This inheritance takes effect when the owner\'s monitoring arrangement confirms the release condition.');
			L.push('This package should be held by that arrangement and delivered to the beneficiary at that time.');
		}
		L.push('This package refers to one specific, still-unspent vault transaction output.');
		L.push('It becomes void if the owner revises the plan, or if that vault output is spent,');
		L.push('consolidated, or swept for any other reason before release - even accidentally.');
		L.push('The owner should not reuse or spend from the vault address once this is distributed.');
		L.push('');
		L.push('YOUR PORTIONS');
		$.each(b.allocations, function(i,a){
			var d = deriveAlloc(b,a);
			L.push('- '+fmt(a.amount*1||0)+' — '+unlockLabel(a));
			if(d){
				L.push('  Address: '+d.address);
				if(d.redeemScript){ L.push('  Redeem script (keep safe — needed to verify and claim): '+d.redeemScript); }
			}
		});
		L.push('');
		L.push('THE TRANSACTION (signed by the owner — the network fee is already included,');
		L.push('and it is RBF-enabled so the fee can be raised at broadcast time if needed)');
		L.push(built.signed);
		L.push('');
		L.push('HOW TO CLAIM (when the time comes)');
		L.push('1. Open the Will-Wallet app (will-wallet.com, or an offline copy of index.html).');
		L.push('2. Verify: paste the transaction on the Verify page to confirm what it pays and when.');
		L.push('3. Sign: on the Sign page, paste the transaction and sign it with the private key authorized');
		L.push('   to complete the inheritance transaction. This may be a signing key shared with other');
		L.push('   beneficiaries, or a key assigned specifically to you, depending on how the owner created');
		L.push('   the vault.');
		L.push('4. Broadcast: after the release date has passed, submit the fully signed transaction on the');
		L.push('   Broadcast page. Portions with their own later unlock date stay locked until that date arrives.');
		L.push('');
		L.push('Important: The key used to complete this inheritance transaction may be different from the');
		L.push('private key used later to spend your individual portions. Each time-locked portion must');
		L.push('ultimately be spent with the private key corresponding to the public key contained in that');
		L.push('portion\'s redeem script.');
		return L.join('\n');
	}

	function packagePanel(b){
		var txt = packageText(b);
		var fn = 'will-wallet-package-'+((b.name||'beneficiary').replace(/[^a-z0-9]+/gi,'-').toLowerCase() || 'beneficiary')+'.txt';
		var h = '<div class="panel panel-default" style="border-left-color:'+b.color+';">';
		h += '<div class="panel-heading"><b>'+esc(b.name||'Unnamed beneficiary')+'</b><span class="pull-right"><a class="btn btn-default btn-xs" download="'+fn+'" href="data:text/plain;charset=utf-8,'+encodeURIComponent(txt)+'">Download package</a></span></div>';
		h += '<div class="panel-body"><textarea class="form-control" style="height:140px;" readonly>'+esc(txt)+'</textarea></div>';
		h += '</div>';
		return h;
	}

	$("#planSignedTx").on('keyup change', function(){
		if(!built){ return; }
		var v = $.trim($(this).val());
		built.signed = v.match(/^[a-f0-9]+$/i) ? v : '';
		renderPackages();
	});

	/* ---------- draft persistence (local only) ---------- */

	function saveDraftSoon(){
		clearTimeout(saveT);
		saveT = setTimeout(saveDraft, 400);
	}
	function saveDraft(){
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({plan:plan}));
			$("#planDraftStatus").text(built
				? ('Built '+built.when+' — edits below are drafts until you rebuild.')
				: 'Draft — saved on this device. Nothing is built until you use Review & Build.');
		} catch(e) { }
	}
	function loadDraft(){
		try {
			var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
			if(d && d.plan && d.plan.beneficiaries){
				plan = d.plan;
				if(!plan.release){ plan.release = {mode:null, lock:0}; }
				if(!plan.feeRate){ plan.feeRate = '1'; }
				if(!plan.lastSize){ plan.lastSize = 400; }
				$.each(plan.beneficiaries, function(i,b){
					if(b.id*1>=uid){ uid = b.id*1+1; }
					$.each(b.allocations, function(j,a){ if(a.id*1>=uid){ uid = a.id*1+1; } });
				});
			}
		} catch(e) { }
	}

	/* ---------- static events ---------- */

	$("#planName").on('keyup change', function(){ plan.name = $(this).val() || 'Untitled Inheritance Plan'; saveDraftSoon(); });
	$("#planVaultSource").on('keyup change', function(){ plan.vaultSource = $.trim($(this).val()); refreshDerived(); });
	$("#planVaultLoadBtn").click(function(){
		$("#redeemFrom").val($("#planVaultSource").val());
		$("#redeemFromBtn").click();
	});
	$("#planFeeRate").on('keyup change', function(){
		plan.feeRate = $(this).val();
		refreshDerived();
	});
	$("#planTechToggle").click(function(){
		var $d = $("#planTechDetails");
		$d.toggleClass('hidden');
		$(this).text($d.hasClass('hidden')?'Show technical details':'Hide technical details');
	});
	$("#planViewList").click(function(){
		$(this).addClass('active'); $("#planViewTimeline").removeClass('active');
		$("#planOverviewList").removeClass('hidden'); $("#planOverviewTimeline").addClass('hidden');
	});
	$("#planViewTimeline").click(function(){
		$(this).addClass('active'); $("#planViewList").removeClass('active');
		$("#planOverviewTimeline").removeClass('hidden'); $("#planOverviewList").addClass('hidden');
	});

	/* release condition cards */
	function syncReleaseCards(){
		$(".planReleaseCard").removeClass('planCardActive');
		$(".planReleaseCard input[type=radio]").prop('checked', false);
		if(plan.release.mode){
			var $c = $('.planReleaseCard[data-mode="'+plan.release.mode+'"]');
			$c.addClass('planCardActive');
			$('input[type=radio]', $c).prop('checked', true);
		}
	}
	$(".planReleaseCard").click(function(){
		var m = $(this).attr('data-mode');
		if(plan.release.mode != m){
			plan.release.mode = m;
			syncReleaseCards();
			refreshDerived();
		}
	});
	$('#planReleaseDatePicker').datetimepicker({format:'MM/DD/YYYY HH:mm', useCurrent:false});
	$('#planReleaseDatePicker').on('dp.change', function(e){
		if(e.date && e.date.isValid() && plan.release.lock != e.date.unix()){
			plan.release.lock = e.date.unix();
			if(plan.release.mode != 'date'){ plan.release.mode = 'date'; syncReleaseCards(); }
			refreshDerived();
		}
	});

	/* beneficiary events (delegated — cards are re-rendered on structural changes only) */
	$("#planBeneficiaries")
		.on('click', '.planBenefToggle', function(){
			var b = benefByDom(this);
			if(!b){ return; }
			b.collapsed = !b.collapsed;
			var $card = $(this).closest('.planBenefCard');
			$('.planBenefBody', $card).toggleClass('hidden', b.collapsed);
			$('span', this).toggleClass('glyphicon-collapse-down', b.collapsed).toggleClass('glyphicon-collapse-up', !b.collapsed);
			saveDraftSoon();
		})
		.on('keyup change', '.planBenefName', function(){
			var b = benefByDom(this);
			if(b){ b.name = $(this).val(); refreshDerived(); }
		})
		.on('keyup change', '.planBenefPubkey', function(){
			var b = benefByDom(this);
			if(b){ b.pubkey = $.trim($(this).val()); refreshDerived(); }
		})
		.on('change', '.planAllocMode', function(){
			var x = allocByDom(this);
			if(!x){ return; }
			x.a.mode = $(this).val();
			x.a.lock = 0;
			var $row = $(this).closest('.planAllocRow');
			$('.planAllocDatePicker', $row).toggleClass('hidden', x.a.mode!='date');
			$('.planAllocBlock', $row).toggleClass('hidden', x.a.mode!='block').val('');
			$('.planAllocNoDate', $row).toggleClass('hidden', x.a.mode!='immediate');
			var dp = $('.planAllocDatePicker', $row).data('DateTimePicker');
			if(dp){ dp.date(null); }
			refreshDerived();
		})
		.on('keyup change', '.planAllocBlock', function(){
			var x = allocByDom(this);
			if(x){
				x.a.lock = ($(this).val().match(/^[0-9]+$/)) ? $(this).val()*1 : 0;
				refreshDerived();
			}
		})
		.on('keyup change', '.planAllocAmount', function(){
			var x = allocByDom(this);
			if(x){ x.a.amount = $(this).val(); refreshDerived(); }
		})
		.on('click', '.planAllocAdd', function(){
			var b = benefByDom(this);
			if(b){ b.allocations.push(newAlloc(remainderSuggestion())); renderBeneficiaries(); }
		})
		.on('click', '.planAllocRemove', function(){
			var x = allocByDom(this);
			if(x){
				x.b.allocations = $.grep(x.b.allocations, function(a){ return a.id!=x.a.id; });
				renderBeneficiaries();
			}
		})
		.on('click', '.planDupCombine', function(){
			var x = allocByDom(this);
			if(!x){ return; }
			var o = allocInB(x.b, $(this).attr('data-o'));
			if(o){
				o.amount = ((o.amount*1||0) + (x.a.amount*1||0)).toFixed(8);
				x.b.allocations = $.grep(x.b.allocations, function(a){ return a.id!=x.a.id; });
				renderBeneficiaries();
			}
		})
		.on('click', '.planBenefRemove', function(){
			var b = benefByDom(this);
			if(!b){ return; }
			if(!window.confirm('Remove '+(b.name||'this beneficiary')+' and all of their portions?')){ return; }
			plan.beneficiaries = $.grep(plan.beneficiaries, function(x){ return x.id!=b.id; });
			renderBeneficiaries();
		})
		.on('click', '.planBenefDup', function(){
			var b = benefByDom(this);
			if(!b){ return; }
			var c = $.extend(true, {}, b);
			c.id = uid++;
			c.name = (b.name||'Beneficiary')+' (copy)';
			c.color = nextColor();
			$.each(c.allocations, function(i,a){ a.id = uid++; });
			plan.beneficiaries.push(c);
			renderBeneficiaries();
		})
		.on('click', '.planAllocDetailsToggle', function(){
			$(this).next('.planAllocDetails').toggleClass('hidden');
		});

	$("#planAddBeneficiary").click(function(){
		$.each(plan.beneficiaries, function(i,o){ o.collapsed = true; });
		plan.beneficiaries.push({id:uid++, name:'', color:nextColor(), pubkey:'', collapsed:false, allocations:[newAlloc(remainderSuggestion())]});
		renderBeneficiaries();
		$("#planBeneficiaries .planBenefCard:last .planBenefName").focus();
	});

	/* the vault balance lives on the Transaction page — refresh whenever it changes there */
	if(window.MutationObserver && document.getElementById('totalInput')){
		new MutationObserver(function(){ refreshDerived(); }).observe(document.getElementById('totalInput'), {childList:true, characterData:true, subtree:true});
	}

	/* ---------- init ---------- */

	loadDraft();
	$("#planName").val(plan.name);
	$("#planVaultSource").val(plan.vaultSource);
	$("#planFeeRate").val(plan.feeRate);
	syncReleaseCards();
	if(plan.release.mode=='date' && plan.release.lock*1>0){
		$('#planReleaseDatePicker').data("DateTimePicker").date(moment.unix(plan.release.lock*1));
	}
	renderBeneficiaries();
});
