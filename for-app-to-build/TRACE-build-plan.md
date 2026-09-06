# TRACE — Build Plan (on top of Chipatala Registry)

> Strategy: **override, don't rebuild.** Keep Chipatala's stack, patterns, and
> file layout; swap the domain (medical → policing) file-by-file following the
> table below. The draft schema in `for-app-to-build/*.ts` + `validations/record.ts`
> is already modeled on Chipatala's patterns — adopt it, don't redesign it.

## 0. What stays untouched

- Stack: Next.js + better-auth (phone OTP, no self-registration) + Drizzle +
  Postgres/Neon + Cloudinary/private storage + shadcn/tailwind.
- Cross-cutting patterns: server actions in `lib/actions/`, `withUserCtx` + RLS,
  append-only `actions` audit log, zod `validations/`, `record-meta.ts` +
  `record-view.ts` presentation layer, `proxy.ts` route guards, `app/api/v1`
  mobile API, `db/sql/Functions&Policies.sql` for RLS/triggers, seed files.
- Design language: keep components, FloatingNav, timeline/feed layouts — only
  relabel and rescope them per role.

## 1. Chipatala → TRACE mapping (the anti-guesswork table)

| Chipatala (existing) | TRACE (target) | Change type |
|---|---|---|
| `db/schema/auth.ts` users: patient/doctor/district_admin/country_admin/administrator + hospitalId, nationalId, emergencyInfo | `for-app-to-build/auth.ts`: officer/district_monitor/country_monitor/system_admin/compliance_auditor/court_liaison/insurance_portal_user/vehicle_registrar + domain/branchId/district/organizationId, badgeNumber | Override |
| `db/schema/hospitals.ts` | `for-app-to-build/branches.ts` + `organizations.ts` (courts, insurers, vehicle registry) | Replace 1 table with 2 |
| `db/schema/records.ts` medical_records (profileId, hospitalId, 16 record types) | `for-app-to-build/records.ts` records (reportedBy, branchId, district, vehicleId, personId, accessLevel, status, domain, 10 record types) | Override |
| `db/schema/grants.ts` access_grants (patient→doctor codes) | `for-app-to-build/court.ts` court_case_access (monitor→court_liaison referral, expiresAt/renewedAt/revokedAt + outcome) | Replace pattern, keep time-box idea |
| `db/schema/actions.ts` (code_issued/redeemed, foreign_access, emergency_access…) | `for-app-to-build/actions.ts` (record_created/viewed/updated, cross_branch/district_access, court_*, policy_*, vehicle_registered, insurer_flag_lookup…) + vehicleId column | Override enum + columns |
| `db/schema/clinical.ts` + `coded.ts` (diagnoses/prescriptions/immunizations via trigger) | `for-app-to-build/coded.ts` (missing_person_cases, wanted_person_cases, vehicle_cases, accidents + accident_vehicles, traffic_citations via trigger) | Replace projections, keep trigger pattern |
| NEW — no Chipatala equivalent | `for-app-to-build/vehicles.ts`, `persons.ts`, `insurance.ts` | Add |
| `validations/record.ts` (16 medical schemas) | `for-app-to-build/validations/record.ts` (10 TRACE schemas, already drafted) | Swap |
| `validations/admin.ts` (users/hospitals) | extend to branches + organizations + 8 roles | Extend |
| `lib/roles.ts`, `lib/types.ts`, `lib/session.ts` (PATIENT/DOCTOR/…) | 8 TRACE roles, branch/org scoping, `mapUserRow` joins branches+organizations | Override |
| `lib/record-meta.ts`, `lib/record-view.ts` (16 types) | 10 TRACE types, domain grouping (regular vs traffic) | Override |
| `lib/actions/access.ts` (codes, break-glass) | court referral actions (refer/renew/revoke/record-outcome) + safety lookups (flag-only) + cross-domain minimal lookup | Rewrite |
| `lib/actions/records.ts` (grant-gated reads) | access_level-gated reads (branch/district/country) + domain scoping + status/escalation actions | Rewrite |
| `lib/actions/admin.ts` (users/hospitals) | users + branches + organizations provisioning | Extend |
| `lib/actions/analytics.ts` (disease/medicine/immunization) | case volumes, resolution rates, accident trends by district | Rewrite queries, keep feed components |
| `lib/actions/catalog.ts`, `uploads.ts` | keep; catalog becomes offense/violation codebooks if needed | Keep/relabel |
| `app/(app)/page.tsx`, `records/`, `admin/`, `profile/` | officer home (branch feed), records/new per type, monitors' review queues, portals (court/insurer/registrar), admin (branches/orgs/users), audit-log viewer | Rescope per role, same layout shell |
| `app/api/v1/` mobile API | same endpoints, new record shapes + safety-lookup endpoints | Extend |
| `db/sql/Functions&Policies.sql`, Seed files | new RLS (access_level × domain × district × branch × org × court grants), is_flagged trigger, expiry job | Rewrite |

## 2. Build phases (in order)

### Phase 0 — Freeze & branch
- [ ] New git branch (e.g. `trace-override`); keep Chipatala runnable until Phase 1 lands.
- [ ] Decide: in-place `db/schema/` replacement vs. parallel `db/trace/` then cutover.
  Recommended: in-place replacement consuming `for-app-to-build/` files verbatim.

### Phase 1 — Database
- [ ] Move `for-app-to-build/{enums,branches,organizations,auth,persons,vehicles,insurance,records,coded,court,actions,index}.ts`
  into `db/schema/` (replacing clinical/grants/hospitals/records/actions).
- [ ] Reconcile `users.id` type: TRACE drafts use `uuid` FKs but better-auth ids are
  `text` — keep `text` like Chipatala's `db/schema/auth.ts` does.
