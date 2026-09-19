# TRACE — Are the Records Useful Enough? + Cross-User Status Management Review

> Direct answer to: (1) are TRACE's records useful enough in the real world, and (2) how should status changes work when a *different person, at a different place* completes the record (e.g. citation paid elsewhere, impound released elsewhere). Benchmarked against real peers: Florida UTC + TCATS + DAVID, NC eCitation, TraCS / Indiana eCWS, BJA Standard Functional Specs for Law Enforcement RMS v2, Axon Records case/disposition workflows, Mark43 RMS, NCIC Wanted/Missing/Vehicle files, municipal-court cash-handling audits (College Station, Anchorage, Missouri, Utah, Fulton County), and CHP/Lakewood/Tallahassee/Juneau impound procedures. Last verified against `trace-web` source (db/schema/*, validations/*) 2026-09-19.

## 0. Verdict in one page

1. **Record shapes: mostly useful, not yet operationally complete.** The 10 `record_type`s cover the right real-world surface (peers cover the same: persons, vehicles, incidents, arrests, citations, accidents, impounds, property). But almost every type is missing 2–5 fields that peers treat as mandatory, and 3 lifecycle tables are missing entirely (fine accounting beyond a ledger, impound custody/release, booking/custody for arrests). TRACE's shared `vehicles` / `persons_of_interest` / `insurance_policies` / `court_case_access` model is *better* than many peers (which keep these in separate silos) — keep it.
2. **Status management is the bigger risk — and the user's instinct is correct.** Today TRACE has one generic `status (active/resolved/closed/archived)` on `records` + a `citation_payments` ledger (F3, derived `is_paid`). That is not enough for the real workflow: **the issuer ≠ the completer, and the place of issue ≠ the place of completion.** Every peer solves this the same way:
   - **Separate the lifecycle state from the case state** (citation `status` vs fine `balance`; impound `hold` vs case `status`; wanted `locate` vs `clear`).
   - **Separate the duties by role** (officer issues, clerk/cashier receipts, supervisor/records reviews closure, court records disposition).
   - **Make completion payable/recordable from anywhere, reconcilable centrally** (unique numbered receipts, per-cashier daily reconciliation, originate-vs-locate agency discipline).
3. **Recommended fix is small and concrete:** keep the 10 types, add ~15 fields + 2 small tables, replace the single generic status with a **per-type transition matrix**, and add **two permissions** (receive-payment, release-hold) that any in-scope police user can hold — so a citation issued in Lilongwe can be paid in Blantyre by a different officer without breaking audit or allowing the issuer to mark their own ticket "paid".

---

## 1. Q1 — Are the records useful enough in the real world?

### 1.1 Method

For each TRACE type, compared `validations/record.ts` + `db/schema/coded.ts` projections against what peers actually store and transmit (Florida eCitation ICD 6.1 / TCATS ICD 6.0.1 field lists, NC eCitation clerk component, BJA RMS §§6.3/6.5/9.4, Axon disposition model, NCIC file retention/clear rules, CHP-180 impound report).

### 1.2 Per-type assessment

