# Interface Design Brief v2 — Inheritance Plan Builder

**Scope:** interface and interaction design only. No implementation detail. This is the agreed spec ahead of build work.

**Grounding:** this is not a new mechanism — it is a new arrangement of two existing screens. `#newTimeLocked` already computes a time-locked address + redeem script from a public key and a date, live, in the browser. `#newTransaction` already loads a vault (Address / WIF key / Redeem Script), lists outputs, and constructs the transaction. Neither underlying function changes. This page is the wiring between them, redesigned around one mental model.

---

## 1. Mental model

> "I am the owner. I am deciding who gets what, and when they can access it. I am not writing a blockchain transaction — the system will handle that once I'm done."

The owner fills out something closer to a will: people, portions, dates. Addresses, scripts, and locktimes are implementation detail the interface produces on his behalf — shown for transparency, never demanded as input.

**Never typed or chosen directly by the user:** raw addresses, Unix timestamps, redeem script hex, key formats, fee amounts.
**Always surfaced instead:** a name, a portion (% and BTC together), a date from a calendar, a plain-English sentence describing the outcome.

---

## 2. Page structure, top to bottom

```
┌───────────────────────────────────────────────────────────┐
│ 0. VAULT SOURCE                                            │
│    Existing Address / WIF / Redeem Script load — unchanged │
├───────────────────────────────────────────────────────────┤
│ 1. PLAN HEADER (sticky)                                    │
│    Plan name · vault balance · allocation indicator ·      │
│    draft status                                            │
├───────────────────────────────────────────────────────────┤
│ 2. RELEASE CONDITION                                       │
│    One question: when does this plan take effect?          │
├───────────────────────────────────────────────────────────┤
│ 3. BENEFICIARIES                                           │
│    The main working area — beneficiary cards               │
├───────────────────────────────────────────────────────────┤
│ 4. PLAN OVERVIEW (toggle: List / Timeline)                 │
├───────────────────────────────────────────────────────────┤
│ 5. REVIEW & BUILD (visually distinct panel)                │
├───────────────────────────────────────────────────────────┤
│ 6. BUILD RESULT — DISTRIBUTION PACKAGE                     │
│    Appears only after a successful build                   │
└───────────────────────────────────────────────────────────┘
```

Sections 0–4 are freely, non-destructively editable in any order. Nothing becomes an artifact until section 5's explicit build. Sections 1–4 sit on a plain background; section 5 sits inside a visually distinct panel (border, subtle shading) signaling "the point of no casual return."

---

## 0. Vault Source

The page begins with the **existing** load flow from the Transaction tab — Address, WIF key, or Redeem Script → Load — completely unchanged. This is where the vault information and available funds come from. No separate vault-creation step exists in this build; the vault is assumed to already exist and be funded.

**Empty state:** until a vault is loaded, sections 1–5 render inert with a single centered prompt: "Load your vault above to begin planning." The allocation indicator shows no numbers (it has no denominator yet). No dead form fields.

---

## 1. Plan Header

A slim, sticky bar showing:

- **Plan name** — editable inline, defaults to "Untitled Inheritance Plan."
- **Vault balance** — the loaded vault's available funds.
- **Allocation indicator** — "62% allocated · 38% unassigned," color-coded: neutral under 100%, green at 100%, red only as a backstop (over-allocation is prevented at entry, not merely flagged). The unassigned remainder is **actionable**: "38% unassigned → assign to…" opens a picker of existing beneficiaries (or creates one).
- **Draft status** — "Draft — saved on this device · nothing built yet" (see §7, Persistence). After a build: "Built Sept 1, 2026 — plan edited since build" when the plan diverges from the last-built artifact.

**Accounting rule (fee & remainder):** allocation percentages refer to what beneficiaries receive. The system handles the rest using the transaction rules that already exist — the network fee is reserved automatically (using the existing fee-estimation guidance), and any deliberately unallocated remainder is handled as a **return/change output back to the vault**, never as a silent fee. The header makes this legible as a three-line ledger, always summing to the vault balance:

```
To beneficiaries        0.83 BTC   (97.6%)
Returned to vault       0.0196 BTC
Network fee (reserved)  0.0004 BTC
```

No manual fee field. No new fee workflow.

---

## 2. Release Condition (Layer 1 — asked once, plan-wide)

One question: **"When should this inheritance take effect?"**

Two large, mutually exclusive choice cards (radio-card style, not a dropdown — a consequential, rare decision deserving visual weight):

