# AI_ARCHITECTURE.md — Read this before modifying Will-Wallet

This file exists for future AI coding agents (and human contributors) working on this
codebase. Will-Wallet has an unusual, deliberate architecture: a self-custody Bitcoin
application with **no backend**, where "offline-first" and "no server holds your keys"
are the entire point, not incidental properties. Several things that would look like
missing features or bugs in a typical web app are intentional here. Read this before
"fixing" anything.

## Before modifying this application, understand these security boundaries

1. **No private key, WIF, or seed value may ever be included in a network request**
   (fetch, `$.ajax`, `XMLHttpRequest`, a URL, a query string, or a `<form>` submission
   to any external endpoint). This includes the public-blockchain API calls and the
   Bitcoin Core RPC calls. Grep for every `$.ajax`/`fetch` call before adding a new one
   and confirm it carries no key material.
2. **No server-side component may be introduced** to "help" with signing, key storage,
   key derivation, transaction construction, or credential handling. If a task seems to
   need a backend, it almost certainly doesn't — re-read this document and the
   in-app [Security & Architecture](index.html#security) page first.
3. **Bitcoin Core RPC credentials are session-only, in browser memory.** Do not add
   persistence (localStorage, cookies, IndexedDB) for `#rpc_user`/`#rpc_pass` without a
   deliberate, explicit decision and user-facing disclosure — this was a conscious
   choice, not an oversight (see `js/wallet.js`, `refreshRpcSettingsVisibility` and the
   RPC settings block in `index.html`).
4. **The Inheritance Plan draft (`localStorage['willwallet_plan_draft']`) must never
   contain a private key.** It stores plan structure only: names, dates, amounts,
   public keys. Verify this invariant still holds if you touch `js/willplan.js`'s
   `plan` object or `saveDraft()`/`loadDraft()`.
5. **Never duplicate signing, key-derivation, script, or transaction-serialization
   logic.** It exists once, in `js/coin.js` (the `coinjs` object, forked from
   OutCast3k's `coinjs`/coinb.in, MIT licensed). Every other file calls into it.
   Adding a second ECDSA signer, a second redeem-script builder, or a second
   transaction serializer is both a maintenance hazard and a security regression
   (two implementations can silently disagree about what a transaction contains).
6. **Never duplicate the transaction decoder.** `decodeTransactionScript(hex, $root)`
   in `js/wallet.js` (exposed as `window.decodeTransactionScript`) is the single
   source of truth for "what does this transaction actually do," used by the Verify
   page, the Sign page's pre-sign review, and the Inheritance Plan builder's pre-sign
   review. If you add another place where a user signs something, reuse this function
   against a new target element — don't re-decode the transaction by hand.

## Architecture at a glance

Will-Wallet is a static site: `index.html` plus `js/*.js` and `css/*.css`, no build
step, no package manager, no server-side code, deployable by copying files to any
static host or opening `index.html` directly from disk. This is intentional — it's
what makes "download and run locally, fully offline" actually true.

```
index.html        one page, many tab-panes (Transaction, Verify, Sign, Broadcast,
                   Settings, Inheritance Plan, Security, About, ...) shown/hidden by
                   Bootstrap tabs + a URL hash router
js/coin.js         the Bitcoin engine ("coinjs"): keys, addresses, scripts, multisig,
                   CLTV, transaction construction/serialization, ECDSA signing
                   (RFC 6979 deterministic nonces), a default public-API client
js/wallet.js       UI glue for every tab-pane above coin.js: the browser wallet,
                   transaction builder, verify/decode, sign, broadcast, settings
                   (including the Bitcoin Core RPC client), fee estimation
js/willplan.js     the Inheritance Plan builder — composes coin.js + wallet.js
                   functionality into a guided flow; does not reimplement any of it
```

### Where each concern actually lives

| Concern | Lives in | Notes |
|---|---|---|
| Key/address generation | `coin.js` (`coinjs.newKeys`, `coinjs.pubkey2address`, etc.) | Entropy mixes `Crypto.util.randomBytes`, mouse movement, timing — see `coinjs.newPrivkey` |
| Multisig | `coin.js` (`coinjs.pubkeys2MultisigAddress`), decoded by `coinjs.script().decodeRedeemScript` | A multisig setup can be created entirely outside this app; only the redeem script / pubkeys+threshold are needed here |
| Timelocks | `coin.js` (`coinjs.simpleHodlAddress` for CLTV; `tx.lock_time` + non-final `sequence` for nLockTime) | Two independent mechanisms — see the in-app Security page for the distinction |
| Transaction construction | `coin.js` (`coinjs.transaction()`, `addinput`/`addoutput`/`serialize`) | `wallet.js`'s `#transactionBtn` handler is the UI wrapper; `willplan.js` drives the same handler, it does not build transactions itself |
| Signing | `coin.js` (`tx.sign`, RFC 6979 `deterministicK`) | UI entry points: `#sign` page and the Plan builder's Step 2 both call the *same* signing path via `#signBtn`'s click handler — the Plan builder simulates a click rather than re-implementing signing |
| Fee calculation | `wallet.js` (`feeStats`, `mathFees`, `#feesAnalyseBtn`'s size estimator) | `willplan.js` reuses the size estimator (`analyzeSizeFromHex`) rather than estimating size itself |
| Blockchain data retrieval | `wallet.js` (`listUnspentDefault`, `rawSubmitDefault`, `feeStats` for the public API; `bitcoinCoreRpcCall`, `rawSubmitBitcoinCoreRPC`, `listUnspentBitcoinCoreRPC`, `feeStatsBitcoinCoreRPC` for the user's own node) | Dispatch is by the `#coinjs_broadcast` / `#coinjs_utxo` `<select>` values, resolved in `configureBroadcast()` / the `#redeemFromBtn` click handler |
| Transaction decoding / review | `wallet.js` (`decodeTransactionScript`, exposed on `window`) | Single implementation, three render targets: `#verifyTransactionData`, `#signTransactionData`, `#planSignPreview` |
| Inheritance plan orchestration | `willplan.js` | Pure composition layer — reads/writes the DOM of the Transaction, Sign, and Fees pages rather than owning any Bitcoin logic itself |

## How Bitcoin Core RPC actually works here

- Config fields (`#rpc_host`, `#rpc_port`, `#rpc_user`, `#rpc_pass`, `#rpc_https`) are
  plain DOM inputs, read at call time by `bitcoinCoreRpcCall()` in `js/wallet.js`.
  Nothing about them is persisted.
- Requests are `$.ajax` POSTs directly from the browser to
  `http(s)://<host>:<port>/`, JSON-RPC 1.0 envelope, with credentials passed via
  jQuery's `username`/`password` options (Basic Auth header) — **never** interpolated
  into the URL or logged.
- `Content-Type: text/plain` is used deliberately (not `application/json`) so the
  request qualifies as a CORS "simple request" and skips a preflight that Bitcoin
  Core's RPC server won't answer anyway (it sends no CORS headers). This does not
  bypass same-origin protections on *reading* the response — it just avoids a
  guaranteed-to-fail preflight. A cross-origin fetch to an RPC server that never sends
  `Access-Control-Allow-Origin` can still fail to have its response readable in some
  browser configurations; the in-app copy explains this to the user rather than
  papering over it.
- Three RPC methods are used, chosen specifically because none requires a wallet
  loaded on the node or `txindex=1`: `sendrawtransaction`, `scantxoutset`,
  `estimatesmartfee`, plus `getblockchaininfo` for the Settings page's connection
  test (which also compares `.chain` against the selected network to catch a
  mainnet/testnet/regtest mismatch).
- The Settings page explicitly warns against exposing RPC to the public internet and
  flags non-localhost hosts. Do not remove these warnings or default to a
  public-facing configuration.

## Data that must never leave the user's device

- Private keys / WIF (any field of `type="password"` in this app)
- Seed/brain-wallet passphrases (the browser wallet's open/login form)
- Bitcoin Core RPC username/password
- Anything derived from the above (signatures are fine to transmit — that's the
  point — but the *key* that produced them is not)

## What requires network connectivity (and what doesn't)

Requires network access: retrieving unspent outputs, retrieving fee-rate estimates
from a live source, retrieving/checking a node's chain and block height, and
broadcasting a signed transaction.

Works fully offline: key/address generation, multisig and CLTV script construction,
raw transaction construction from manually-entered inputs, signing, fee *calculation*
from a chosen rate (as opposed to fee *estimation* from live data), building and
viewing Inheritance Plan drafts, and generating distribution-package text.

If you add a feature, keep it in the correct column. A feature that only formats or
computes something from data already on the page must not silently acquire a network
dependency (e.g., don't fetch live data just to add a nice-to-have field — gate it
behind the existing connectivity mode selection, or make it operate on local input).

## Invariants that must not be broken

- `coin.js` remains the only place Bitcoin protocol logic (keys, scripts, signing,
  serialization) is implemented. `wallet.js` and `willplan.js` are UI/orchestration
  only.
- `decodeTransactionScript` remains the only transaction decoder, callable against
  any target root element.
- Signing is always triggered through the existing `#signBtn` click handler (directly,
  by the user on `#sign`, or simulated from `willplan.js`) — never a second signing
  code path.
- RPC credentials: session-memory only, Basic-Auth header only, never logged, never
  templated into a URL.
- The plan draft in `localStorage` contains no private key material.
- No feature added to this app introduces a requirement for a Will-Wallet-operated
  server. "Optional connection to a service you already trust or control" (the public
  API, or your own node) is fine; "Will-Wallet's own backend" is not part of this
  architecture and should not be added to satisfy a feature request — flag it back to
  the user instead.

## When a change looks like a "fix" — check first

- A blind-signing surface, a missing decoded preview, or a "the app just trusts the
  hex" pattern is worth fixing (and has been, for `#sign` and the Plan builder — see
  `decodeTransactionScript`). Reuse it for any new signing surface rather than
  re-deciding how to display a transaction.
- UTXO fragility (a pre-signed, time-locked transaction becoming invalid if its input
  is spent first) is an inherent property of Bitcoin's UTXO model, not a bug in this
  application. Don't try to "fix" it with a server-side watcher or a new dependency;
  documenting and warning about it (as the Inheritance Plan builder now does) is the
  correct scope of response.
- A stale, hardcoded fee is mitigated here by RBF, not eliminated. Don't assume a
  built transaction's fee is immutable, but also don't assume RBF alone guarantees a
  successful future broadcast — it still requires a capable wallet at broadcast time.
- If a Gemini/GPT/other AI-generated security report treats "hosted on a website" as
  automatically meaning "the website's server sees your keys," that's a
  misunderstanding of this specific architecture (100% client-side JavaScript
  regardless of hosting) — verify claims like this against the actual network
  requests before acting on them, exactly as this document's companion review did.