| TRACE record_type | What TRACE stores today | What peers store that TRACE lacks | Verdict |
|---|---|---|---|
| `missing_person` | name, age, sex, national_id?, last-seen place/date, reporter + relationship + contact, optional GPS | **reporter statement signature, reporting delay reason, NCIC-style entry category (juvenile/endangered/involuntary/disaster), locate-vs-clear distinction, photo mandatory-optional flag, dental/medical/descriptor block** (NCIC Missing Person File retains indefinitely until originate-agency clear/cancel; locate by another agency retires it with `$.L` notice) | Useful as intake, weak as lifecycle. Add `entry_category`, `locate_report` (who/where found), keep indefinite retention until cleared by originating branch. |
| `wanted_person` | name, national_id?, offense, danger_level, warrant_no?, last-known location, description | **warrant status (applied/issued/recalled), extradition limits, hit-confirmation (YQ/YR) discipline, temporary-felony 48h rule, arrest-link mandatory on clear** (NCIC Wanted File; Philadelphia PD: only entering agency can cancel; Axon: disposition review warns if arrest missing) | Useful. Add `warrant_status`, `extradition_limits`, require `linked_arrest_record_id` (or reason) before `resolved`. |
| `stolen_property` | description, category, value?, serial?, location/date, owner + contact | **NCIC article-file fields (brand, model, VIN/serial validation), recovery/clear path, pawn-shop cross-check flag, disposition (held/returned/destroyed/auction)** (BJA RMS §6.5 property disposition + timed custodian alerts) | Barely useful for recovery. Add `recovery_details` (date/place/recovering officer), `disposition` enum, keep property-custody alerts. Without a recovery path this type is write-only. |
| `crime_incident` | type, description, location/date, victims[], witnesses[], linked_person_ids[] | **NIBRS/UCR offense coding, victim/witness structured records (not bare strings), MO/weapon/injury blocks, solvability factors, case-folder link (incident → case auto-create)** (Mark43 NIBRS compliance engine; Axon: case auto-created from incident, routed to unit inbox) | Useful as occurrence-book entry, not as investigation file. Upgrade victims/witnesses to structured objects; add `offense_code` (statute); auto-suggest case assignment (F9 already exists — wire it). |
| `arrest_record` | person link?, name, charges[], location/date, arresting_officer (free text), linked_wanted_id? | **Booking record (intake/release events, holding area, custody reason/time), arresting officer as user FK (not text), Miranda/force-use flags, prosecutor accept/decline, bond** (Mark43 booking/jail lifecycle; BJA RMS §9.4 release use case; Axon: arrest-missing warning on disposition review) | Weak — free-text officer + no custody trail will fail court admissibility. Add `arresting_officer_id` (FK), `booking_no`, `custody_status (in_custody/released_on_bail/handed_to_court)`, `prosecutor_decision`. This is F8 (booking) — smallest slice is just these 4 fields. |
| `missing_vehicle` | plate, make/model/color?, last-seen place/date, reporter + contact | **NCIC vehicle-file fields (VIN mandatory-optional, year, style), stolen-vs-missing distinction, recovery notice to owner + NCIC cancel, insurance-claim flag** | Useful. Add `chassis_number` (already on vehicle row — surface it at filing), `recovery_report`, auto-unflag on resolve (already partially via `is_flagged` trigger — keep). |
| `vehicle_offense` | plate, offense_type (free text), description, location/date, linked_crime_id? | **Statute/section code, penalty class, points, mandatory-court-appearance flag, officer signature/certification** (Florida UTC: criminal-indicator, aggressive-driver flag, officer delivery verification; TCATS criminal vs civil split) | Weak without statute coding. Add `statute_code`, `is_criminal (bool)`, `court_appearance_required (bool)`. Free-text offense alone cannot drive court scheduling or fine tables. |
| `road_accident` | location/date, description, cause?, vehicles[{plate, role}], fatalities/injuries, GPS | **Crash-report standard (HSMV 90010S / TraCS MMUCC fields: severity, junction, weather, restraint, alcohol-suspected, diagram), per-vehicle driver + insurance snapshot, investigator conclusion** (TraCS: ~750 keystrokes saved per crash via scan + standard schema; Florida DAVID driver/vehicle instant retrieval) | Useful for counting, weak for investigation/insurance. Add `severity`, `weather/road_condition`, per-vehicle `driver_name + insurance_policy_id snapshot`. Snapshot matters: policy may lapse after the crash. |
| `traffic_citation` | plate, driver_name?, license_no?, violation (free text), fine_amount, location/date_issued, GPS → projection `traffic_citations{violation, fine, is_paid, court_date, court_id}` + `citation_payments{amount, receipt_no, note, received_by}` | **Uniform ticket number (pre-numbered, inventoried), statute/section, court date+time+venue at issue, due date, payment method + payer identity, partial-payment handling, clerk disposition feed (paid/dismissed/convicted/nolle), DMV/BMV points transmission** (Florida UTC Procedures Manual §§316.650/318.14: 5-day court deposit, numbered books, clerk-only disposition, TCATS ADD→UPDATE lifecycle; NC eCitation: clerk browser component + court-date scheduling; Indiana Odyssey: citation→court→BMV electronic transmission) | **Closest to useful, but not revenue-safe yet.** Ledger exists (good) but missing: ticket number, statute, due date, payer name, payment method/channel, void path, clerk reconciliation. See §2 — this is the type that most needs the cross-user fix. |
| `vehicle_impoundment` | plate, reason (free text), impound_location, impounded_date, release_conditions? | **Tow company + lot + bay, VIN/condition/inventory photos, hold authority (who ordered hold + legal basis), notification to owner/lienholder (certified letter + date), fees accruing, release authorization (who signed + ID checked), auction/disposal path** (BJA RMS §6.3 Vehicle Impound use case; Lakewood: hold only releasable by investigator signature + daily release report + RMS + CCIC/NCIC cancel; Tallahassee GO-64: supervisory permission for hold, named releasers; Juneau: supervisor approval for evidence impounds; CHP-180: amend-by-memo, never silent edit) | **Not yet useful as custody record.** Current shape proves *a* tow happened; it cannot prove *where the car is, who may release it, or that fees/notices were handled.* Add the 6 fields below (§1.3). |