- **Card A — "On a specific date."** Calendar date picker. Helper text: *"You keep full control to change this plan any time before this date arrives."*
- **Card B — "When I'm no longer able to manage it."** Short explanation that this requires a monitoring arrangement (check-ins or a trusted party), with a "Learn more" disclosure containing the one sentence that earns the mode: *"Whoever monitors this can never touch the money — at worst they can act early or late."* Helper text: *"This requires an outside party to confirm the right moment — we'll walk you through setting that up separately."*

Once set, the section collapses to a one-line summary ("Release condition: June 2036" / "Release condition: monitored") with an Edit link.

This question is never repeated inside a beneficiary card. Plan-wide timing (Layer 1) and per-portion timing (Layer 2) never share visual space.

---

## 3. Beneficiaries (the core of the page)

### 3.1 Empty state
Before any beneficiary: a single centered prompt — "Who should receive this inheritance?" — with one button: **"+ Add a Beneficiary."** No empty table, no placeholder rows.

### 3.2 The beneficiary card
Each beneficiary is a card, not a table row. Each card has:

- A **colored accent bar** on its left edge — one consistent color per beneficiary, reused everywhere that beneficiary appears (card, timeline, review, distribution package). Color is the fast visual index once there are 4+ beneficiaries.
- **Name** — editable inline. Names are labels only: local to this device/file, never written to the blockchain. The UI states this once, quietly.
- **Running subtotal** — "Kai's total share: 40% (0.34 BTC)" — always visible without expanding.
- **Collapse/expand toggle** — collapsed by default once configured (name + color + subtotal only). Only the card being actively edited is expanded.
- **Overflow menu (⋯)** — "Remove this beneficiary" (confirmation required), "Duplicate" (for similar staggered schedules).

### 3.3 Inside an expanded card

**One field, entered once: the beneficiary's public key** — the exact field from the top of `#newTimeLocked`, unchanged, now living inside the card. Every allocation row beneath is generated against this one key.

Beneath it, one or more **allocation rows**:

```
┌──────────────────────────────────────────────────────────────────┐
│  Unlocks: [ Immediately | 📅 Date | Block ]   Amount: [0.25 BTC ≈ 29%] │
│  → 3MK5JrHhjND…                          [Details ▾] [⋯ Remove]   │
│  → Kai can access this portion starting June 15, 2029.            │
└──────────────────────────────────────────────────────────────────┘
```

- **Unlocks** — three first-class choices, equal visual weight:
  1. **Immediately** — no waiting period; this portion is available as soon as the plan takes effect. An explicit choice, not a blank date and not hidden configuration. (Pays without a time lock; the derived-address line reflects this.)
  2. **On a date** — the existing `#newTimeLocked` date-and-time picker, unchanged, per row.
  3. **At a block height** — the existing toggle, kept per row. Its consequence sentence must still translate: *"…starting around May 2027 (block 900,000)"* — approximate, clearly marked approximate.
- **Amount** — entered in BTC or %, always displayed as both ("0.25 BTC ≈ 29%"). The relationship is always visible; the user never has to choose one representation or convert mentally. Entry that would exceed the unallocated remainder is prevented at input.
- **Derived address** — computed live the instant the key or date changes, using the same function `#newTimeLocked` already calls. Muted, monospace, read-only. Visible for trust; never edited.
- **Details ▾** — per-row disclosure: redeem script and shareable URL exactly as `#newTimeLocked` generates them, including the existing note to save and share the script. Collapsed by default.
- **Plain-English consequence sentence** — generated live from date + amount, at the point of decision.

**Same beneficiary, same date:** two rows with identical unlock settings derive the identical address. The UI nudges — *"these two portions unlock together — combine?"* — and offers a one-click merge, rather than showing two rows that resolve to one address.

**"+ Add another lock time"** sits beneath the list, inside the card — a new row under the same key. A single-allocation beneficiary ("Mimi gets everything on one date") is exactly one date and one amount; the multi-allocation case is the same row, repeated.

### 3.3a How this feeds the Outputs tab
Every allocation row — derived address + amount — becomes one line in `#newTransaction`'s existing Outputs list automatically, the moment the row is complete. The Outputs tab remains, but as a **read-only rollup** populated from the cards, not a data-entry point. The return-to-vault change output (§1) appears there too, labeled. The copy-paste handoff between the two old pages is what this deletes.

### 3.4 Adding a beneficiary
"+ Add a Beneficiary" appends a pre-expanded card with one default allocation already present — 100% of the current unassigned remainder, unlock left for the owner to choose. A brand-new card is never blank; there's always something sensible to edit.

---

## 4. Plan Overview (List / Timeline toggle)

