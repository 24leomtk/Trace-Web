# TRACE — Tax Officer Role + Vehicle Tax Flagging
## Phased Implementation Plan

> Status: BUILT (all 7 phases applied live to the Neon dev database).
> Decisions locked with owner: MRA-style
> `revenue_authority` org · full 8-type tax set · unpaid tax sets the **same**
> `is_flagged` boolean with an `unpaid_tax` lookup reason · **simple paid
> toggle** on the assessment (no payment ledger; partial-payment history is
> out of v1 scope) · **three-role SoD model** (officer / compliance /
> auditor, see §2c) with maker-checker waivers.

---

## 1. Background — Malawi vehicle taxes (2026/27 regime)

| Tax | Collector | Basis | Cycle |
|---|---|---|---|
| Import duty | MRA Customs (ASYCUDA) | % of CIF value, tariff/age band | once (at import) |
| Import excise | MRA Customs | % (2026: 10% hybrids 1501–2500cc, 20% 2501cc+) | once |
| Import VAT | MRA Customs | 16.5% | once |
| Carbon tax (import/TIP) | MRA | engine bands: 0–2000cc **K40,000** · 2001–3000cc **K60,000** · >3000cc **K90,000** | once |
| Carbon tax (CoF renewal) | MRA/RTD | same engine bands | **yearly (auto)** |
| Road Access Fee | MRA for RFA | **US$20/entry**, foreign TIP vehicles (US$500 spot penalty) | per entry |
| International Transit Fee | MRA for RFA | per 100 km by origin/axle, foreign trucks | per trip |
| License disc / registration | RTD | fixed annual fee | **yearly (auto)** |
| Toll fees | RFA/operators | per passage | ad hoc |
| Penalties | MRA | assessed | ad hoc |

Motorcycle flat moratorium (≤100cc MK56,000; 101–250cc MK77,000) and
duty-free CPCs (MPs/ministers/institutions/returning residents) are modelled
as `exempt` assessments, not special code. Fuel levy is per-litre, not
per-vehicle — out of scope.

---

## 2. Data model (Drizzle migration)

**`vehicle_taxes`** — one row per vehicle per tax obligation:
- `id uuid PK`, `vehicle_id FK → vehicles (cascade)`, `tax_type text`
  (`import_duty | import_excise | import_vat | carbon_tax | road_access_fee | transit_fee | license_fee | toll_fee | penalty`)
- `amount_due numeric notNull`, `is_paid boolean default false notNull`,
  `paid_at timestamptz`, `receipt_no text`, `received_by text FK users`
- `due_date date notNull`, `period_start / period_end date nullable`
  (set for cyclical taxes; null for one-off assessments)
- `reference_no text` (assessment / TIP / invoice number),
  `engine_cc integer` (snapshot for banded taxes),
  `is_waived boolean default false`, `is_exempt boolean default false`,
- `waiver_status text default 'none'` (`none | pending | approved | rejected`),
  `waiver_reason text`, `waiver_decided_by text FK users`,
  `waiver_decided_at timestamptz` (maker-checker, see §2c),
  `entered_by text FK users`, timestamps
- Unique index `(vehicle_id, tax_type, period_start)` where period_start
  is not null — the idempotency key for auto-generation.
- Derived (never stored): `overdue = due_date < today && !is_paid && !is_waived && !is_exempt`

**`tax_automation_rules`** — which cyclical taxes self-generate:
- `id uuid PK`, `owner_org_id FK → organizations` (rule belongs to one
  revenue office), `tax_type text notNull`,
  `period text notNull` (`monthly | quarterly | annual`),
  `is_enabled boolean default false notNull`,
  `amount numeric` (flat amount per generated assessment),
  `engine_bands jsonb nullable` (e.g. `{"2000":40000,"3000":60000,"above":90000}`
  for carbon tax — per-vehicle amount from `engine_cc`, fallback `amount`),
  `due_day_offset integer default 30` (due N days after period start),
  `updated_by text FK users`, timestamps
- Unique `(owner_org_id, tax_type, period)` — one rule per tax per cycle.