Shared entities:

| Entity | Assessment |
|---|---|
| `vehicles` (plate unique, make/model/year/color/chassis/engine, owner block, `is_flagged`, `is_verified` + verify-in-place) | **Genuinely good — better than several peers.** Verify-in-place (officer ad-hoc → registrar enrich, ID stable) avoids the duplicate-row disease commercial VRM feeds have. Missing only: `vin` alias clarity (chassis_number exists — document it as VIN), `vehicle_style/year` validation, `status_snapshot` (impounded/stolen sue). Keep. |
| `persons_of_interest` | Adequate. Peers add biometric/national-ID verification badge + merge history (F5/F12 already planned). Keep + wire merge audit. |
| `insurance_policies` (per-vehicle unique policy no, live-date logic, bulk CSV F7 done) | Good. Peers (Nebraska model) do VIN-matched bulk files + exception queues — TRACE now has this (F7). Missing only: `receipt/coverage snapshot` on accident/citation (policies lapse; the case must freeze what was true that day). |
| `court_case_access` + `referral_documents` (grant + 90d expiry + outcome + tranches + SLA) | **Stronger than most RMS peers** (Mark43/Motorola treat judicial sharing as a package export; TRACE has a live scoped grant — closer to CDPP Referrals Gateway). Missing only: downstream transmission (court → registry/DMV points) per Indiana Odyssey pattern — strategic, not blocking. |
| `case_assignments` + `case_reviews` (F9) | Good — matches Axon triage→assign→active→review→disposition→closure. Wire assignments as *required* before closure for serious types (see §2.4). |

### 1.3 Minimum field additions to become "real-world useful" (no new record types needed)

Do **not** add new record types yet (no GBV/cyber/forensics module — peers agree these are separate builds). Instead add these fields to existing types:

1. **All vehicle-bearing types:** `statute_code` (vehicle_offense, citation), `ticket_number` (citation, pre-numbered + inventoried per Florida UTC model).
2. **Citation:** `due_date`, `payer_name`, `payment_method (cash/mobile/bank)`, `payment_channel (counter/mobile/clerk)`, `void_reason` (spoiled-ticket path — Florida requires accounting for *every* numbered ticket including spoils).
3. **Impoundment:** `tow_company`, `lot_location + bay`, `hold_authority (user FK + legal basis)`, `owner_notified_at`, `release_authorization (user FK + id_checked)`, `fees_owed_snapshot`.
4. **Arrest:** `arresting_officer_id` (FK, not text), `booking_no`, `custody_status`, `prosecutor_decision`.
5. **Incident:** `offense_code`, structured victims/witnesses (name + contact + statement-ref, not bare strings).
6. **Accident:** per-vehicle `driver + insurance snapshot`, `severity`, `road/weather` enums.
7. **Stolen property:** `recovery_report`, `disposition (held/returned/destroyed/auctioned)`.

