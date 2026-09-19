# TRACE — Records & Status Implementation Plan (from Records Review)

> Builds the fixes in `TRACE-platform-records-review.md` (§1.3 fields + §2.3 R1–R5). Scoped from a UI scan of `app/(app)/records/[id]/page.tsx` (tabbed case pane: Case / People & vehicles / Reviews & tasks / Justice / Manage), `components/app/citation-ledger.tsx`, `components/app/status-update-dialog.tsx`, `components/app/assignment-queue.tsx`, `components/app/officer-home.tsx`, `app/(app)/lookup/*`, `lib/actions/citations.ts` (`canManageCitation`, `recordCitationPayment`), `lib/actions/records.ts` (`changeStatus`), `lib/actions/search.ts`, `validations/record.ts` + `validations/admin.ts`. Phases are independently shippable, in dependency order. DB ships via Drizzle migration + `db/sql/Functions&Policies.sql` per the tracker apply order.

## How this maps to the review

| Review item | Phase |
|---|---|
| R2/R3 citation cross-branch receiving + receipts | Phase 1 |
| R1 transition matrix (guards) + R5 originator-clears for citations | Phase 1–2 |
| R3 reconciliation view + exception list | Phase 2 |
| R4 request-vs-approve on 4 sensitive transitions | Phase 3 |
| R5 locate→clear for wanted/missing/property (+ recovery/disposition) | Phase 3 |
| Impound custody fields + release authority (§1.3.3) | Phase 4 |
| Arrest booking slice + incident/accident/property completion (§1.3.4–7) | Phase 5 |
| Analytics + hardening + recertification | Phase 6 |

## Phase 1 — Citation money works from any branch (P0)

**Goal:** Officer A (Lilongwe) issues; Officer B (Blantyre, different branch, not a monitor) receipts payment. Issuer cannot silently mark own ticket paid.

**Schema (Drizzle migration):**
- `traffic_citations`: add `ticket_number TEXT UNIQUE NOT NULL` (backfill `TRACE-<shortid>` for legacy rows), `due_date DATE`, `statute_code TEXT`, `voided_at TIMESTAMPTZ`, `void_reason TEXT`, `void_by TEXT→users.id`.
- `citation_payments`: add `payer_name TEXT NOT NULL DEFAULT ''` (then drop default), `payment_method TEXT (cash/mobile/bank)` NOT NULL, `channel TEXT (counter/mobile/clerk)` NOT NULL, `receiving_branch_id UUID→branches.id` NOT NULL, keep `receipt_no UNIQUE`, `received_by`. Never UPDATE/DELETE (existing rule — extend CHECK).
- `Functions&Policies.sql`: CHECK `payment_method/channel` enums, CHECK void requires `void_by + void_reason`, RLS: any active in-domain police user may INSERT payment against any citation they can look up by ticket/plate.

**Validation (`validations/admin.ts`, `validations/record.ts`):**
- Extend `citationPaymentSchema`: `payerName (min 2)`, `paymentMethod enum`, `channel enum`, `receivingBranchId (uuid, server-overridable to viewer's branch unless monitor)`. Keep amount cap + overpayment rule.
- Extend `trafficCitationSchema`: `statute_code?`, `due_date?` (filing), `ticket_number` server-generated (never client-supplied).
- New `citationVoidSchema`: `recordId + reason (min 10)` — monitor-only, countersigned.

**Actions (`lib/actions/citations.ts`):**
- Replace `canManageCitation` for *payments* with `canReceivePayment`: any `OFFICER/DISTRICT_MONITOR/COUNTRY_MONITOR` in same domain (ignore branch/district for payments; keep `canViewRecord` for reading the case file itself). Record `receiving_branch_id` = viewer's branch (officer) or selected in-scope branch (monitor).
- Self-receipt guard: if `record.reportedBy === scope.id`, require `note` contains second-user confirmation OR route: throw `Needs countersign — ask a monitor or a second officer to receipt this ticket.` (simplest: block + monitor override flag `countersignedBy`).
- `recordCitationPayment` stamps `received_by = scope.id`, writes audit `record_updated` → change to new `payment_received` action type (add to `auditActionTypeEnum`), notifies filer with receiving branch + receipt.
- New `voidCitation` (monitor-only, sets `voided_at/reason/by`, audited, stays queryable, excluded from balance).
- `getCitationLedger` returns new fields (ticket no, statute, due, payer/method/channel/receiving branch per payment, void banner).

