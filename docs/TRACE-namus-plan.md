# TRACE × NamUs Implementation Plan

Principle throughout: **TRACE's schema leads, NamUs informs.** That means:
UUID PKs + `defaultRandom()`, snake_case columns, `record_type` + `data`
JSONB + coded projections, `access_level` / `district` / `branch` scoping,
append-only `actions` audit, Drizzle Kit migrations, existing `branches` /
`organizations` instead of NamUs `agencies`. Nothing from `namus_schema.sql`
is copied verbatim.

## NamUs → TRACE mapping (what we take, adapt, reject)

| NamUs concept | TRACE decision |
|---|---|
| `persons` demographics (sex, DOB, age range, height/weight, hair/eye) | **Adapt → extend `persons_of_interest`** with optional columns. Keep `full_name` as primary display (no first/middle/last split — TRACE convention). Reject `race_ethnicity` / `tribal_affiliation` USA-vocab; use free-text `complexion`, `hair_color`, `eye_color` instead |
| `physical_features`, `medical_conditions`, `dental_records` | **Adapt → one `person_physical_features` table** (tattoo/scar/mark/piercing/amputation + location + description). Medical/dental condensed to optional text on the person + attachments (dental charts go in `record_attachments`), not 3 separate tables |
| `unclaimed_person_details` | **Adapt → new `record_type = 'unclaimed_person'`** (regular domain) + `unclaimed_person_cases` projection. `custodial_agency_id` → TRACE `branch_id` / holding-location text |
| `fingerprint_records` (afis_*) | **Adapt → `person_fingerprints`** keyed to `persons_of_interest.id`. Keep `quality`, `date_processed`, `reference_no`; replace AFIS-specific columns with nullable `afis_reference` (never required) |
| `dna_samples` (codis_*) | **Adapt → `person_dna_samples`**. Keep `sample_type`, `lab_name`, `notes`; replace CODIS with nullable `lab_reference` + `status` (`collected/sent/processed`) |
| `case_matches` (MP↔UP/UCP) | **Adapt → `person_case_matches`** keyed to `records.id` ↔ `records.id` (not NamUs `cases`), with `match_type` (`possible/confirmed/excluded`), `score`, reviewer workflow |
| `case_types`, `cases`, `agencies`, `case_agencies` | **Reject** — TRACE already has `record_type` enum, `records`, `branches`, `organizations`. No parallel case/agency model |
| `state_code/county/zip/ORI`, `legacy_namus1_id` | **Reject** — USA-specific. Use TRACE `districtEnum` (28 Malawi districts) |
| `case_documents/case_images` | **Reject** — TRACE already has `record_attachments` (+ person/vehicle attach). New doc types ride on the existing table |

## Phase 1 — Person description enrichment

**Goal:** officers can record a usable NamUs-grade description without
hard-gating filing.

Schema (`db/schema/persons.ts`):
- Extend `persons_of_interest`: `age_years`, `age_from`, `age_to`,
  `height_cm_from`, `height_cm_to`, `weight_kg_from`, `weight_kg_to`,
  `hair_color`, `hair_length`, `eye_color`, `complexion`, `build`,
  `clothing_description`, `jewelry_description`, `medical_notes`,
  `updated_at`. All nullable. Ranges (not single values) because field
  estimates are ranges.
- New `person_physical_features`: `id`, `person_id` FK cascade,
  `feature_type` (check: tattoo/scar/mark/piercing/amputation/other),
  `body_location`, `description`, `approximate_size`, `created_at` +
  indexes on `person_id`, `feature_type`.
- Trigram index on new searchable text in `db/sql/20_constraints.sql`.

Validations: extend `personSchema` (`validations/admin.ts`) +
`missingPersonSchema` / `wantedPersonSchema` (`validations/record.ts`)
with the same optional fields. Filing never requires them.

App code: `lib/actions/persons.ts` create/update passes new fields;
`searchPersons` returns them; `writeCodedProjections` unchanged.

Migration: `npx drizzle-kit generate --name person-descriptions` →
review `db/sql/migrations/XXXX/` → `npx drizzle-kit migrate`. Seed:
extend `Seed.sql` person inserts with descriptions + features.

Accept: filing with bare-minimum still works; full description
round-trips; old rows read fine (all NULL).

## Phase 2 — `unclaimed_person` case type

**Goal:** identified-but-unclaimed deceased persons become a first-class
TRACE record, same lifecycle as missing/wanted.

Schema:
- `db/schema/enums.ts`: add `"unclaimed_person"` to `recordTypeEnum`
  (pgEnum value-add migration — verify Drizzle emits
  `ALTER TYPE ... ADD VALUE`, never recreate).
- New `unclaimed_person_cases` projection in `db/schema/coded.ts`:
  `id`, `record_id` FK cascade unique, `person_id` FK nullable,
  `deceased_name`, `date_of_death` (date), `place_of_death`, `district`,
  `identification_method`, `reason_unclaimed`, `custodial_branch_id` FK
  branches nullable, `status`, `created_at` + indexes.
- `relations.ts`: `records ↔ unclaimedPersonCases`,
  `personsOfInterest ↔ unclaimedPersonCases`,
  `branches ↔ unclaimedPersonCases`.