None of these requires a migration larger than the F3/F4 pattern already used (projection columns + Zod extension + `writeCodedProjections` preservation).

---

## 2. Q2 — Status management when a different person, elsewhere, completes the record

### 2.1 The problem, stated generally

TRACE's current rule is **originator-centric**: officers edit own filings while `active`; monitors edit anything in scope; `status` is one generic enum. Real operations are **completer-centric**:

| Scenario | Issuer / originator | Completer (different person, different place) | What must the system guarantee? |
|---|---|---|---|
| Citation fine paid | Traffic officer at roadside (Lilongwe) | Driver pays at another station/counter (Blantyre), received by a different officer/clerk | Issuer cannot mark own ticket paid; any authorized receiver can receipt; receipt is unique + reconcilable; case auto-resolves only when balance = 0 |
| Citation contested | Officer issues | Court liaison records outcome (convicted/dismissed/withdrawn) | Court outcome drives `is_paid`/status, not a police edit |
| Impound released | Officer impounds + hold | Investigator/supervisor authorizes release; lot releases car; owner pays fees elsewhere | Only hold-authority (or named delegates) can release; release ≠ case close (fees/evidence may persist) |
| Wanted arrested | Branch A enters want | Branch B arrests (roadside hit) | Branch B files arrest + locate; only originating branch (or monitor) clears the want after hit-confirmation |
| Missing found | Branch A files | Any officer / citizen tip elsewhere locates | Locate report ≠ auto-clear; originator verifies then clears |
| Stolen property recovered | Owner reports at A | Patrol at B recovers | Recovery report + custodian disposition, not silent status flip |
| Court referral outcome | Monitor refers | Liaison records outcome after expiry allowed (already supported) | Outcome closes loop but does not auto-close police case (sentence/appeal may follow) |

Today TRACE handles only the last row correctly. The rest rely on "a monitor will edit status" — which is both too permissive (any in-scope monitor can close anything) and too narrow (an officer at the receiving counter who is *not* the filer and *not* a monitor cannot receipt a payment at all).

### 2.2 How peers solve exactly this

**A. Officer issues → clerk/court receipts → system reconciles (the citation-money pattern).**
- **Florida UTC + TCATS:** the officer's job ends at *deposit* — paper original or electronic replica to the court / traffic-violations bureau **within 5 days**. From that moment *only the court* can dispose: "by trial, official judicial action including forfeiture of bail, or deposit of bail / payment of fine to the violations bureau" (§316.650(5)). Citations are **pre-numbered and inventoried**; the chief accounts for *every* number including spoils; TCATS transmits each citation **twice** (`ADD` active → `UPDATE` inactive/disposed) and rejects dispositions without a matching active citation. The officer never marks their own ticket paid.
- **NC eCitation:** same split with software: officer creates on MDT + prints; the **clerk browser component** owns scheduling, receiving, and disposition; RMS download interface pulls the outcome back. Works with/without coverage (offline MDT queue).
- **Municipal-court audits (College Station / Anchorage / Missouri / Utah / Fulton County):** identical lesson from the fraud side — **billing (officer writes ticket) ≠ cashiering (clerk receives) ≠ reconciliation (supervisor/accounting reviews)**. Missouri's Platte County case ($925 + $2,225 misappropriated) is what happens when one clerk can collect + record + close + withdraw warrants. Required controls everywhere: **sequentially numbered duplicate receipts, per-cashier daily cash-listing + supervisor recount, independent bank reconciliation, no single user holding all three of custody/authorization/record-keeping.**
- *TRACE implication:* keep the F3 ledger (it already encodes "payments are facts, `is_paid` is derived"), but add the clerk side: numbered receipts, payer + method, any-branch receiving, daily per-receiver reconciliation. The issuer must be *technically unable* to receipt their own citation alone.

