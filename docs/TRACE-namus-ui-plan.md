# TRACE × NamUs UI Implementation Plan

Backend (N1–N5) is live and seeded. This plan surfaces it in the web UI.
Governing rule: **follow existing UI patterns — no new ones.** Every item
below names the pattern file and the exact slot to extend. If a design
doesn't fit an existing pattern, it doesn't ship in that form.

## Established patterns (the only ones in play)

| # | Pattern | Where | Rule |
|---|---|---|---|
| P1 | Declarative filing fields | `components/app/record-form/fields.ts` (`f()` required / `o()` optional), rendered by `DynamicFields`/`FieldRenderer` (`dynamic-fields.tsx:59-241`) | New inputs are `o()` entries; never hand-rolled inputs in page TSX |
| P2 | Filing plumbing | `app/(app)/records/new/page.tsx`: `NUMERIC_PATHS` coercion (`37-45`), `initialValues`/`setDeep`/`normalizeValue` (`47-57,271-290`), zod `safeParse` at submit (`292-310`) | New numeric payload keys go in `NUMERIC_PATHS`; validation stays zod-at-submit, never live |
| P3 | Case-detail sections | `app/(app)/records/[id]/page.tsx`: `Section` helper (`1215-1235`), per-type cards (`CitationLedger`, `ArrestDetail`, `ImpoundCustody`, `LocateCard`, `LinkedEntities`), role gates (`isPolice`/`isMonitor`), `refresh()` query invalidation (`269-279`) | New sections are `<Section>` blocks with `useQuery` data + mutations + `refresh()`; role-gated like their neighbours |
| P4 | Person profile | `app/(app)/persons/[id]/page.tsx`: one `useQuery(["person",id], getPerson)`, narrowed view type (`115-148`), `loading.tsx` skeleton mirror | New profile data extends the view type + renders in matching blocks; skeleton updated in lockstep |
| P5 | Lookup | `app/(app)/lookup/page.tsx` sections + `unifiedSearch` (`lib/actions/search.ts`) | New filters thread through `unifiedSearch` params into the existing section; no parallel search path |
| P6 | Audit display | `components/app/audit-log.tsx` + `audit-filters.tsx` (generic `action.replace(/_/g," ")`) | No label work; new action types appear automatically |

Out of scope for all phases: audit-log labels, analytics, timelines,
record-type picker, catalog action, wanted safety check — all already
generic or intentionally scoped.

## Phase U1 — Filing: unclaimed type + description fields (P1, P2)

**Goal:** `unclaimed_person` becomes fileable (today it crashes the form);
officers can capture NamUs-grade descriptions on person-centred filings.
Person profiles are **auto-created from the filing payload server-side**
(`resolvePayloadPerson` in `lib/actions/records.ts`: match by
`national_id`, else create carrying the description over — same discipline
as ad-hoc vehicles). There is deliberately NO manual link picker at
filing; corrections happen via merge or the detail link dialog.

1. `fields.ts`: add `unclaimed_person: [...]` mirroring
   `unclaimedPersonSchema` — `deceased_name*`, `place_of_death*` via `f()`,
   everything else via `o()` (`national_id`, `age:number`,
   `sex:options`, `date_of_death:date`, `identification_method`,
   `reason_unclaimed:textarea`, `custodial_branch_id`,
   `description:textarea`, description block below, geo as on sibling types).
2. `fields.ts` `missing_person` (after `distinguishing_features`) and
   `wanted_person` (after `description`): append the shared optional
   description block — `age_from/age_to`, `height_cm_from/height_cm_to`,
   `weight_kg_from/weight_kg_to` (`type:number,half`), `hair_color`,
   `hair_length`, `eye_color`, `complexion`, `build` (`half:true`),
   `clothing_description:textarea`, `jewelry_description:textarea` —
   plus the same block in the new `unclaimed_person` entry.
3. `new/page.tsx:37-45` `NUMERIC_PATHS`: add `age_from, age_to,
   height_cm_from, height_cm_to, weight_kg_from, weight_kg_to` (else string
   input fails `z.number()` at submit).
4. Nothing else: picker, validation, projections, `describeRecord` already
   handle the type; `catalog.ts` stays dead code (do not resurrect it).

Accept: file each of missing/wanted/unclaimed with minimum-only (old
behaviour) and with full descriptions (round-trips to `data`); edit path
on `records/[id]` renders/saves the same fields; `tsc` green.

## Phase U2 — Case detail: match section (P3)

**Goal:** missing↔unclaimed links are proposable, reviewable, and visible
on the case file.

