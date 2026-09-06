# TRACE — Open Questions (answer sheet)

> How to answer: replace the `Answer:` line under each question with the
> letter(s) of your choice, e.g. `Answer: B`. Options marked **(Recommended)**
> are the concept default — you can just delete the questions you agree with
> and answer the rest. Letters map to phases in `TRACE-build-plan.md`.

## A. Access policy (blocks Phase 1 RLS + Phase 3)

### 1. Country monitor raw access

- [✔️] A — Aggregates + escalated-to-`country` only, no individual branch cases **(Recommended)**
- [ ] B — A, plus logged `cross_district_access` override with reason to open any case
- [ ] C — Full read access to all cases in their domain, no override needed

`Answer:`

### 2. Officer district visibility

- [✔️ ] A — Officers see other branches' `district` + `country` records in their district **(Recommended)**
- [ ] B — Officers see only own branch + `country` records; `district` records are monitor-only
- [ ] C — Officers see only own branch; all wider reads go through a monitor

`Answer:`

### 3. Officer edits after filing

- [ ✔️] A — Edit own records while `active`; after that only status/access_level/notes via logged reviewed change, content locked **(Recommended)**
- [ ] B — Officers can edit own records any time while `active`, monitors any time with audit row
- [ ] C — All edits allowed for filer + monitors, every edit writes an audit row, no locking

`Answer:`

### 4. De-escalation rights

- [ ] A — District monitor escalates AND de-escalates; country monitor escalates to `country` only **(Recommended)**
- [ ] B — Both monitors can escalate and de-escalate freely
- [ ] C — Escalation only, no de-escalation (visibility never shrinks)

`Answer:`

### 5. Closed/archived records

- [ ] A — Monitors can reopen (status → `active`), full history kept **(Recommended)**
- [ ] B — Reopening needs country monitor approval
- [ ] C — Closed/archived is terminal, never reopened (file a new record instead)

`Answer:`

## B. External roles (blocks Phase 5)

### 6. Court liaison scope

- [ ] A — Single liaison per referral only (`courtLiaisonId`), no org-wide visibility **(Recommended)**
- [ ] B — Whole court org sees cases referred to any of its liaisons
- [ ] C — Referring monitor picks per-referral: one liaison or whole court org

`Answer:`

### 7. Court referral expiry default

- [ ] A — 90 days, renewable by monitor, unlimited renewals **(Recommended)**
- [ ] B — 30 days, renewable by monitor, unlimited renewals
- [ ] C — 90 days, max 3 renewals, then needs fresh referral
- [ ] D — No expiry (open-ended until revoked)

`Answer:`

### 8. Court attachments

- [ ] A — Liaison sees all attachments including ones added after referral **(Recommended)**
- [ ] B — Liaison sees only attachments present at referral time
- [ ] C — Monitor picks which attachments to share per referral

`Answer:`

### 9. Insurer flag lookup richness

- [ ] A — Strictly boolean: `is_flagged` true/false only **(Recommended)**
- [ ] B — Boolean + own-policy info (whether _their_ policy covers that plate)
- [ ] C — Boolean + minimal case metadata (type + district, no detail)

`Answer:`

### 10. Registrar flag visibility

- [ ] A — Sees `is_flagged` boolean only, never why **(Recommended)**
- [ ] B — Sees flag + case type, no case detail
- [ ] C — Full flag detail (needs it for registry work)

`Answer:`

### 11. Registrar edit surface

- [ ] A — Can correct any vehicle field except plate_number; plate corrections need system_admin **(Recommended)**
- [ ] B — Can correct any field including plate_number
- [ ] C — Can only fill empty fields + set `is_verified`, never overwrite officer data

`Answer:`

## C. Data model (blocks Phase 1 + 3 + 4)

### 12. Users.id type

- [ ] A — Keep better-auth `text` ids for users, `uuid` for everything else (fix drafts) **(Recommended)**
- [ ] B — Migrate users to `uuid` ids
- [ ] C — Don't care, pick whatever builds cleanest

`Answer:`

### 13. Officer scope columns

- [ ] A — Officer stores `branchId` only; district always derived from branch join **(Recommended)**
- [ ] B — Officer stores `branchId` AND denormalized district column
- [ ] C — Officer stores district only, branch derived from assignment table

`Answer:`

### 14. Delete/cascade rules

- [ ] A — Deleting branch/org/user is blocked while linked cases exist; audit rows kept forever **(Recommended)**
- [ ] B — Delete sets FKs null (`set null`), cases survive orphaned
- [ ] C — Delete cascades (cases go with the branch/user) — don't do this, listed for completeness

`Answer:`

### 15. Projections for generic types (stolen_property, crime_incident, arrest, offense, impoundment)

- [ ] A — JSONB search is enough for v1, add coded tables later if slow **(Recommended)**
- [ ] B — Add coded projection tables for all types now
- [ ] C — Add for arrest + stolen_property now, rest later

`Answer:`

### 16. Arrest ↔ wanted linkage

- [ ] A — Manual: monitor closes/updates wanted case by hand **(Recommended)**
- [ ] B — Automatic: closing an arrest with `linked_wanted_record_id` resolves the wanted case
- [ ] C — Automatic + audit row noting the auto-resolution

`Answer:`

### 17. Accident person links