- [ ] Generate + review Drizzle migration; handle PG enum changes
  (user_role, record_type, new domain/access_level/case_status/org_type enums).
- [ ] Rewrite `db/sql/Functions&Policies.sql`: `app_can_read_record()` covering
  branch/district/country tiers, domain isolation, org scoping, court-grant checks.
- [ ] Triggers: coded-table projections on records INSERT/UPDATE; `is_flagged`
  maintenance on vehicles; `court_access_expired` handling (trigger or pg_cron).
- [ ] Refresh `Seed.sql` / `Seed-refresh.sql`: branches per district × domain,
  sample orgs (court/insurer/registry), users for all 8 roles.

### Phase 2 — Auth, roles, session
- [ ] `lib/roles.ts`: 8 TRACE roles, domain/district lists, helpers
  (`isPoliceRole`, `isMonitor`, `isExternalRole`, `canAccessDomain`…).
- [ ] `lib/types.ts` + `lib/session.ts`: branch/org-scoped `User`, join
  branches+organizations in `mapUserRow`/`getUserById`.
- [ ] `lib/auth.ts`: keep phone-OTP, no self-registration; rename appName;
  badgeNumber/phone provisioning stays admin-only.
- [ ] `proxy.ts` + `(app)/layout.tsx`: role-based home routing
  (officer feed / monitor review / court referrals / insurer policies /
  registrar queue / admin console / auditor log).

### Phase 3 — Records core (regular + traffic)
- [ ] Promote `for-app-to-build/validations/record.ts` → `validations/record.ts`;
  wire domain derivation (recordType → domain) at write time.
- [ ] `lib/record-meta.ts` + `lib/record-view.ts`: 10 TRACE types, icons/tones,
  title/summary/badge extractors.
- [ ] Rewrite `lib/actions/records.ts`: create (own domain, own branch),
  read (branch + escalated district/country), update-while-active, status change,
  escalate/de-escalate access_level, reassign branch — every cross-scope read
  writes `cross_branch_access` / `cross_district_access`.
- [ ] UI: `records/new` per-type forms, timeline/feed filtered by domain, record
  detail with status + access_level controls + attachments.

### Phase 4 — Shared entities (vehicles, persons)
- [ ] Vehicle actions: ad-hoc create on case file (`is_verified:false`),
  registrar verify/enrich (same id), `is_flagged` single-lookup for stops.
- [ ] Person actions: create/match `persons_of_interest` by nationalId/name,
  link across cases (`person_id`, `linked_person_ids`).
- [ ] UI: vehicle/person search + detail with linked-cases list.
- [ ] Attachments: extend to personId/vehicleId (per `records.ts` comment),
  inherit parent record's access_level.

### Phase 5 — External portals
- [ ] Insurer portal: CRUD own `insurance_policies` only (`insurer_id` = own org);
  flag-only vehicle lookup logging `insurer_flag_lookup`.
- [ ] Registrar queue: unverified-vehicle list, verify/enrich, `vehicle_registered` audit.
- [ ] Court referrals: monitor refer/renew/revoke (`court_case_access`),
  liaison read-referred-only + record outcome; expiry auto-lapse.

### Phase 6 — Safety lookups (cross-domain, minimal)
- [ ] `is this national ID wanted` / `is this plate flagged`: yes/no + minimal
  detail, read-only, always audited. Reuses Chipatala's emergency-info pattern
  (small slice, no full file).

### Phase 7 — Admin & audit
- [ ] `lib/actions/admin.ts` + `app/(app)/admin/`: users (8 roles + scoping),
  branches, organizations, phone/badge management, deactivation.
  System_admin gets zero case-data access (enforce in actions + RLS + UI).
- [ ] Audit log viewer: district-scoped (district monitor), domain-wide
  (country monitor), full (system_admin, compliance_auditor read-only).
  Auditor sees log only — no record routes.

### Phase 8 — Analytics / reports
- [ ] Replace disease/medicine/immunization reports with case-type volumes,
  resolution rates, accident trends by district/month (coded tables, ≥5-grouping
  where sensitive). Keep `AnalyticsFeed`/`DiseaseAnalytics` component shapes.

### Phase 9 — Mobile API + uploads + jobs
- [ ] `app/api/v1/`: record shapes, safety lookups, portal endpoints; update
  `docs/mobile-api.md` + types.
- [ ] Uploads/storage buckets mirror record access rules.
- [ ] pg_cron: court-grant expiry sweep, analytics view refresh.

### Phase 10 — QA & cutover
- [ ] `pnpm typecheck && lint && build`; per-role click-through matrix
  (8 roles × own/out-of-scope/expired-revoked cases).
- [ ] Negative tests: other-domain access, unreferred court browse, cross-insurer
  read, registrar opening cases, admin opening cases — all denied + logged.
- [ ] Seed demo data, archive Chipatala-only docs.

## 3. Suggested build order (checklist)

- [ ] Phase 0: branch + replacement strategy decision
- [ ] Phase 1: schema moved, migration generates clean, RLS + triggers in SQL
- [ ] Phase 2: sign-in as all 8 roles works, correct home per role
- [ ] Phase 3: officer files all 10 record types; monitors escalate/review
- [ ] Phase 4: vehicle/person linking works; registrar verification keeps links
- [ ] Phase 5: insurer/court/registrar portals scoped correctly
- [ ] Phase 6: safety lookups minimal + audited
- [ ] Phase 7: admin CRUD + audit viewer scoped per role
- [ ] Phase 8: reports run from coded tables
- [ ] Phase 9: mobile API docs updated, uploads + cron wired
- [ ] Phase 10: full role matrix green, typecheck/lint/build clean