**B. Disposition requires review, not just an edit (the case-closure pattern).**
- **Axon Records:** disposition updates move through **Draft → Review → Finalized** with per-state privileges. Three modes: no review / supervisor review / **supervisor + records review** (for NIBRS dispositions). Supervisors approve/reject; approve→closed is automatic; the review warns if the incident needs an arrest that is missing. Privileges distinguish *request* disposition vs *approve* disposition.
- **Mark43 audit (Scottsdale):** the failure mode is TRACE's current mode — roles created at implementation, never mapped to a least-privilege / separation-of-duties matrix, never periodically recertified. Recommendation: static role→ability matrix + periodic review.
- *TRACE implication:* replace "monitor can set any status" with **request-vs-approve**: officers/monitors *request* resolution with evidence (payment complete / locate report / release signed); a *different* in-scope monitor (or records-check) *approves*. At minimum enforce it for `wanted`, `citation`, `impoundment`.

**C. Originate-vs-locate agency discipline (the cross-branch pattern).**
- **NCIC:** only the **entering (originating) agency** can clear/cancel; a locating agency sends a **locate** (YQ/YR hit-confirmation first), the record stays until the originator clears it (wanted: 5-day retire after EXTR/DETN locate; missing: `$.L` retire notice). **Philadelphia PD:** "only the agency which entered a warrant can cancel it."
- **Impound peers (Lakewood / Tallahassee / Juneau / CHP):** the **hold authority** (investigator/supervisor who placed the hold) is the only one who rescinds it (plus named chain-of-command delegates); the lot/property room executes but never authorizes; every release is dual-signed (releaser + recipient) with ID check; daily release reports reconcile lot vs RMS vs NCIC/CCIC.
- *TRACE implication:* encode **originator-clears, locator-reports**. A Blantyre officer who arrests on a Lilongwe want files the arrest + a locate note; the Lilongwe branch (or district monitor) clears the want after confirmation. Same for missing/found, stolen/recovered, impound hold/release.

**D. Money and property systems are append-only; corrections are new rows.**
- **TRACE already does this right** for `citation_payments` (never UPDATE/DELETE) and `actions` (append-only) — matches TCATS correction discipline (DELETE + re-ADD, never silent overwrite) and BJA RMS chain-of-custody. Extend the same rule to any new money/custody table.

### 2.3 Concrete design for TRACE (recommended)

**R1. Split lifecycle state per type; keep generic `status` as the outer shell.**

| Type | Outer `records.status` (keep) | Inner lifecycle (add/enforce) | Auto-rule |
|---|---|---|---|
| `traffic_citation` | active → resolved → closed | `balance_due` (derived), `court_outcome` (from referral), `void` flag | `resolved` only when `balance_due = 0` OR court outcome ∈ {dismissed, withdrawn, acquitted} recorded; `closed` only by monitor after reconciliation |
| `vehicle_impoundment` | active → resolved → closed | `hold (held/released)`, `release_auth (user FK + at)` | `released` requires hold-authority signature; `resolved` requires release + fees/notices settled |
| `wanted_person` | active → resolved | `locate (none/located)`, `warrant_status` | `resolved` requires locate + linked arrest OR warrant recall + monitor approval |
| `missing_person/vehicle` | active → resolved | `locate_report` | `resolved` requires locate + originator confirm |
| `stolen_property` | active → resolved → closed | `recovery_report`, `disposition` | `resolved` = recovered; `closed` = disposition recorded |
| `arrest_record` | active → resolved → closed | `custody_status`, `prosecutor_decision` | `resolved` = handed to court / released on bail recorded |
| `crime_incident` / `road_accident` / `vehicle_offense` | active → resolved → closed | none (assignment + reviews suffice) | `resolved` requires assignment done or monitor review note |