Validations (`validations/record.ts`): new `unclaimedPersonSchema`
(`person_id?`, `deceased_name`, `date_of_death` YYYY-MM-DD,
`place_of_death`, `identification_method?`, `reason_unclaimed?`,
`custodial_branch_id?`, `description?`, `+ geoFields`). Register in
`recordSchemas`; domain map → `regular`.

App code: `lib/actions/records.ts` — domain derivation,
`writeCodedProjections` case `unclaimed_person`, status-change path.

RLS (`db/sql/31_policies_cases.sql`): `unclaimed_person_cases` read =
parent-record-readable, write = police-only (copy
`coded_read` / `coded_write` pattern). No external-role access.

Migration: `npx drizzle-kit generate --name unclaimed-person`. Seed:
2–3 unclaimed cases + projection rows mirroring
`writeCodedProjections`.

Accept: file → projection → district/country visibility →
resolve/close, all scoped like missing_person.

## Phase 3 — Fingerprints + DNA samples

**Goal:** biometric holdings live on the person, inherit case visibility,
audit-logged.

Schema (new `db/schema/biometrics.ts`):
- `person_fingerprints`: `id`, `person_id` FK cascade, `reference_no?`,
  `quality?` (poor/fair/good/excellent check), `date_processed?` (date),
  `processed_by?` (users FK set-null), `notes?`, `created_at` +
  index `person_id`.
- `person_dna_samples`: `id`, `person_id` FK cascade, `sample_type`
  (check: `reference/family_reference/direct/elimination`, nullable
  legacy), `lab_name?`, `lab_reference?`, `status` default `collected`
  (check: collected/sent/processed/destroyed),
  `relationship_to_subject?`, `collected_at?`, `notes?`, `created_at` +
  index `person_id`.
- No FK to `records` directly — person-linked; visibility flows via
  linked records + `record_attachments` pattern.

Validations (new `validations/biometrics.ts`): `fingerprintSchema`,
`dnaSampleSchema` with the vocabs above. All fields except `person_id`
optional.

App code: new `lib/actions/biometrics.ts` (`recordFingerprint`,
`recordDnaSample`, list-by-person) gated to person-working roles;
writes go through `withUserCtx`.

Audit (`enums.ts` + `actions.ts`): add `fingerprint_recorded`,
`dna_sample_recorded`; `actions` gets nullable `person_id` FK so
biometric-only actions don't need a record pointer.

RLS: both tables read/write police-only in phase 3 (tighten later).

Migration: `npx drizzle-kit generate --name person-biometrics`. Seed:
1 fingerprint + 1 DNA row on demo missing/unclaimed persons.

Accept: record fingerprint/DNA on a person with no case link; appears
on person profile; audit row written; legacy persons unaffected.

## Phase 4 — Case matches (missing ↔ unclaimed, NamUs-style)

**Goal:** propose → review → confirm/exclude links between records,
never auto-merge.

Schema (new `db/schema/matches.ts`):
- `person_case_matches`: `id`, `record_id_a` FK records cascade,
  `record_id_b` FK records cascade (check a ≠ b), `match_type`
  (`possible/confirmed/excluded`, default `possible`),
  `score?` (numeric 0–100), `reason?`, `proposed_by` (users FK),
  `reviewed_by?` (users FK set-null), `reviewed_at?`, `created_at` +
  indexes + duplicate-pair guard.
- Corrections = new rows / status flip to `excluded`, never DELETE
  (matches are evidentiary).

Validations: `matchProposeSchema` (`record_id_a/b` uuid, score 0–100?,
reason 10–1000 chars required), `matchReviewSchema` (`match_id`,
decision: confirmed/excluded, reason?).

App code: `lib/actions/matches.ts` — `proposeMatch` (officer+, both
records readable), `reviewMatch` (monitor-only, approver ≠ proposer —
reuse custody maker-checker pattern). Candidate surfacing = simple
heuristic (same person_id OR name/district/age-window overlap).
Explicit non-goal: no ML scorer in this phase.

Audit: add `match_proposed`, `match_confirmed`, `match_excluded` to
`auditActionTypeEnum`.

RLS: read = both parents readable; insert = police; review-update =
monitors (mirror `records_monitor_update`).

Migration: `npx drizzle-kit generate --name case-matches`. Seed: one
`possible` match (demo missing ↔ demo unclaimed) + one `confirmed` +
audit rows.

Accept: propose → monitor confirm → both case views show link;
excluded matches stay queryable; duplicate propose rejected.

## Phase 5 — Search, seed hardening, backfill

**Goal:** new data is findable under existing visibility tiers; no
regressions.

- Unified person/plate lookup: extend trigram indexes + `searchPersons`
  filters (district, age window, feature type); matches surface on case
  detail.
- `Seed.sql` / `Seed-refresh.sql`: scenario pack for all four phases,
  wired into end-of-run RAISE NOTICE demo script.
- `20_constraints.sql`: check constraints for all new vocabs as
  backstops.
- Verification per phase: `npx tsc --noEmit`, `test:visibility`,
  fresh-db `Reset-dev → migrate → Functions&Policies → Seed` run, plus
  RLS spot-checks (officer/monitor/external roles).

## Execution order & migration discipline

1 → 2 → 3 → 4 → 5, strictly sequential (each phase migrates + seeds
before the next). Every phase: edit Drizzle schema →
`generate` → inspect SQL (especially enum ADD VALUE) →
`migrate` on dev → update `db/sql/*` policies/constraints → update
Seed → typecheck + visibility tests.