**Enum alterations** (new Drizzle migration): `user_role += tax_officer,
tax_compliance_officer`, `organization_type += revenue_authority`,
`audit_action_type += tax_assessed, tax_payment_recorded, tax_waiver_proposed,
tax_waiver_decided, tax_rule_updated` (`tax_waived` folded into the
propose/decide pair so the log shows both halves of the workflow).

### 2b. Audit logging (money sensitivity)

Every tax mutation writes an append-only, hash-chained `actions` row
(`33_append_only.sql` already revokes update/delete; `40_audit_chain.sql`
tamper-proofs the chain; the compliance auditor reads the full log).
Conventions specific to tax, enforced in `lib/actions/tax.ts`:
- **Structured reasons** (machine-readable, not free prose) —
  assess: `assess {tax_type} {amount} due {date} ref {reference_no}`;
  payment: `pay {amount} receipt {receipt_no} receiver {user}`;
  waiver: `waive {amount} because {justification}`.
- **Waivers require a non-empty justification** (min 10 chars, same bar as
  citation voids) — waivers are the highest fraud risk in the ledger.
- **Reads are audited like case reads**: opening a tax row logs
  `cross_branch_access` with the vehicle id (same pattern as plate
  lookups); the auditor filters `action_type LIKE 'tax_%'`.
- **Automation actor**: pg_cron has no user id but `actions.actor_id` is
  NOT NULL — auto-generated assessments are attributed to the rule's
  `updated_by` officer with reason prefix `auto {rule_id}:`, so the chain
  always names the human who armed the rule.
- Toggle-model consequence (accepted): there is no payment-history table,
  so balance history is reconstructable from the audit log only — the
  structured payment reasons above are what make that reconstruction
  exact (amount + receipt on every row).

### 2c. Segregation of duties — three roles, not two

Two roles are insufficient for money: one officer billing, collecting, and
waiving is the fraud triangle, and the generic compliance auditor sees log
lines without ledger context and can approve nothing. v1 therefore ships:

| Capability | Tax Officer (operational) | Tax Compliance Officer (new, org-scoped) | Compliance Auditor (existing) | System Admin (existing) |
|---|---|---|---|---|
| Create assessments | ✓ | — | — | — |
| Record payments | ✓ | — | — | — |
| Propose waiver/exempt | ✓ (goes to `pending`) | — | — | — |
| Approve/reject waiver | — | ✓ | — | — |
| Read own-org ledger | ✓ | ✓ (read-only) | — | — |
| Manage automation rules | — | — (sees changes in log) | — | ✓ (reference data) |
| Read tax audit trail | own entries | all `tax_*` actions | all actions, all domains | all actions |

Maker-checker on the #1 fraud risk: an officer **cannot** waive — they file
`waiver_status: pending` + justification; only compliance flips it to
`approved` (sets `is_waived`) or `rejected`. Direct `is_waived` writes are
blocked in action code (column grants can't split `app_user` by person, so
like the rest of the platform the app is the gatekeeper, RLS the backstop,
audit the witness). Waiver decisions push an `approval_needed` notification
(proposal → compliance queue) and close the loop back to the proposer.

Rule management sits with the System Admin deliberately: automation rules
(amounts, bands, periods, toggles) are **reference data**, not casework —
the same shelf as branches, organizations, and API keys, which the admin
already owns. The junior officer never touches them; compliance watches the
log. (`tax_type` itself is fixed validated vocab in code, like violation
types — nobody manages types at runtime; the only runtime-configurable
things are the rules in §5.)

---

## 3. Enforcement (db/sql split files)

- `20_constraints.sql` — extend `users_role_scope_chk`: `tax_officer`
  requires `organization_id NOT NULL`, domain/branch/district NULL
  (same arm as insurer/registrar).