- [ ] A — Later: vehicles + fatality/injury counts only for v1 **(Recommended)**
- [ ] B — Now: link `person_id` rows (drivers/victims) to accidents in v1
- [ ] C — Now but lightweight: free-text names in `data`, no FK links

`Answer:`

### 18. Insurance for unknown plates

- [ ] A — Insurer picks an existing vehicle; unknown plate must be created by police/registrar first **(Recommended)**
- [ ] B — Insurer entry auto-creates an unverified ad-hoc vehicle row
- [ ] C — Either, with dedupe on plate_number

`Answer:`

### 19. Record edit history

- [ ] A — In-place UPDATE + audit row is enough for v1 **(Recommended)**
- [ ] B — Append-only version rows per edit (full history table)
- [ ] C — In-place UPDATE with previous `data` snapshot stored in the audit row

`Answer:`

## D. Auth & provisioning (blocks Phase 2)

### 20. Login identifiers

- [ ] A — Phone OTP for everyone, same as Chipatala **(Recommended)**
- [ ] B — Phone OTP for police, email + password for external org users
- [ ] C — Badge number + phone OTP for police, phone OTP for externals

`Answer:`

### 21. First system_admin seed

- [ ] A — Manual SQL seed script run once at deploy **(Recommended)**
- [ ] B — Env-var bootstrap (admin phone in `.env`, created on first boot)
- [ ] C — Temporary CLI provisioning command

`Answer:`

### 22. Deactivation semantics

- [ ] A — Sessions revoked immediately, cases stay, audit rows kept forever **(Recommended)**
- [ ] B — Sessions revoked on next expiry only (no force logout)
- [ ] C — Cases filed by them get reassigned to their branch monitor

`Answer:`

### 23. Multi-scope users

- [ ] A — One scope per user (one branch OR district OR org), new account for a second posting **(Recommended)**
- [ ] B — Users can hold multiple branch/org assignments
- [ ] C — Police single-scope, external users can span orgs

`Answer:`

## E. Audit & compliance (blocks Phase 7)

### 24. Auditor UI surface

- [ ] A — Same log viewer, case links stripped, no recordId drill-down **(Recommended)**
- [ ] B — Separate minimal audit-only table component
- [ ] C — Auditor gets read-only case drill-down too (log + context)

`Answer:`

### 25. System_admin vs auditor log view

- [ ] A — Identical full log for both **(Recommended)**
- [ ] B — Admin sees identities, auditor sees pseudonymized actors
- [ ] C — Auditor sees full log minus user-provisioning entries

`Answer:`

### 26. Log retention

- [ ] A — Append-only forever, no deletion **(Recommended)**
- [ ] B — Retain 7 years, then archive offline
- [ ] C — Retain 3 years rolling window

`Answer:`

### 27. Emergency override (break-glass equivalent)

- [ ] A — None: escalation by a monitor is the only path to wider access **(Recommended)**
- [ ] B — Break-glass with typed reason + review queue, like Chipatala
- [ ] C — Break-glass for safety lookups only (flag detail), not full cases

`Answer:`

## F. Reports & analytics (blocks Phase 8)

### 28. v1 report catalog (pick all that apply)

- [ ] A — Case volumes by district + type
- [ ] B — Resolution/closure rates
- [ ] C — Accident fatalities/injuries trends
- [ ] D — Citations/fines totals + payment status
- [ ] E — All of the above **(Recommended)**

`Answer:`

### 29. Small-group privacy rule

- [ ] A — Keep Chipatala's "no group smaller than 5" for person-linked reports **(Recommended)**
- [ ] B — Drop the rule (counts only, no privacy risk seen)
- [ ] C — Stricter: minimum group of 10

`Answer:`

### 30. Country monitor aggregates

- [✔️] A — Yes: counts include un-escalated branch data, no row access **(Recommended)**
- [ ] B — No: aggregates only over escalated-to-`country` data
- [ ] C — Yes, but district monitors must opt their data in

`Answer:`

## G. Migration & scope (blocks Phase 0 + 10)

### 31. Chipatala data

- [✔️] A — Fresh database for TRACE, Chipatala data archived separately **(Recommended)**- Note overide it, this is only a copy of chipatala registry
- [ ] B — Migrate users/branches over, drop medical records
- [ ] C — Migrate everything, convert records (not advised — domains don't map)

`Answer:`

### 32. Mobile app scope

- [ ] A — Web only for v1, mobile API later **(Recommended)**
- [✔️] B — Keep `app/api/v1` working for TRACE from day one (field lookups)
- [ ] C — Full Expo client port in v1 alongside web

`Answer:`

### 33. Cross-domain filing

- [✔️] A — Locked to own domain; cross-domain limited to safety lookups **(Recommended)**
- [ ] B — Officers can file in either domain, visibility still domain-scoped
- [ ] C — Monitors can file cross-domain, officers cannot

`Answer:`

### 34. Dual-domain buildings

- [✔️] A — Two branch rows sharing a district/location, one per domain **(Recommended)** - In reality a district may have more than 2
- [ ] B — Single branch row with both domains (needs schema change: domain array)
- [ ] C — Single branch, domain picked per record at filing time

`Answer:`

### 35. Attachment rules for v1

- [✔️] A — Optional everywhere, same size/type caps as Chipatala **(Recommended)**
- [ ] B — Required scene photo for accidents + crime incidents, optional elsewhere
- [ ] C — Required for all record types

`Answer:`