1. New `components/app/match-section.tsx` following `locate-card.tsx`
   structure: `useQuery(["matches", id], listMatchesForRecord)` for the
   list (live + excluded, linking `otherRecordId → /records/<id>` like
   `PersonCard`'s `<Link>` in `linked-entities.tsx:60-63`);
   `useQuery(["match-candidates", id], findMatchCandidates)` for the
   propose UI; `proposeMatch` (officer+) and `reviewMatch`
   (monitor-only confirm/exclude) mutations; both queries added to
   `refresh()` (`records/[id]/page.tsx:269-279`).
2. Mount as a `<Section>` in `records/[id]/page.tsx` between People &
   vehicles (`621-628`) and Reviews (`641`) — render only when
   `recordType` is `missing_person`/`unclaimed_person`
   (`findMatchCandidates` returns `[]` otherwise; mirror that gate in UI).
3. Optional badge/count from `record.matches` (already on `TraceRecord`)
   without the extra query; full list still via the action.
4. Server rules already enforced (readable-both, no live duplicates,
   reviewer ≠ proposer) — UI mirrors them by hiding buttons by role, never
   re-implements them.

Accept: propose as officer → monitor confirms → both case files show the
link; excluded stays listed with reason; proposer cannot confirm own
proposal (button hidden, server rejects anyway).

## Phase U3 — Person profile: descriptions, marks, biometrics (P4)

**Goal:** the profile shows everything `getPerson` already returns.
Forms live in `ResponsiveModal` dialogs (TaskDialog/ReferDialog pattern),
selects are shadcn `Select` (`ui/select`, `__none` sentinel for the
explicit None item on optional fields), dates are `DatePicker`
(`ui/date-picker`). No native `<select>`, no in-page forms.

1. `persons/[id]/page.tsx` view type (`115-148`): stop dropping fields —
   extend to the N1 columns, `physicalFeatures`, `fingerprints`,
   `dnaSamples` (shapes already server-typed).
2. Render in matching blocks: description grid (age/height/weight ranges,
   hair/eye/complexion/build, clothing/jewelry, medical notes — text-only
   rows, same typography as the header block `170-182`); marks list with
   add/remove calling `addPersonFeature`/`removePersonFeature`;
   fingerprints section (`recordFingerprint`/`removeFingerprint`: ref no,
   quality, date, AFIS ref, notes); DNA section (`recordDnaSample`,
   `updateDnaStatus`, `removeDnaSample`: type, lab, status pipeline,
   relationship, dates, notes). All mutations police-gated like the page
   (`canWorkBiometrics` mirrors `canWorkPersons`).
3. `loading.tsx`: extend the skeleton for the new blocks (P4 lockstep).
4. `linked-entities.tsx` `PersonCard`: leave as-is (summary card, not a
   profile).

Accept: seeded profile shows description + mark + FP-26-DEMO-01 + DNA
sample; add/remove/status flows round-trip with audit rows; monitors keep
merge; skeleton has no layout jump.

## Phase U4 — Lookup: expose person filters (P5)

**Goal:** the UI can actually use the `PersonSearchFilters` it ignores.

1. `lib/actions/search.ts`: `unifiedSearch(query, limit?, filters?)`
   forwards to `searchPersons` (server change is a parameter pass-through
   only).
2. `lookup/page.tsx:315-332` person/plate section: add controls reusing
   existing input primitives — district select (same district options
   source as filing), sex select, age-min/max numbers, feature-type
   select from `personFeatureTypeOptions` (`validations/admin.ts:163`).
   Merge-dialog search (`persons/[id]/page.tsx:247-257`) may pass
   `district` later; not this phase.
3. No new search action, no new results component — `UnifiedResultsView`
   rows unchanged.

Accept: filter by district/age/feature narrows person hits; empty query
still returns `[]` (server rule); wanted/plate/ticket sections untouched.

## Phase U5 — Hardening & verification

1. Empty states everywhere new (follow "No structured details"
   `records/[id]/page.tsx:493-496` wording style): no marks, no
   biometrics, no matches, no candidates.
2. Role gates audit: external roles (liaison/insurer/registrar) see none
   of the new UI (they never reach these pages/components — verify, don't
   assume); auditor sees new action types in the log automatically.
3. `npx tsc --noEmit`, eslint on touched files, hand-test with seed
   anchors (officer `+265997000003`, monitor `+265997000005`): file →
   describe → propose → confirm → profile, plus the seeded demo fixtures.
4. Update `docs/TRACE-namus-plan.md` Phase 5 status + this file's
   checkboxes.

## Execution order & discipline

U1 → U2 → U3 → U4 → U5, one phase at a time, `tsc` green after each.
Every new control uses an existing primitive (`Input`, `TextareaStyled`,
`MiniSelect`, `CalendarField`, `Section`, `Link`, skeletons); every new
permission check mirrors a neighbouring gate; no new data-fetching or
validation patterns.