- `30_policies_core.sql` — `taxes_own_org FOR ALL` (tax officers RW rows
  whose vehicle… no: whose **rule/org** matches — assessments carry no
  org FK; scope via `entered_by`'s org? Simpler and audit-safe: assessment
  gets `owner_org_id` FK set at entry (= enterer's org); policy checks
  `owner_org_id = (select organization_id …)`. Police get `FOR SELECT`
  (flag explanation needs amounts visible in scope — vehicles are global
  reference data, same as `vehicles_read`).
- `tax_compliance_officer` in the same file: `FOR SELECT` on both tax
  tables (own org, read-only — no insert/update/delete grants at all),
  plus `actions_read` extended with
  `(app_my_role() = 'tax_compliance_officer' AND action_type::text LIKE 'tax_%')`
  so compliance sees the money trail but no other org's log lines.
- `tax_automation_rules` follow the reference-data pattern
  (`branches_admin_write` style): `FOR ALL TO app_user` gated on
  `app_is_system_admin()` — officers and compliance get `FOR SELECT`
  only, so the configurability the owner asked for exists without
  putting it in junior hands.
- `32` — nothing (actions inserts are actor-based already).
- `33_append_only.sql` — nothing (toggle model allows officer updates;
  corrections are new audit rows, same as referral docs discipline).
- `60_scheduled_jobs.sql` — add daily `trace-generate-taxes` cron
  (`0 2 * * *` UTC) calling the generation function (see §5).
- `Reset-dev.sql` — add both tables to the drop list.
- `Seed-refresh.sql` §2 — flag recompute gains
  `OR EXISTS (unpaid-overdue vehicle_taxes for this vehicle)`; add §5
  tax-liveness note (nothing stored, nothing to heal — like policies,
  only the flag needs recompute).
- `10_helpers.sql` — nothing (`app_can_read_record` already excludes
  externals from cases; tax visibility is its own RLS).

---

## 4. App layer

- `validations/admin.ts` — `taxAssessmentSchema`
  (vehicleId, taxType enum, amountDue positive ≤ 100M like fines,
  dueDate YYYY-MM-DD, period dates, referenceNo, engineCc),
  `taxPaymentSchema` (taxId, receiptNo required — receipt discipline copied
  from citation payments), `taxRuleSchema` (taxType, period, isEnabled,
  amount, engineBands, dueDayOffset); `managedRoleOptions += TAX_OFFICER`,
  `organizationTypeOptions += revenue_authority`.
- `lib/roles.ts`, `lib/types.ts`, `docs/mobile-api-types.ts` — add
  `TAX_OFFICER` / `tax_officer` to unions + `isExternalRole`.
- `lib/actions/tax.ts` (new, mirrors `insurance.ts`) — `requireTaxOfficer`
  (role + org + orgType check), `createAssessment`, `updateAssessment`
  (own-org only), `recordTaxPayment` (sets toggle + receipt + audit),
  `proposeWaiver` (officer → `pending`, justification required),
  `decideWaiver` (compliance only → `approved`/`rejected` + audit),
  `listMyTaxes` (own-org ledger with settled/overdue derivation),
  `listPendingWaivers` (compliance queue).
- Rule management lives in `lib/actions/admin.ts` as reference data
  (`listTaxRules` / `upsertTaxRule`, system-admin-only, audited) — not in
  the officer's action surface at all.
- `lib/actions/admin.ts` — scope rules (TAX_OFFICER → org required),
  org picker wiring, `ROLE_HINT` + admin users/organizations pages,
  `profile-dialog` label, floating nav (Tax: Ledger / Automation).
- `TaxHome` component (new, mirrors `InsurerHome`) — ledger with
  unpaid / overdue / due-soon / settled filters, assess + record-payment
  forms, and a read-only view of the active automation rules. No toggles
  here: rule editing lives in the admin console (see below), so the
  junior role cannot reconfigure what the machine generates.
- Admin console gains a **Tax automation** reference-data section
  (same pattern as branches/organizations): per-tax-type rule cards with
  enable toggle, period select, amount / engine-band editor —
  system-admin-only, each change audited `tax_rule_updated`.
- `TaxComplianceHome` (new, read-only) — pending-waiver decision queue
  (approve/reject with reason), full ledger read, overdue/waiver watchlists.
  Route: `TAX_COMPLIANCE_OFFICER → TaxComplianceHome`; nav entry;
  admin provisioning + labels like the officer role.
- `app/(app)/page.tsx` — `INSURANCE…` style route:
  `TAX_OFFICER → TaxHome`.
- **Flag integration** — `refreshVehicleFlag` (`lib/actions/records.ts`)
  predicate becomes `activeCaseFlag OR EXISTS(unpaid-overdue taxes)`;
  `plateLookupCore` reasons gain `unpaid_tax` (police only; insurers stay
  boolean-only); `getVehicle` includes tax rows; lookup page renders the
  reason chip; vehicle page shows tax status line.
- **Notifications** — reuse existing types only, plus one queue type:
  assessment created/updated → org colleagues (`status_changed`, new
  `trace_tax_write` trigger in `50`, mirroring `trace_policy_write`);
  payment/waiver proposal → same audience; waiver **proposal** →
  compliance queue (`approval_needed`, new — parallels
  `verification_needed`); waiver **decision** → back to the proposer
  (`status_changed`). No taxpayer push (taxpayers hold no accounts).

---

## 5. Recurring-tax automation (pg_cron)

**Generation function** `trace_generate_recurring_taxes()` (new
`db/sql/61_tax_automation.sql`, `SECURITY DEFINER`):
1. Loop enabled rules with their org.
2. Compute current period bounds from `period` + `now()` (UTC month /
   quarter / calendar year).
3. Per vehicle on file, per rule: amount = engine-band match on
   `vehicles.engine_cc` (rule `engine_bands`, fallback rule `amount`,
   fallback 0 → skip), `due_date = period_start + due_day_offset`.
4. `INSERT … ON CONFLICT (vehicle_id, tax_type, period_start) DO NOTHING`
   — safe to run daily; enabling a rule backfills the current period
   for all vehicles on the next tick.
5. Returns generated count (cron ignores it; manual runs report it).

**Scheduling:** daily `0 2 * * *` pg_cron entry in `60_scheduled_jobs.sql`.
Neon prerequisite (one-time, already documented in `60` header):
`cron.database_name` via API → compute restart → re-run file; jobs fire
only while compute is active (scale-to-zero caveat applies).

**Seed:** rules for `license_fee@annual` (enabled, flat amount) and
`carbon_tax@annual` (enabled, Malawi 40k/60k/90k bands); all other
tax/period combos disabled — so the toggle UI has something to switch on.
`11_taxation.sql` covers assessments across all 8 types (paid, overdue,
due-soon, waived, exempt, TIP-linked RAF) for the ledger filters.

---

## 6. Seeds, tests, docs

- `01_foundation.sql` — MRA org (`revenue_authority`) + 2 tax officers
  + 1 tax compliance officer (next stable phones `+265997000019/20/21`).
- `11_taxation.sql` (new, after `05_insurance.sql` pattern) — ledger across
  all 8 types plus waiver fixtures in every state (pending for the
  compliance queue, approved, rejected) + `08`
  audit fixtures for the 5 new action types + `00_runner` lists.
- `tests/visibility.test.ts` — TAX_OFFICER into the external no-case-access
  loop; new tax-ledger tests (settle/overdue derivation, own-org isolation).
- `docs/role-ability-matrix.md` — tax officer row.

---

## 7. Build phases + acceptance

| Phase | Work | Done when |
|---|---|---|
| 1 — Schema | migration: 2 tables, 3 enum alters, indexes | `drizzle-kit migrate` clean on fresh DB |
| 2 — Enforcement | constraints, RLS, audit actions, Reset/Refresh updates | policy inventory diff reviewed; refresh recompute verified by query |
| 3 — Money actions | validations + `lib/actions/tax.ts` (incl. propose/decide waiver) + admin provisioning | tsc clean; manual assess/pay/propose/approve round-trip; every write leaves a structured audit row; officer direct-waive rejected |
| 4 — UI | TaxHome (ledger) + TaxComplianceHome (waiver queue) + admin Tax automation section + nav + lookup reasons | each filter chip non-empty on seed; admin toggle flips rule + audit row; pending waiver visible to compliance, invisible as approved until decided |
| 5 — Flags | `refreshVehicleFlag` + reasons + Seed-refresh predicate | plate with only unpaid tax reads flagged + `unpaid_tax`; paid → clears |
| 6 — Automation | `61` function + cron wiring + rule seeds | daily tick generates exactly current-period rows; re-run inserts 0 |
| 7 — Seeds/tests/docs | 01 org/users, 11 ledger, 08 fixtures, tests, matrix doc | full fresh seed green; 9→10 notification types; tests pass |

**Open policy choices (owner calls, reversible later):** auto-generation
covers **all** vehicles vs verified-only; flat license amount value;
`due_day_offset` default (30d proposed); police read of tax *amounts*
vs status-only.
