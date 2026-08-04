# ROSS Purchase Orders — Design

**Date:** 2026-07-28
**Status:** Design locked (operator-approved, this session). Build not started.
**Slices:** D1 supplier book → D2 draft builder + CSV → D3 send path → D4 food-cost pre-fill
**Supersedes:** backlog card **FC-v2.1c — v2 purchase-order flow**, which scoped the PO *inside* the
food-cost v2 surface. That framing is withdrawn — see §2.

---

## 1. Problem & intent

A restaurant owner orders from suppliers every week. Today the only tool is v1's
`po-modal.js` — 1,386 lines living inside the admin dashboard's Food Cost tab, which
generates an order from stock data, lets you nudge quantities, and downloads a CSV. The
purchase order is never persisted: close the modal and it is gone. There is no supplier
record, no history, no send path, and no way to reorder last week's order.

**Intent:** ROSS gains a first-class ordering destination. An owner builds a purchase
order, exports it or emails it to the supplier, and the sent order becomes history they
can duplicate next week.

**Non-goal:** replacing Food Cost, or absorbing it. Food Cost measures what was consumed;
Purchase Orders decide what to buy. They share data by explicit copy, never by coupling
(§4.3).

---

## 2. Locked decisions (operator, 2026-07-28)

| # | Decision | Rationale |
|---|----------|-----------|
| L1 | **ROSS owns its own supplier + product catalogue.** Food Cost is an optional pre-fill, never a dependency. | A user with zero stock counts must still be able to build and send a PO. This is what makes the separation real rather than a UI claim. |
| L2 | **Lifecycle is `draft → sent`.** Sending freezes the PO; sent POs *are* the archive — read-only history, no separate archived state. No receiving/GRV, no invoice matching. (A transient `sending` status exists for crash-safety only — §7.2.) | Smallest genuinely-useful scope. The history is what unlocks duplicate-to-reorder, which is the actual weekly job. GRV roughly doubles the build and needs someone at the back door to use it. |
| L3 | **ROSS sends the email server-side via SendGrid.** From a verified domain, `Reply-To` the restaurant. | Fully automated, gives a real `sentAt` record, and later becomes an agent-confirmable action. Cost: an SPF/DKIM operator prerequisite (§7 R2). |
| L4 | **Destination now (`/ross.html?tab=orders`), workflow step type later.** | Ships value early and lands the workflow hook on a surface that already works. The step type gets its own spec — explicitly out of scope here (§6). |
| L5 | **Storage is location-scoped**, not uid-scoped — under a new top-level `purchasing/{locId}` node, **not** nested inside `locations/{locId}`. | The supplier book belongs to the restaurant, not to one person's login. Avoids re-running the #199 read/write asymmetry (§3 G6). The top-level placement is forced: `locations/$locationId` cascades a world-readable `.read` and an owner `.write` into every descendant (§3 G14), which would make CF-mediated writes unenforceable and leak supplier data cross-tenant. |
| L6 | **Document format v1 = styled HTML email body + CSV attachment. No PDF.** | No PDF library exists in the repo (§3 G5); adding one is a new dependency and a cold-start cost. `render.js` is seamed so `pdfkit` can be added later if suppliers ask for it. |
| L7 | **Entitlement `features.purchaseOrders`, ON for both Free and All-in at launch.** | Having the entitlement in place means moving it behind All-in later is a config change, not a migration. |
| L8 | **A PO may contain items that are NOT in that supplier's catalogue.** D2's draft builder must let an owner start an order for any supplier and add lines picked from ALL stock items, without touching the catalogue. (Operator, 2026-08-04.) | The backup-supplier case: when the usual butcher can't deliver, you order lamb from someone else *this once*. Ordering from a backup must never silently rewrite who you normally buy from — a catalogue entry means "we normally buy this here", an order line means "we bought this here this time". Conflating them would corrupt next month's suggested order. Uses the same item picker D1.1 built for assignment. |

---

## 3. Ground truth (verified against live code this session)

Every row below was read from the source, not from a KB doc. Re-verify before building —
CLAUDE.md Step 0 write-path rule.