**R2. Two new permissions, not new roles (smallest change that fixes the ticket scenario).**
- `receive_payment`: any **active police user in the same domain** (officer or monitor, *any branch*) can record a `citation_payments` row against any in-scope citation. Enforce: `received_by` auto = current user; **issuer cannot receipt their own citation without a second user confirming** (or route to a monitor); receipt_no unique + sequential per branch/counter; daily per-receiver totals queryable for reconciliation.
- `release_hold`: only the **hold authority** (impounding officer's supervisor chain or assigned investigator) + district monitor can sign release. Lot handover is recorded, never self-authorized.
- Both actions write `actions` rows (`payment_received`, `hold_released` — extend `auditActionTypeEnum`) with branch + device/IP, so a Blantyre receipt on a Lilongwe ticket is fully traceable.

**R3. Make completion location-independent, reconciliation centralized.**
- Citation lookup by **ticket_number + plate** (not branch feed) so any counter finds it in one search (F5 unified search already planned — include ticket numbers).
- Payments accepted at **any branch/counter, any payment method**; each payment captures `payer_name, method, channel, branch_id (receiving), receipt_no`.
- **No void-by-edit:** spoiled/duplicate tickets get a `void` action with reason + supervisor countersign (Florida inventories spoils); voided tickets stay queryable.
- **Overpayment rejected; partial payment allowed; balance derived** (already the F3 rule — keep and enforce at any branch).
- **Daily reconciliation view** (monitor): per-receiver totals vs receipts vs bank/counter totals; exception list (issued-but-never-deposited >5 days, paid-but-unreconciled, voided without countersign). This is the College Station / Anchorage / Utah control sheet, and it is the single highest anti-fraud ROI.

**R4. Request-vs-approve for the four sensitive transitions.**
- `citation resolved`, `impound released`, `wanted resolved`, `stolen_property closed` require **requester ≠ approver**. Implement with existing `case_assignments` + `case_reviews`: request = assignment/review note with evidence link (receipt, release form, arrest id); approve = monitor sign-off that flips status. Axon's supervisor-review mode is the template; start with "supervisor review on these 4 transitions only" to avoid workflow fatigue.

**R5. Originator-clears matrix (who may set what, from where).**

| Transition | Who may request (any branch in scope) | Who may approve/clear | Cross-branch rule |
|---|---|---|---|
| Citation payment recorded | any officer/monitor in domain (`receive_payment`) | auto (ledger) — no approval needed per payment | receiving branch recorded on payment; issuer ≠ receiver enforced for own tickets |
| Citation resolved/closed | receiving officer / any monitor | district/country monitor (or originating-branch officer + monitor countersign) | court dismissal resolves without payment |
| Impound hold released | hold authority / delegate | same + district monitor | lot execution ≠ authorization |
| Wanted located → cleared | locating officer (files arrest + locate note) | originating branch officer/monitor after hit-confirmation | originator-only clear |
| Missing located → cleared | locating officer / any reporter | originating branch officer/monitor after verification | same |
| Property recovered → closed | recovering officer | originator/custodian + disposition | custodian records disposition |
| Court outcome recorded | liaison (own referral, even post-expiry — already allowed) | auto-notify filer; police case stays open until R1 auto-rule met | outcome ≠ auto-close |

### 2.4 What to build first (ordered, smallest slices)

1. **Citation cross-branch receiving** (1–2 days): `receive_payment` permission for any in-domain officer; payment form finds ticket by number/plate; `received_by` + receiving `branch_id` + payer + method required; issuer-self-receipt blocked or dual-confirmed; test: Lilongwe ticket paid in Blantyre by non-issuer.
2. **Receipt + reconciliation** (2–3 days): sequential `receipt_no` per counter, duplicate receipt to payer, daily per-receiver totals + monitor exception list (un-deposited >5d, unreconciled, voids without countersign).
3. **Status transition matrix** (2–3 days): enforce R1 auto-rules in `lib/actions/records.ts` (cannot resolve citation with balance >0 and no court dismissal; cannot resolve wanted without locate/arrest-or-recall; cannot close impound without release signature). Return 422 with the missing evidence named.
4. **Request-vs-approve on 4 transitions** (3–5 days): reuse assignments/reviews; approver ≠ requester; audit both steps.
5. **Impound custody fields** (2–3 days): hold authority, lot/bay, owner-notified-at, release auth + ID check, fees snapshot; dual-signature release.
6. **Arrest FK + custody** (1–2 days): `arresting_officer_id` FK, booking_no, custody_status — unblocks court admissibility without full F8.

Items 1–3 alone resolve the user's ticket scenario end-to-end. Items 4–6 generalize the pattern to every record that outlives its issuer.

---

## 3. Appendix — peer solution patterns (quick reference)

| Peer | Pattern TRACE should copy | TRACE status |
|---|---|---|
| Florida UTC Procedures Manual + eCitation/TCATS ICDs (2025) | Pre-numbered tickets; 5-day court deposit; court-only disposition; ADD→UPDATE lifecycle; criminal/civil split; officer certification | Ticket numbering, due date, clerk disposition, void path missing |
| NC eCitation + clerk component | Officer MDT create+print; clerk owns schedule/receipt/disposition; offline-capable | Clerk/receiving side missing; offline partial (F2 web slice done) |
| Indiana eCWS + Odyssey | Scan prefill; citation→court→BMV electronic transmission | Scan (F1) done; court→registry transmission missing (strategic) |
| BJA RMS Spec §§6.3/6.5/9.4 | Vehicle-impound use case (tow→lot→hold→notify→release→auction); property disposition with timed custodian alerts; booking release flow | Impound custody + property disposition missing |
| Axon Records | Triage→assign→active→review→disposition→closure; supervisor / supervisor+records review; approve→closed automatic; arrest-missing warning | Assignment (F9) done; review-gated disposition missing (R4) |
| Mark43 (+ Scottsdale audit) | NIBRS compliance engine; least-privilege role→ability matrix + periodic recertification; no shared accounts | Role matrix + recertification missing |
| NCIC Wanted/Missing/Vehicle | Originate-only clear/cancel; locate-by-other-agency + hit-confirmation; retention until cleared | Originator-clear rule missing (R5) |
| Municipal-court cash audits (College Station, Anchorage APD, Platte County MO, Utah courts, Fulton County) | Billing≠cashiering≠reconciliation; numbered duplicate receipts; per-cashier daily listing + supervisor recount + independent bank rec; exception reports for dormant cases | Ledger exists; receipt numbering + per-receiver reconciliation missing (R2–R3) |
| Impound ops (Lakewood, Tallahassee GO-64, Juneau, CHP-180) | Supervisor-authorized holds; named releasers; dual-signed release with ID; daily lot-vs-RMS-vs-NCIC reconciliation; amend-by-memo | Hold/release authority + dual signature missing (R2/R5) |

---

## 4. Appendix — acceptance tests for the user's scenario

1. Officer A (Lilongwe Traffic) issues citation T-000123 to driver X. Officer B (Blantyre Traffic, different branch) searches T-000123, records full payment with receipt R-045, payer X, method cash. `is_paid` derives true; `records.status` → `resolved` only after balance = 0; Officer A could not have receipted alone; audit shows `payment_received{received_by: B, receiving_branch: Blantyre}`.
2. Driver Y pays half in Zomba, half in Mzuzu — two receipts, balance halves then zeroes; overpayment attempt rejected; void of a spoiled duplicate requires supervisor countersign and stays queryable.
3. Monitor pulls daily reconciliation: per-receiver totals = receipt sums = deposit; T-000123 appears as reconciled; any ticket issued >5 days ago with no court deposit appears as exception.
4. Wanted person entered by Branch A; Branch B roadside hit → Branch B files arrest + locate note; want stays `active` until Branch A (or district monitor) confirms and clears; audit shows both steps with different actors.
5. Impound placed by Officer A with hold by Supervisor S; release attempted by Officer C (not S, not delegate) → 403; release by S with owner ID check → `hold=released`, case still `active` until fees/notice settled, then `resolved`.

*Sources: TRACE `db/schema/*` + `validations/*` (code wins over concept); Florida UTC Manual/ICDs, NC eCitation, BJA RMS v2, Axon Records help (case/disposition/review/privileges), NCIC operating manuals (wanted/missing), CHP/Lakewood/Tallahassee/Juneau impound procedures, municipal-court cash-handling audits listed above; prior TRACE docs `comparison-findings` + `how-it-works` + `improvement-plan`.*