**UI (scan-grounded):**
- `components/app/citation-ledger.tsx` — Payments form: add `Payer name*`, `Method*` (select), auto `Receiving branch` label (viewer's branch, read-only for officers), keep amount + auto receipt + note. Ticket header: show real `ticket_number` (replace `TRACE-<slice>` fallback), statute, due date + overdue chip, void banner. Payment rows: show payer · method · receiving branch · receiver name.
- `app/(app)/records/[id]/page.tsx` Justice tab: ledger stays here; add "Find ticket to receipt" hint linking to lookup.
- `app/(app)/lookup/*`: add **ticket-number search** (alongside plate/ID) calling existing `searchVehicles`-style path → new `findCitationByTicket` action (any in-domain police user, audited `record_viewed`-light). This is what makes any-counter receiving possible without branch-feed access.
- `components/app/record-form/*` (citation fields): add statute_code + due-date inputs (optional at filing, monitor-editable later).

**Accept:** test 1–2 in review §4 pass (cross-branch full + split payment; overpay rejected; issuer self-receipt blocked; void stays queryable). `pnpm test:visibility` green + new ledger tests (partial/overpay/void/cross-branch).

## Phase 2 — Transition guards + reconciliation view (P0)

**Goal:** status cannot outrun evidence; money reconciles daily.

**Actions (`lib/actions/records.ts` `changeStatus`):**
- Add `assertTransitionAllowed(record, toStatus, ctx)` per review R1 table: citation→`resolved` requires (`balance = 0` OR court outcome ∈ dismissed/withdrawn/acquitted) AND not void-pending; wanted→`resolved` requires locate note + (linked arrest OR warrant recall); missing→`resolved` requires locate + originator confirm; impound→`resolved` requires `hold=released` (Phase 4 field, gate skipped until then — instead require release note); property `closed` requires disposition. Return 422 naming the missing evidence.
- Originator-clear (citation slice): court dismissal resolves without payment; payment alone sets `is_paid` but `resolved` still requires monitor or originator confirm (keeps R5 shape).
- New audit types: `payment_received`, `citation_voided`, `status_rejected` (guard trip, helps monitors see friction).

**UI:**
- `components/app/status-update-dialog.tsx`: make `reason` **required** for resolved/closed/archived; show per-type requirement hint (e.g. citation: "needs zero balance or court dismissal"); surface server 422 message inline (missing-evidence text) instead of generic toast.
- Record Manage tab (`[id]/page.tsx`): disable/grey invalid target statuses with tooltip (needs ledger/locate state — pass `transitionHints` from new `getTransitionHints(recordId)` action).
- New monitor view `app/(app)/reconciliation/*` + `components/app/reconciliation-board.tsx`: per-receiver daily totals (amount, count, receipts) vs deposit input; exception lists: issued-but-undeposited >5d, paid-but-unreconciled, voids without countersign, receipts out of sequence. Reuse `AnalyticsFeed` card styling + CSV export pattern (U6 done). District monitors see own district; country monitors national.
- `CitationLedger`: balance-due banner doubles as "why Resolve is disabled" link.

**Accept:** cannot resolve citation with balance >0 (422 names balance); reconciliation board shows seeded cross-branch payments correctly; review §4 test 3 passes.

## Phase 3 — Request-vs-approve + locate→clear (P1)

**Goal:** the 4 sensitive transitions need two humans; finding ≠ closing.

**Schema:** no new tables — reuse `case_assignments` + `case_reviews`. Add `records.locate_state TEXT (none/located/confirmed)` nullable + `locate_report JSONB {by, at, place, note}` (or store first locate as a typed review — prefer columns for queryability). Add CHECK: `locate_state` only on wanted/missing/property/vehicle types.

**Actions:**
- New `reportLocate(recordId, {place, note})` (any in-scope officer; sets `located`, audited, notifies originator + monitors) and `confirmLocate(recordId)` (originating-branch officer or monitor; sets `confirmed`, unblocks `resolved`).
- `changeStatus` gate update: wanted/missing/property `resolved` requires `confirmed`; approver ≠ requester enforced via last-locate `by` vs confirmer (or assignment requester vs completer). Reuse `assignments.ts` `completeAssignment` for the approve step where a task exists.
- Extend `auditActionTypeEnum`: `locate_reported`, `locate_confirmed`, `disposition_approved`.

**UI:**
- Record Reviews & tasks tab: "Report locate / found / recovered" button (officer) → locate form (place + note + optional photo via existing attachments pipeline); originator/ monitor sees "Confirm locate" button; status dialog shows locate state chip.
- `assignment-queue.tsx` + Tasking section: monitor assigns "verify locate" task with due date (existing F9 flow); completing it = confirm step.
- Stolen property: recovery form adds `disposition` select (held/returned/destroyed/auctioned) on close.

**Accept:** review §4 test 4 passes (Branch B locate, Branch A confirm, single-actor resolve rejected); dormant-locate list (located >7d unconfirmed) visible to monitors.

## Phase 4 — Impound custody (P1)

**Goal:** impound record proves where the car is, who ordered the hold, who may release, and that the owner was told.

**Schema:** `vehicle_impoundment` projection (new `impound_custody` table FK→records, 1:1): `tow_company, lot_location, bay, hold_authority_id→users.id, hold_basis TEXT, owner_notified_at TIMESTAMPTZ, release_auth_id→users.id, release_at TIMESTAMPTZ, id_checked TEXT, fees_snapshot NUMERIC`. `hold_state (held/released)` derived from `release_at`. Never UPDATE release row — corrections are new rows + audit.

**Actions:** `placeHold` (supervisor/investigator at impound), `authorizeRelease` (hold authority or delegate chain + district monitor; dual-sign with recipient name + ID; audited `hold_released`; triggers `vehicle_cases`/flag refresh + owner notification task), `recordOwnerNotice`.

**UI:**
- Filing wizard impound step (`record-form/fields.ts` + `dynamic-fields.tsx`): tow company, lot/bay, hold basis.
- Record Justice/Manage tab: custody card (lot map link pattern from geo-capture, hold authority, notified-at, fees), "Authorize release" form (recipient + ID check) gated to hold authority/delegate; release attempted by unauthorized user → 403 with "only X or district monitor may release" message.
- Registrar/lot view: daily lot-vs-RMS list (mirrors Lakewood release-report pattern).

**Accept:** review §4 test 5 passes; every active impound has hold owner + review date (VOI discipline from F6).

## Phase 5 — Record-completion pass: arrest, incident, accident, property (P1)

**Goal:** close the §1.3 field gaps without new record types.

- **Arrest:** `arresting_officer_id FK` (picker from `listAssignableUsers`, not free text — keep text as fallback display), `booking_no`, `custody_status (in_custody/released_on_bail/handed_to_court)`, `prosecutor_decision`. Filing form + People tab show custody chip; disposition review warns if arrest-linked wanted lacks arrest id (Axon pattern).
- **Incident:** `offense_code` (statute picker, shared with citation/vehicle_offense), victims/witnesses → structured `{name, contact, statement_ref}` (migrate legacy string arrays read-compatibly), auto-suggest assignment creation on filing for serious codes.
- **Accident:** per-vehicle `driver_name + insurance snapshot (policy_id + insurer + coverage at crash time)`, `severity`, `road/weather` selects. Snapshot frozen at filing (policies may lapse later).
- **Property:** `recovery_report {date, place, by}`, `disposition` enum + custodian alerts (BJA §6.5 timed-event pattern via assignment due dates).
- **Vehicle offense:** `statute_code`, `is_criminal`, `court_appearance_required` driving court-scheduling visibility.
- All: Zod extensions backward-compatible (optional at first, required-after-date flagged in UI), `writeCodedProjections` preserves new columns across edits (F3 pattern), filing wizard shows inline "why this matters" hints (court/fine/insurance use).

**Accept:** per-type checklist in review §1.2 flips to useful; type-driven required-field tests green.

## Phase 6 — Trust, analytics & hardening (P2, parallelizable after Phase 2)

- **Reconciliation analytics:** citations issued/paid/overdue, collection rate by district/branch/receiver, void rate, days issue→deposit; keep `<5` suppression; CSV export (extend U6 drill-down).
- **Role→ability matrix + recertification:** static matrix doc (who holds `receive_payment`/`release_hold`/approve), admin screen showing grants, periodic review prompt (Mark43 Scottsdale lesson); kill any shared/counter accounts (per-cashier identity required for R3).
- **Search & numbering:** ticket_number in unified search (F5 trigram index), receipt sequence-gap detector, ANPR plate endpoint unchanged.
- **DB hardening:** CHECKs for new enums, RLS tests per role (issuer/receiver/monitor/liaison/auditor), denied-transition tests, seed packs: cross-branch ledger, locate→confirm chain, hold→release chain, void + exception rows.
- **SMS later:** receipt-by-SMS + complainant updates ride on N1 gateway (F11) — do not block Phases 1–5 on it.

## Build order & dependencies

```
Phase 1 (citation any-branch money + ticket search)
  └─ Phase 2 (guards + reconciliation board)
       ├─ Phase 3 (locate→clear + request-vs-approve)
       ├─ Phase 4 (impound custody)
       └─ Phase 5 (arrest/incident/accident/property fields)
            └─ Phase 6 (analytics/hardening — can start after Phase 2)
```

Each phase ships migration + actions + UI + tests + seed together; never ship schema without its guard/UI (avoids unenforced columns). Suggested demo after each phase: P1 "pay in Blantyre what Lilongwe issued"; P2 "unreconciled cash has nowhere to hide"; P3 "finding isn't closing"; P4 "the lot matches the system"; P5 "every type stands up in court".