| # | Fact | Evidence |
|---|------|----------|
| G1 | **No supplier entity exists anywhere.** `supplierName` is a free-text string column on each stock item, parsed from the uploaded CSV. No email, no contact, no lead time, no ID. `extractSuppliers()` merely de-dupes the strings. | `public/js/modules/food-cost/data-processor.js:419`, `:846-860` |
| G2 | v1's PO is ephemeral and food-cost-bound: three calculators, supplier-string filter, client-side CSV download, no persistence. | `public/js/modules/food-cost/components/purchase-order/po-modal.js:441-510` |
| G3 | **Server-side order math already exists and is hardened.** `suggestOrder(records, opts)` returns `{itemCode, description, supplierName, currentStock, usagePerDay, orderQty, requiredStock, isCritical, criticalityReason, stockStatus, unitCost, estimatedCost, calculationType, confidence?}`. Live as the `getSuggestedOrder` AUTO-tier agent tool. | `functions/agent/food-cost/suggest.js:238-261` |
| G4 | **Transactional email works.** SendGrid `/v3/mail/send` is already used for welcome mail via `sendgridClient.client`. `@sendgrid/client` is a `functions/` dependency. | `functions/index.js:1106`, `:1250`; `functions/sendgridClient.js` |
| G5 | **No PDF library** in root or `functions/package.json`. **No CSV formula-injection sanitizer exists** anywhere in the repo — the F7 requirement deferred out of D3 is still unbuilt. | `functions/package.json` dependencies; repo-wide grep |
| G6 | ROSS data is uid-scoped (`ross/workflows/{uid}`); food-cost data is location-scoped (`locations/{locId}/stockUsage`). No `suppliers` or `purchaseOrders` node exists. | `database.rules.json`; `functions/food-cost-overview.js:130` |
| G7 | ROSS v2 routes on `/ross.html?tab=playbook\|activity\|people\|run`. Adding a tab is the established pattern. | `public/js/modules/ross/v2/detectors.js:416`, `:509`, `:533` |
| G8 | `callerHasLocationAccess(locationId, uid)` already exists and is the access gate used by `foodCostOverview`. | `functions/food-cost-overview.js:116` |
| G9 | **`suggestOrder` treats records as ordered, not interchangeable.** It sorts by `timestamp`; the **last** record's `stockItems` are the *current stock position*, all earlier records are usage history feeding the statistics. `dataPoints >= 2` unlocks the advanced path; `>= 5` adds a confidence score. | `functions/agent/food-cost/suggest.js:88-96`, `:124`, `:187`, `:258` |
| G10 | **`supplierFilter` silently drops unassigned items.** When a filter is set, items whose `supplierName` is missing or empty are `continue`d — excluded outright, not matched-and-dropped. | `functions/agent/food-cost/suggest.js:169-170` |
| G11 | `foodCostOverview` already reads `locations/{loc}/stockUsage` with `orderByKey().limitToLast(30)` — up to 30 records are in hand on every call. | `functions/food-cost-overview.js:130` |
| G12 | `functions/` is CommonJS (no `"type":"module"`). An ESM `export` passes vitest and `SyntaxError`s at deployed `require()` time. | 2026-06-22 LESSON; `functions/package.json` |
| G13 | The RTDB emulator needs Java, which is not on PATH in this environment. Rules verification is by REST probe. | 2026-07-21 SELF_OPT; `scripts/verify-rules-foodcost-mappings.js` |
| G14 | **`locations/$locationId` grants both `.read: "auth != null"` and a `.write` to the location owner, and both cascade into every descendant.** Any node nested under `locations/{locId}/` is therefore (a) readable by every authenticated user in the system and (b) client-writable by the location owner — a child `".write": false` would be a dead rule. This is why the PO nodes are **top-level `purchasing/{locId}`**, not nested (§5). | `database.rules.json:43-52`; 2026-05-31 + 2026-07-25 rules-cascade LESSONS |
| G15 | `stockFlagAudit/{locationId}` is the existing precedent for a top-level, location-keyed node with access expressed explicitly (`userLocations` OR `locations/…/ownerId`) rather than inherited. | `database.rules.json:251-260` |
| G16 | **Whether an ancestor `.validate` fires for a write to a path BELOW it is an OPEN question in this repo, with three sources disagreeing 2–1.** #205 deferred it to an empirical probe (`scripts/verify-rules-sales-forecast.js` check 9) which **has not yet been run** — its design §8 still says "record the observed status". `scripts/verify-rules-pr1b.js:128-129` asserts in prose that it does **not** fire. **Consequence for §5.1: place every `.validate` at the LEAF, never on an ancestor expecting it to reach down.** Then the design is correct under either answer. | `docs/plans/2026-07-28-sales-forecast-write-cascade-design.md` §8 (origin/master); `scripts/verify-rules-sales-forecast.js:36-51` |
| G17 | **`.validate` does not constrain our own Cloud Functions at all** — the Admin SDK bypasses every rule, `.validate` included. On `purchasing` it constrains only a human admin writing via the client SDK. Worth having as defence-in-depth; not worth overstating. | Firebase Admin SDK semantics; corroborated by #205's "residual admin arm" framing |
| G18 | Re-verified on `origin/master` at `e04eb098` (2026-07-28, after #204/#205/#206): **G14 and G15 both unchanged**, and `"purchasing"` is not an existing key in `database.rules.json` — no collision. #205 fixed the same *class* on `salesData`/`forecasts` but did not touch `locations`. | `git show origin/master:database.rules.json` |

---

## 4. Architecture

### 4.1 Surface

`/ross.html?tab=orders` — a fourth ROSS destination beside Playbook / Activity / People.
Hi-Fi components (`Hf*`, `--hf-*` tokens), Pinia store, the `service.js` + `store.js` +
components split every other v2 tab uses. Three views: **Suppliers · Drafts · Sent**.

### 4.2 Module layout

```
public/js/modules/ross/v2/
  orders-service.js                 # CF calls, no state
  orders-store.js                   # Pinia: supplier book, active draft, history
  components/
    RossOrders.vue                  # tab shell
    RossOrdersSupplierList.vue
    RossOrdersSupplierEditor.vue    # inline editor (People-tab pattern)
    RossOrdersDraftEditor.vue       # the PO builder
    RossOrdersLineRow.vue
    RossOrdersSendPanel.vue         # recipient + preview + confirm
    RossOrdersHistory.vue
    RossOrdersCountPicker.vue       # D4: choose which stock count to pre-fill from

functions/purchase-orders/
  index.js         # 4 CF shells
  catalog.js       # supplier + product CRUD core (pure)
  draft.js         # draft build/validate core (pure)
  render.js        # PO -> HTML + CSV (pure; F7 + HTML escaping live here)
  send.js          # SendGrid dispatch + claim/confirm state machine
  numbering.js     # transactional PO number allocation
  seed.js          # stockUsage -> supplier/catalogue derivation (pure)
  access.js        # thin re-export of callerHasLocationAccess + entitlement gate
```

Pure cores are separated from CF shells deliberately: it is the pattern that made
`functions/agent/**` and `functions/payments/**` unit-testable without an emulator.

### 4.3 The Food Cost boundary, made structural

Food Cost is read in exactly **two** places, both explicit user actions that **copy**:

1. `poSeedFromStock` — populates the supplier book once from the latest count.
2. The draft editor's *"Pre-fill from stock count"* button — calls `suggestOrder()` and
   drops the result into **editable** lines.

After either, the PO owns its numbers. **No PO ever reads `stockUsage` at render or send
time.** The acceptance test for the boundary: delete every food-cost record and the
ordering module still works end to end.

### 4.4 Cloud Functions — four, not ten

The repo already carries 119 functions, and the 2026-07-26 audit found plaintext
credential env vars on every one of them. Adding ten more has a real cost, so these are
action-routed within a surface — a mild, deliberate departure from `ross.js`'s
one-CF-per-verb grain.

| CF | Actions | Why grouped this way |
|----|---------|----------------------|
| `poCatalog` | `listSuppliers`, `saveSupplier`, `archiveSupplier`, `listProducts`, `saveProduct`, `archiveProduct` | Read-heavy, low blast radius |
| `poDraft` | `list`, `get`, `save`, `delete`, `duplicate` | Tenant-writable; capped and validated |
| `poSend` | *(single action)* | **Isolated deliberately** — the one outward-facing, irreversible, side-effectful operation. Own audit record, own rate limit, own state machine (§5) |
| `poSeedFromStock` | `preview`, `commit` | The only place Food Cost is touched. `preview` returns the derivation for review; `commit` writes what the owner ticked |

All four are `onRequest` + CORS + `verifyAuthToken`, matching `foodCostOverview`.

### 4.5 Writes are CF-mediated

`".write": false` on `purchasing/$locId` denies non-admin clients outright, matching the
`ross/agent*` posture shipped in #138. Given #125, #144 and #199 all landed on the
tenant-writable-node class, a client-writable PO node is not worth the review cost.

**This is only expressible because the node is top-level.** Nested under
`locations/{locId}`, the parent's owner-`.write` grant would cascade in and a child
`".write": false` would be a dead rule — the trap named in the 2026-06-02 lesson. See G14
and §5.1.

**Cascade caveat (2026-07-25 LESSON):** the global root admin `.write` at
`database.rules.json:3` still cascades into every node below it. The honest claim is
therefore *"the non-admin arm is closed"* — `.validate` is kept to schema-constrain the
residual admin arm, and the verification probe must be explicitly **non-admin**, since an
admin probe would false-pass through the very cascade being relied on.

---

## 5. Data model

**One new top-level node, `purchasing`, keyed by location.** Not nested under
`locations/{locId}` — see G14: that parent cascades a world-readable `.read` and an owner
`.write` into every descendant, which would both leak supplier data cross-tenant and make
§4.5's CF-mediated-writes rule unenforceable. `stockFlagAudit/{locationId}` (G15) is the
in-repo precedent for this shape.

A single top-level node also keeps the whole feature to **one rules block** with `$locId`
scoping expressed once, and means D1 never edits the `locations` block — which is what
takes most of the R1 collision risk off the table.

```
purchasing/{locId}/suppliers/{supplierId}
  name              string, required, 1..120
  email             string, required for send; RFC-shape validated, <=200
  phone             string?, normalized SA (reuse existing normalizer)
  contactName       string?, <=120
  accountNumber     string?, <=60          # our account number with them
  deliveryDays      number[]?, subset of 0..6
  leadTimeDays      number?, 0..60
  minimumOrderValue number?, >= 0
  notes             string?, <=1000
  active            boolean
  createdAt, createdBy, updatedAt

purchasing/{locId}/catalog/{supplierId}/{productId}
  description       string, required, <=200
  unit              string, required, <=20      # kg, ea, case
  packSize          string?, <=60               # "12 x 500ml"
  itemCode          string?, <=60               # links to a stock item for pre-fill
  lastPrice         number?, >= 0
  lastPriceAt       number?                     # epoch ms
  active            boolean

purchasing/{locId}/orders/{poId}
  poNumber          string                      # "PO-0007", per-location
  status            'draft' | 'sending' | 'sent'
  supplierId        string
  supplierName      string                      # SNAPSHOT, not a join
  supplierEmail     string                      # SNAPSHOT at send
  lines             [{ productId?, description, unit, qty, unitPrice, lineTotal }]
  subtotal          number
  total             number
  currency          'ZAR'
  deliveryDate      string?                     # 'YYYY-MM-DD'
  notes             string?, <=1000
  createdAt, createdBy, updatedAt
  sentAt?, sentBy?, sentTo?
  sendMessageId?    string                      # SendGrid id -> reconcilable later
  source            'manual' | 'foodcost:{recordId}' | 'duplicate:{poId}'

purchasing/{locId}/counters/purchaseOrder       # integer, transaction-allocated
```

### 5.1 The rules block

```jsonc
"purchasing": {
  "$locId": {
    // Read CASCADES down to every child — intended. Copied from stockFlagAudit (G15).
    ".read": "auth != null && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locId).exists() || root.child('locations').child($locId).child('ownerId').val() === auth.uid)",
    ".write": false,               // documentary — see honesty note 1
    "suppliers":  { "$supplierId": { /* LEAF .validate — see honesty note 3 */ } },
    "catalog":    { "$supplierId": { "$productId": { /* LEAF .validate */ } } },
    "orders":     { "$poId":       { /* LEAF .validate */ } },
    "counters":   { "purchaseOrder": { ".validate": "newData.isNumber() && newData.val() >= 0" } }
  }
}
```

There is deliberately **no `.read` on the `purchasing` root**, so nobody can query across
locations; reads authorize at `$locId` or below.

Four honesty requirements. The first two are the 2026-07-25 cascade lesson; the third and
fourth come from re-reading master after #205 (G16/G17):

1. **`".write": false` is documentary, not the control.** Non-admin writes at any depth
   under `purchasing` are denied because **no ancestor grants them** — not because of this
   `false`. Stating it precisely matters: a `false` cannot revoke an ancestor grant.
2. **The residual admin arm cannot be closed.** The global root admin `.write`
   (`database.rules.json:3`) cascades in. So the honest claim is *"the non-admin arm is
   closed"* — never *"the node is closed"*. **The verification probe must therefore be
   explicitly NON-admin**; an admin probe returns 200 through that cascade and reads as a
   false failure.
3. **Every `.validate` sits at the LEAF, never on an ancestor.** Whether an ancestor
   `.validate` reaches a deeper write is an open question in this repo — three sources
   disagree 2–1 and #205's settling probe has not been run (G16). Placing validation at
   the leaf makes this design correct **under either answer**, and removes any dependency
   on a question that has already cost two sessions.
4. **`.validate` does not constrain our Cloud Functions.** The Admin SDK bypasses all
   rules (G17). Here it constrains only a human admin writing via the client SDK — real
   defence-in-depth, but it should not be described as the schema guard for the feature.
   **The load-bearing validation is the CF's Zod boundary** (§5.2); these rules are the
   outer fence, exactly as `verify-rules-foodcost-mappings.js` documents for
   `foodCostMappings`.

The `.read` expression is copied from `stockFlagAudit/$locationId` (G15) — the
`userLocations` OR `ownerId` pair matters: users whose `userLocations` was never populated
would otherwise lose access to their own data (the PR #96 automated-review must-fix).

Four choices worth naming:

- **Supplier fields are snapshotted onto the PO at send time.** Rename a supplier next
  year and last March's PO still shows what was actually sent. A sent PO is a record of a
  communication, not a live view of current data.
- **The catalogue path is nested** (`catalog/{supplierId}/{productId}`) rather
  than a flat node with a `supplierId` field. The only access pattern is "give me one
  supplier's items", so this is a direct path read — no query, no composite index, no
  unbounded fan-out.
- **A sent PO is immutable.** `poDraft` refuses to write any PO whose status is not
  `draft`. Corrections happen by duplicating into a new draft — which is also how the real
  paper trail works.
- **`source` carries the record id**, not just `'foodcost'`, so a sent PO can always
  answer "which stock count was this built from?"

### 5.2 Input caps

Mirroring D2's P5 lesson (tenant-writable dimensions are a self-service DoS vector):
max 200 lines per PO, max 500 suppliers per location, max 2,000 catalogue products per
supplier, max 100 POs returned per history page. Enforced at the Zod boundary in the CF,
before any work.

---

## 5.3 Seed import mechanism (added 2026-08-04, D1.1 + review fold)

D1.1 let the owner attach stock items to suppliers by hand, because a stock CSV
with no supplier column leaves every item unassigned. Two reviews then found the
mechanism below; it is recorded here because §5 is the canonical description of
how this feature writes, and inline JSDoc is not where the next person looks.

**Two identifiers, deliberately distinct.** Each derived row carries both:

| Field | Purpose | Unique per row? |
|-------|---------|-----------------|
| `ref` | opaque positional handle the client sends back in `itemRefs` | **yes**, by construction |
| `key` | content dedupe key for the catalogue (`c:<code>` / `d:<description>`) | **no**, deliberately |

They were one field until it corrupted data. `key` ignores cost centre, and a
stock count routinely counts one item once per cost centre — so two rows with
different unit and price shared a key, and a last-wins lookup silently wrote one
row's figures under the other's selection. **Never identify a row by `key`.**

**`ref` is positional within ONE derivation**, so `commit` round-trips the
preview's `sourceTimestamp` and refuses a stale one rather than binding refs to
rows the owner never reviewed.

**Hand-assignment is a MOVE, not a copy.** An item assigned by hand is excluded
from the supplier it derived under: a catalogue entry means *"we normally buy
this here"* and cannot truthfully point at two suppliers. The genuine
backup-supplier case is an order line — see L8, and do not conflate them.

**PLAN then WRITE.** `commitSeedBook` runs every read, every `ProductInput.parse`
and every cap check (per-supplier `MAX_PRODUCTS`, per-location `MAX_SUPPLIERS`,
per-commit `MAX_SEED_PRODUCTS_PER_COMMIT`, `MAX_PLANS_PER_COMMIT`) *before* the
first write. The write phase must contain nothing that can fail on caller input —
the failure this prevents is a half-written book that every retry reproduces, and
it recurred twice, most recently via the supplier cap enforced inside
`saveSupplier`.

**Plans are coalesced by target.** N selections naming one supplier cost ONE
catalogue read. Before this, 500 selections naming the same supplier passed the
product budget while driving 500 full-catalogue reads.

**Wire contract.** `poSeedFromStock` `commit` takes
`{ locationId, sourceTimestamp?, selections: [{ name? | supplierId?, sourceNames?: [], itemRefs?: [] }] }`,
or the tick-only `{ supplierNames: [] }`. It returns
`{ suppliersCreated, productsCreated, reactivated, ignoredNames, ignoredItemRefs, ignoredCount, truncated }` —
and the client **must render** the ignored/truncated fields, or a zero-effect
import reads as a clean success.

---

## 6. Slices

| Slice | Ships | Depends on |
|-------|-------|-----------|
| **D1** | Supplier book: `poCatalog` + `poSeedFromStock` + Suppliers UI + RTDB rules + REST probe | — |
| **D2** | Draft builder + CSV download + **F7 sanitizer** + `poDraft`. Line-picking must span **all stock items**, not only the supplier's catalogue (L8) — reuse D1.1's filterable multi-select picker | D1 |
| **D3** | Send path: `poSend` (freeze/number/render/dispatch), Sent history, duplicate, resend | D2, **SPF/DKIM** |
| **D4** | Food-cost pre-fill: count picker, staleness guard, unassigned-supplier reporting | D2 |

**Seeding ships with D1, not later** — a supplier book that must be hand-typed is a book
nobody fills. **D2 is independently useful**: build a PO, export it, mail it yourself.

**Out of scope for this spec** (each gets its own): the `purchase_order` workflow task
`inputType` (L4), receiving/GRV (L2), PDF rendering (L6), SendGrid delivery-event webhook
(§7 R5), multi-supplier price comparison per product.

---

## 7. The send path (D3)

### 7.1 Gate order

1. `verifyAuthToken` → uid
2. `callerHasLocationAccess(locationId, uid)` — **fail closed**, with a cross-tenant test (#144 class)
3. Entitlement: `features.purchaseOrders !== true` → 403 (mirrors `foodCostOverview`'s food-cost gate)
4. PO must exist, belong to this location, and be `status: 'draft'`. An already-`sent` PO
   returns its existing result — never re-sends.
5. Validation: ≥1 line, every `qty > 0`, supplier has a valid email, `total > 0`
6. **Rate limit per location per day.** This is not a cost control — without it, any
   authenticated tenant can send arbitrary email to arbitrary addresses through our
   verified sending domain. It is a spam-relay surface.

### 7.2 Claim → send → confirm

Not send-then-stamp. The state machine is `draft → sending → sent`:

1. **Claim.** An RTDB transaction moves `draft → sending`, **aborting if already claimed**.
   Two concurrent sends cannot both proceed.
2. **Allocate** `poNumber` by transaction on `purchasing/{locId}/counters/purchaseOrder`.
   Per-location, gap-tolerant, **never** derived from a count of existing POs.
3. **Render** HTML + CSV from the frozen snapshot (pure `render.js`).
4. **Send** via SendGrid.
5. **Confirm.** Stamp `status: 'sent'`, `sentAt`, `sentBy`, `sentTo`, `sendMessageId`.

This is the same at-least-once window W2 hit (2026-06-11). A crash between claim and
confirm leaves a `sending` record plus, possibly, a delivered email — the reconciliation
rule (check `sendMessageId`; never reconcile from the PO record alone) is documented in
`send.js` the way `process-charge.js` documents its own.

> **Test-fake requirement.** The in-memory RTDB fake used for the transaction tests must be
> the **payments** copy, which implements abort (`committed:false`, prior-value snapshot).
> The billing copy writes unconditionally and always reports `committed:true`, which would
> make the claim guard untestable — the 2026-06-10 note on the fake.

### 7.3 Three injection surfaces, all tenant free text

| Surface | Threat | Control |
|---------|--------|---------|
| **CSV** | Formula injection (F7) — the deferred D3 requirement lands here | Prefix `'` on any cell whose first character is `= + - @`, tab or CR. Pure function in `render.js`, RED-first test with payloads incl. `=cmd\|'/c calc'!A1` |
| **HTML email body** | Renders **in a third party's mail client**, outside anything we control | Server-side HTML-escape on every interpolation of supplier name, item description and notes. No exceptions, no `v-html`-equivalent |
| **Headers** | CRLF injection into subject / display name — the #194 log-injection class: untrusted text into a structured envelope | Reject CR/LF outright; charset + length whitelist, collapsing violations to a literal rather than partially-stripped attacker text |

### 7.4 Sender identity

`From: orders@<verified-domain>`, display name = restaurant name (escaped, length-capped),
`Reply-To` = the restaurant's own address so the supplier's reply reaches the owner.

**"Sent" means accepted by SendGrid, not delivered.** v1 records `sendMessageId` so the
send is reconcilable later; the SendGrid event webhook that would make delivery observable
is carded as a follow-up, not claimed as shipped. This wording is deliberate: the
2026-06-11 lesson is that an accepted send can be silently dropped, and #194's Twilio
status callback is *still* inert for want of an operator env var. Under-claiming here is
cheaper than repeating that.

---

## 8. Food-cost pre-fill (D4)

### 8.1 Which stock count

Per G9, the records are **not** interchangeable: the latest is the *current stock
position*, the rest are usage evidence. So "choose a count" means **choosing which count
is treated as now**, with everything older becoming its history and anything newer
excluded.

Implementation needs no change to `suggestOrder` at all — filter the record set to
`ts <= chosen` and hand it over unmodified.

**Default to latest, always labelled, with an explicit override:**

- The button names the count it will use: *"Pre-fill from stock count — 24 Jul 2026
  (3 days ago), 212 items."* Never an unlabelled "pre-fill".
- **Staleness guard.** If the latest count is older than **14 days**, the button enters a
  warning state and requires one acknowledgement. Ordering against a three-week-old count
  produces confidently wrong quantities — buying to cover stock already consumed. This,
  not the picker, is the real footgun.
- **"Use a different count"** opens a picker over the ≤30 records `foodCostOverview`
  already reads (G11): date, item count, cost %. The genuine use case is *the latest
  upload is bad* — a partial CSV, or a count taken mid-service — and the owner wants the
  last good one.
- The draft stamps `source: 'foodcost:{recordId}'`.

### 8.2 Unassigned suppliers must be reported, not dropped

Per G10, `supplierFilter` excludes items with a missing or empty `supplierName` outright.
Since the CSV's supplier column is free text and frequently blank, pre-filling a PO for
one supplier can quietly omit items that belong on it.

**The draft editor must surface this:** *"14 suggested items had no supplier assigned —
review"*, with the items offered for manual inclusion. Silently vanishing lines are the
`land-where-the-consumer-reads` failure shape — locally correct, globally wrong.

### 8.3 Pre-fill is a copy

Once lines land in the draft, the PO owns them. Re-running pre-fill warns before
overwriting manual edits. Nothing re-reads `stockUsage` at render or send time.

---

## 9. Testing strategy

Pure cores are vitest units with no emulator — the established `functions/**` pattern.

| Guard | Asserts |
|-------|---------|
| Cross-tenant fail-closed | An attacker uid gets nothing for another location's `poId` / supplier / catalogue (#144 class) |
| F7 sanitizer | `=cmd\|'/c calc'!A1`, `+1+1`, `-2-3`, `@SUM(A1)`, leading tab/CR all neutralised; benign cells untouched |
| HTML escaping | `<script>`, `"`, `'`, `&` in supplier name / description / notes escape in the rendered body |
| Header injection | CR/LF in subject and display name rejected; object with throwing `toString` does not 500 (#194 corollary) |
| Send idempotency | Two `poSend` calls on the same PO send exactly once; the second returns the first result |
| Claim abort | Concurrent claim on a `sending` PO aborts (requires the payments-copy fake) |
| Numbering | Sequential per location; gap-tolerant; never derived from a record count |
| Input caps | Over-cap line/supplier/product counts rejected at the Zod boundary before work |
| Boundary | With `stockUsage` deleted, D1–D3 flows still complete end to end |
| Count selection | `ts <= chosen` truncation reproduces `suggestOrder` output for that record as current |
| Unassigned reporting | Items with blank `supplierName` are counted and surfaced, not silently dropped |
| CJS byte-check | No `import`/`export` statements in any new `functions/` file (G12 — vitest cannot see this) |

**Rules verification is a non-admin REST probe** in the shape of
`scripts/verify-rules-foodcost-mappings.js`; the emulator needs Java, absent here (G13).
An admin probe would false-pass through the root cascade (§4.5).

**Operator preview is budgeted, not hoped for.** Every UI-touching PR in this repo's recent
history has needed at least one preview-driven fix round that the automated reviews missed
(validated 3×). Plan for it.

---

## 10. Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | **`database.rules.json` collision with the concurrent security session.** CLAUDE.md marks it single-owner-at-a-time. **Downgraded twice:** the G14 fix means D1 *appends one new top-level `purchasing` block* and edits no existing block; and #205 (that session's rules PR) has now **merged**, so the file is currently free. But the session continues — `receipts` root `.write` is its next item and is Critical — so it will touch the file again. | Coordinate on timing, but the resolution is a rebase, not a redesign. `functions/index.js` is the same class and takes one `exports.` line per CF. |
| R1b | **The G14 finding is a live cross-tenant DISCLOSURE issue that is NOT yet carded**, and it is outside this feature's scope. Everything nested under `locations/{locId}` inherits `".read": "auth != null"` — including `locations/{locId}/stockUsage`, the node `foodCostOverview` reads — so any authenticated user can read any tenant's stock/financial data. **Checked against master at `e04eb098`:** the backlog's `locations` rows cover the **write** side only (HIGH-04 closed; NEW-HIGH-01 = `ownerId`-hijack blast radius, open). The read side is a distinct finding with no row. | **Not this feature's to fix.** Hand the G14 evidence to the security session so it lands as a Bug Triage row there, rather than editing a hot shared file from this branch or widening this build. |
| R1c | **An unresolved repo-wide rules question sits next to this design:** does an ancestor `.validate` fire on a deeper write? #205 deferred it to probe check 9, unrun (G16). | **Neutralised, not inherited** — §5.1 places every `.validate` at the leaf, so D1 is correct under either answer. If the security session does run check 9, record the result; it would also confirm whether `verify-rules-pr1b.js`'s prose note is right and the `rewards` finding is worse than logged. |
| R2 | **SPF/DKIM on the sending domain is an external long-pole** and gates D3 going live. | Start it now if D3 matters — same reasoning that made the WhatsApp template submission an early task in W2. |
| R3 | **Supplier emails are hand-entered.** Nothing in the CSV can derive them (G1). Expect this to be the soak's friction point. | Seeded suppliers land in an explicit `needs-email` state — exportable immediately, emailable once filled. Make the state visible, not a silent failure at send time. |
| R4 | Adding a fourth ROSS tab cuts against the 4-item sidebar that Phase 5 PR 5 deliberately shrank. | Accepted under L4. Revisit when the workflow step type lands and ordering can also be reached from a run. |
| R5 | **Delivery is unobserved.** SendGrid acceptance is not delivery. | §7.4 wording discipline + `sendMessageId` recorded. Event webhook carded as a follow-up. |
| R6 | This is new product scope against a sprint whose stated next moves are W1's next reader and W2's soak. | Operator call. Log against the backlog and sequence explicitly rather than letting it displace the launch gate by accident. |

---

## 11. Backlog reconciliation

- **FC-v2.1c** (v2 purchase-order flow inside food cost) — **withdraw**, superseded by this
  spec. Its F7 requirement is carried forward into D2.
- **FC-v2.1b** (historical stock-counts browser) — **partially satisfied** by D4's count
  picker, which needs the same record-level summary payload. Build once, serve both.
- **FC-v2.1a** (all-items table with cost-centre filter) — unaffected, stays as-is.