One control, two views of the same data:

- **List view** — flat, read-only recap of every allocation, grouped by beneficiary, same accent colors.
- **Timeline view** — horizontal timeline. The release condition is rendered as a **shaded region on the left** ("nothing can happen before this"), not a mere tick mark. Every allocation is a colored marker at its unlock date, grouped by beneficiary. "Immediately" allocations sit at the release boundary itself. An allocation set earlier than the release condition appears **inside the shaded zone** — visually self-explanatory — flagged in an attention color with an inline note. It never blocks (it may be intentional), but it must be consciously confirmed, not discovered later.

The timeline exists to catch what forms can't: same-date collisions, one child's schedule far more front-loaded than another's, portions inside the dead zone.

---

## 5. Review & Build

Visually set apart from everything above.

1. **Plain-English summary** — generated from the data, grouped by beneficiary in card order with accent colors, release condition stated first, written to be read aloud like a will's dispositive clause: *"This plan takes effect June 2036. Kai receives 25% starting June 2029 and the remaining 75% starting 2036. Mimi receives 100% starting 2031."*
2. **"Show technical details"** disclosure — derived addresses, script summaries — collapsed by default.
3. **Validation checklist** — 100% accounted for (beneficiaries + return + fee), no unresolved fields, release condition set, vault loaded — or a clear list of what's blocking.
4. **Build action** — one prominent button: **"Build Inheritance Transaction."** Disabled with a visible reason until validation passes. On click, a confirmation reiterates: this generates the actual half-signed transaction from the plan as currently configured — the moment the interface shifts from editing a plan to producing an artifact.
5. Rebuilding later is exactly as easy as building the first time. The plan stays editable beneath the result. *(Out of scope for this screen: version tracking, revocation, and redistribution management. Replacing a previously shared transaction is an external transaction-management process — the owner spends the vault UTXO with his own keys, which invalidates every previously shared half-signed copy by consensus, then shares the new artifact.)*

---

## 6. Build Result — Distribution Package

Appears after a successful build, as its own full section — this is what the build step exists to produce.

**One package per beneficiary**, carrying that beneficiary's accent color:

- Their name and total share.
- Their allocations: each portion, its amount, its unlock date, and its plain-language sentence.
- The transaction information they need (the half-signed transaction, redeem scripts, shareable URLs — as the existing screens already produce them).
- **Instructions written for a future, possibly non-technical person**: what this document is, when it becomes usable, what to do with it at that time.

**The package reflects the release mode:**

- **Known-date mode** — framed for the beneficiaries directly: *"Give these to your beneficiaries now. They cannot be used before [date], and become void if you ever revise the plan."*
- **Monitored mode** — framed for the monitoring arrangement: the material is addressed to the monitoring party's process, not presented as something beneficiaries use directly. Copy makes the difference unmistakable.

Save/print/export affordances per package and for the whole set.

---

## 7. Persistence & privacy

- The plan **auto-saves locally as a draft** — surviving closed tabs and later sessions — with the draft status always visible in the header. Building, not saving, is the moment the plan becomes an artifact.
- Beneficiary names and plan structure are application-local labels: stored on this device/file only, never written to the blockchain. Stated once in the UI, quietly, where names are first entered.

---

## 8. Principles for preventing confusion at scale

- **Color-per-beneficiary, unbroken** across cards, timeline, review, and distribution packages.
- **Collapse by default.** Only the actively edited card is expanded.
- **Running totals at every level** — per-beneficiary subtotal, whole-plan ledger in the header.
- **One question per section.** Release condition asked once, globally. Layer 1 and Layer 2 timing never blur into one visual space.
- **Plain-English restatement at every level** — a sentence per row, a paragraph in review, instructions in the package.

---

## 9. Tone and visual language

Professional, calm, unhurried — closer to a bank's estate-planning portal than a crypto wallet. Avoid in primary view: monospace addresses, "UTXO," "script," "locktime," "multisig" (all live behind Details/technical disclosures). Prefer: "portion," "unlocks," "beneficiary," "plan," "takes effect," "returned to vault."

---

## 10. Build order

Build **§3.3 + §3.3a first, for a single beneficiary card**: one public key, N unlock+amount rows, each live-deriving its address and flowing into Outputs, fed by the existing vault-load flow (§0). That is the functional core and the exact wiring between the two existing screens. Then, in order: the multi-beneficiary shell (§3.1, §3.2, §3.4), header accounting (§1), release condition (§2), overview (§4), review/build (§5), distribution package (§6), persistence (§7). Everything after the core is repetition and organization of the one working piece.
