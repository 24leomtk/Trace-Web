# TRACE — Comparable Platforms: Research Findings (for Functionality & UI Comparison)

> Objective: identify real professional platforms that do the same thing as TRACE (or part of what TRACE does), so TRACE can be benchmarked and improved. Scope: police RMS, traffic enforcement, court/prosecution referral, vehicle + insurance registries, and Africa-specific police digitisation. Web research conducted 2026-09-17. URLs in §8.

Companion doc: `TRACE-platform-how-it-works.md` (what TRACE does today — use side-by-side with this file).

## 1. Landscape in one page

No single commercial product was found that bundles **exactly** TRACE's combination (regular + traffic policing **plus** native court-liaison + insurer + vehicle-registrar portals on one codebase). Peers cover slices:

| Slice of TRACE | Closest professional peers |
|---|---|
| Regular-domain RMS (missing/wanted/crime/arrest/stolen) | Mark43 RMS, Motorola CommandCentral RMS / Flex / PremierOne, CentralSquare Records, Hexagon OnCall Records, Tyler Public Safety RMS, Niche RMS, ARMS RMS |
| Traffic (offense/citation/accident/impound/flag) | TraCS (Iowa/FHWA national model), North Carolina eCitation, Indiana eCWS + Odyssey, ARMS E-Citation, Zebra eCitation hardware/software, Florida UTC + TCATS + DAVID, UK Operation Tutelage / Tutelage Plus (ANPR × MID × DVLA/DVSA) |
| Police → court referral + outcome loop | Australia CDPP Referrals Gateway (e-Briefs), UK CPS delivery dashboards, New York eJusticeNY Integrated Justice Portal, EU e-Justice / Estonia e-File, Kenya judiciary e-filing, Indiana Odyssey (citation → court → BMV) |
| Vehicle registry + insurance check | UK DVLA + DVSA + Motor Insurance Database (MIB) pattern, US state DMV insurance-reporting (e.g. Nebraska model), commercial VRM/DVLA APIs (e.g. Vehicle Data Global) |
| Africa police digitisation (closest context to Malawi) | **Malawi Police + UNDP Crime Management System (2026)**, Kenya NPS digitisation ($216M, Occurrence Book, E-Citizen, MBIS biometrics, Fichua kwa DCI), South Africa SAPS e-Docket + CAS, Kenya eCitizen + DCI forensics (ANAB-accredited) |

Direct overlap warning: the **Malawi Police / UNDP Crime Management System** (training launched Lilongwe, July 2026 — centralised recording/tracking from report to disposal, trend analysis, justice coordination) is the most direct in-country comparable. Benchmark TRACE against it explicitly before looking abroad.

## 2. Police RMS peers (regular domain)

### 2.1 Mark43 RMS (US, cloud-native) — mark43.com/platform/rms
- **Functionality:** mobile-first field reporting (incident/offense/arrest, field contacts, vehicle tow, use-of-force), booking/jail lifecycle, investigative case files with task lists + dashboards, property & evidence (barcode, audits, chain-of-custody), NIBRS/State-IBRS compliance engine with plain-language error callouts, master-entity sync, fuzzy/multi-input search, custom graphs/charts/maps, CAD/RMS/entity search, open API, email + in-app notifications, full audit history.
- **Claims:** 50–80% report-writing time reduction; 2–5 week adoption.
- **vs TRACE:** TRACE matches core filing + audit + notifications + projections, but lacks: AI-assisted narrative, booking module, property/evidence chain-of-custody, NIBRS-style compliance engine, fuzzy search, linkable master-name sync, open API, shapefile/GIS + street aliases, IP allow-listing, configurable statutes/fields/roles per record.
- **UI lessons:** guided reporting with inline validation (not post-submit rejection); consolidated record view (all linked entities/documents/media in one pane); analytics dashboards, not static cards; barcode/ID-capture mobile flows.

### 2.2 Motorola Solutions — CommandCentral RMS / Flex / PremierOne + DEMS + OnScene + ANPR
- **Functionality:** tiered RMS (small-agency Flex → large-agency PremierOne → cloud-native AI CommandCentral RMS), compliance engine pre-submission, unified free-text search + consolidated record view, dictation-to-narrative (Capture → transcript), LPR/Vigilant PlateSearch match flags on plates, multi-file evidence upload preserving folder structure, re-shareable case packages, judicial sharing, CAD + mobile + DEMS (body/in-car/LPR) in one ecosystem, field ANPR-integrated vehicle-stop workflow (one-tap plate → Records/CAD → dispatch status).
- **vs TRACE:** TRACE's `is_flagged` + plate lookup is the manual-entry cousin of Motorola's ANPR-integrated flag; TRACE has no DEMS, no dictation, no LPR feed, no unified search, no judicial-sharing package.
- **UI lessons:** single search bar across everything; one-tap roadside workflow (search → verify → update CAD status) — directly applicable to TRACE `/lookup`.

### 2.3 CentralSquare (Records Enterprise/Pro + DEMS + CAD/Jail/Mobile + CrimeView Analytics)
- **Functionality:** single shared-database suite (911 → CAD → RMS → Jail → Mobile), custom fields/forms/modules/dashboards + 270+ canned reports, NIBRS/UCR/Clery, AI transcription/report creation (Centerline AI), CAD-to-CAD interagency sharing, DEMS auto-synced to CAD/Records, CLQ mobile 911 location.
- **vs TRACE:** TRACE is deliberately narrow-scope and branch/district/country-gated; CentralSquare's lesson is **enter-once, available-everywhere** and interagency CAD-to-CAD — TRACE's cross-domain path today is only minimal safety lookups.
- **UI lessons:** shared-database consistency (no dual entry); role-tailored dashboards; configurable alerts on report creation.

### 2.4 Hexagon OnCall, Tyler Public Safety RMS, Niche RMS, ARMS RMS
- Common pattern: CAD ↔ RMS integration is table-stakes (Niche↔Hexagon CAD interfaces; Tyler selection cases cite real-time case info + state/federal DB ties + crime/GIS data; ARMS lists RMS sync + court/NCIC add-ons + record synopsis for public release + multilevel approvals).
- **vs TRACE:** TRACE has **no CAD, no dispatch, no NCIC/PNC equivalent, no GIS**, and approvals are implicit (filer/monitor edit) rather than multilevel review queues.
- **UI lessons:** CAD-event import into RMS; public crime-mapping view; approval-tracked publishing.

## 3. Traffic enforcement peers

| System | What it does that TRACE should compare | Implication for TRACE |
|---|---|---|
| **TraCS** (Iowa + FHWA, 16 states) — mobile data collection + office repository; crash-report time cut from weeks to ~18h, inspection 100d → 14d; barcode scan saves ~200 keystrokes/citation, ~750/crash | Offline-capable MDT/PDA capture + central repository + BMV/court transmission | TRACE has idempotent POST but no true offline MDT queue, no DL/plate scan prefill, no crash-schema standard |
| **NC eCitation** (first statewide, 1999; 7.25M+ processed by 2012; 84.6% of non-arrestable) — patrol-car creation + court-date scheduling + print, clerk browser component, RMS download interface, ACIS + DMV interfaces, works with/without coverage | End-to-end citation → court → DMV with offline mode | TRACE citations stop at record + paid flag; no court-date scheduling, no clerk component, no DMV interface |
| **Indiana eCWS + Odyssey** — field e-ticket + affidavit + tow form, DL/registration scan prefill, ~1M citations/yr, 490+ agencies, central repository, court + BMV electronic transmission | Scan-to-prefill + multi-form field packet | TRACE filing is manual typing; consider scan prefill + printable UTT equivalent |
| **ARMS E-Citation / Zebra** — laptop/handheld issue-print-sync, state-format compliance, NCIC query + court-forward add-ons | Real-time RMS sync + court forwarding as purchasable add-ons | TRACE could package court-forwarding + ID/plate query the same way |
| **Florida UTC + TCATS + DAVID** — uniform citation mandate + accounting/transmission + driver/vehicle DB for instant retrieval + crash form HSMV 90010S | Uniform ticket + fee accounting + instant driver/vehicle retrieval | TRACE lacks fine accounting (only `is_paid`) and uniform-ticket standard |
| **UK Operation Tutelage / Tutelage Plus + ANPR NASPLE** — ANPR × MID (insurance) × DVSA (MOT) × DVLA (VED/tax) to find uninsured/untaxed/unfit vehicles; ~60M ANPR reads/day nationally, 1-yr retention, 90-day standard access, VOI lists with corroborated intel, RADAR/ACE real-time prioritisation | Automated insurance/MOT/tax compliance via camera + registry fusion | TRACE's insurer portal (manual policy entry + boolean flag lookup) is the pre-automation version; ANPR + live MID/DVLA-style fusion is the target state |

## 4. Court / prosecution referral peers

| System | Pattern | vs TRACE `court_case_access` |
|---|---|---|
| **Australia CDPP Referrals Gateway** | Secure partner portal for referrals + e-Briefs (new briefs, tranches, arrest/breach matters), Protected-classification, email support channel | TRACE referral is lighter (grant + reason + 90d expiry + outcome enum); CDPP adds structured e-Brief packaging — TRACE could adopt brief bundles (charges, statements, exhibits) |
| **UK CPS delivery data dashboards** | Police-referral → prosecution timeliness/quality metrics published | TRACE notifies filer of outcome but has no referral-SLA or timeliness dashboard |
| **eJusticeNY Integrated Justice Portal** | Role-gated justice portal (DMV abstracts, protection orders, offender registry, decline-to-prosecute memos) via Terminal Agency Coordinators | TRACE's liaison scoping is analogous (per-case vs portal-wide); NY adds coordinator-mediated provisioning — relevant to TRACE admin UX |
| **EU e-Justice / Estonia e-File** | e-Filing + e-service + e-payment + case tracking with ID-card/Mobile-ID auth, digital signatures, auto receipt timestamps, party-visible case file | TRACE has no e-signature, no filing fees, no party tracking; Estonia's receipt + visible-file pattern maps to TRACE outcome close-the-loop |
| **Kenya judiciary e-filing** | E-filing + e-service + e-search + e-payment/receipts + order extraction; digital-signature law + backup-system requirements | Same gaps as above; Kenya's payment/receipt + backup lessons apply |
| **Indiana Odyssey** (citation → court → BMV) | Serious commercial-infractions transmitted electronically court→BMV instead of mail/fax | TRACE court loop ends at outcome note; no downstream BMV/registry transmission |

## 5. Vehicle + insurance registry peers

- **UK model (DVLA + DVSA + MIB/MID):** separation of keeper/licensing (DVLA), roadworthiness (DVSA/MOT), and insurance (MIB/MID) with ANPR fusion for enforcement. TRACE collapses registrar + insurer inputs into one DB with `is_verified` vs ad-hoc distinction — simpler but without independent bureau cross-checks. Improvement: keep TRACE's verify-in-place (good) and add bureau-style reconciliation (plate ↔ VIN ↔ keeper ↔ policy ↔ MOT-equivalent) plus ANPR-ready `Rapid Vehicle Details`-style API (sub-10ms flag endpoint).
- **US DMV insurance reporting (e.g. Nebraska guide):** insurers push standardised files matched by VIN, with return-report FTP loops. TRACE chose the opposite (insurers type directly into portal, vehicle must pre-exist). Trade-off: TRACE avoids ETL but burdens insurers and caps at 100-row lists; peers do bulk file + exception reports. Improvement: add bulk CSV/API ingest + mismatch queue alongside manual entry.
- **Commercial VRM APIs:** instant keeper/MOT/tax/stolen/finance/valuation/tyre/image lookups. TRACE vehicle profile is minimal (make/model/year/color/chassis/engine/owner). Improvement: enrich registrar view toward VRM-API parity where legally available.

## 6. Africa-context peers (highest priority for like-for-like comparison)

1. **Malawi Police + UNDP Crime Management System (July 2026, Lilongwe):** centralised digital crime recording/tracking from report to disposal, trend/resource/allocation analytics, justice coordination, accountability/audit. Overlaps TRACE's regular domain almost 1:1. **Action:** obtain its feature list, station rollout, docket-numbering, and justice-handoff to avoid duplicate systems and to align data standards.
2. **Kenya NPS digitisation ($216M / 2024–2026):** Occurrence Book digitisation, E-Citizen single-portal access, $216M envelope, 80%-of-services target. Lesson: citizen-facing single portal + OB as the atomic record — TRACE has neither; consider OB-number parity.
3. **Kenya DCI MBIS v5 + ANAB forensics (2026):** fingerprints + palm + face in one platform (2M → 10M records), police clearance via eCitizen in 24h (was 14d), first ANAB-accredited forensics in Africa. Lesson: biometric identity + clearance workflow is the identity layer TRACE currently does by typed national ID.
4. **Fichua kwa DCI + SMS reporting:** citizen crime reporting (app + SMS, anonymous option). TRACE is staff-only; this is the citizen-intake gap.
5. **South Africa SAPS e-Docket + CAS (2008→):** docket indexed/registered on CAS then scanned centrally, no station-level image store, undeletable once stored, ISM audit trails, SMS complainant updates (CAS number, IO changes). Lesson: central evidence store + complainant SMS + undeletable docket is the evidence-integrity bar above TRACE's Cloudinary images.
6. **Kenya Occurrence Book + E-Citizen + Huduma capture pattern:** apply → pay → biometric capture at station/Huduma → appointment. Relevant to TRACE provisioning + insurer/registrar onboarding UX.

## 7. What to copy into TRACE (prioritised)

**Functionality (highest ROI first):**
1. Scan-to-prefill (DL + plate/VIN barcode) for citations, accidents, offenses — TraCS/Indiana pattern; kills keystrokes, the #1 field complaint.
2. True offline capture (MDT queue + coverage-independent eCitation mode) beyond idempotency-key replay.
3. Citation → court-date scheduling + clerk view + fine ledger (issue/paid/balance/receipt) + BMV/registry transmission — NC/Indiana/Florida pattern.
4. ANPR-ready flag service (single low-latency endpoint) + VOI-list discipline (intel-corroborated, reviewed, expiring) — UK NASPLE pattern.
5. Bulk insurer ingest (CSV/API + VIN-match + exception queue) alongside manual portal — Nebraska pattern.
6. E-Brief bundle on referral (charges + statements + exhibits + disclosure) + referral SLA dashboard — CDPP/CPS pattern.
7. Booking + property/evidence chain-of-custody (barcode, seal/purge, audit) — Mark43/Motorola pattern.
8. Biometric/national-ID verification + clearance workflow — Kenya MBIS pattern.
9. Citizen intake (app/SMS, anonymous option, tracking number, complainant SMS updates) — Fichua/SAPS pattern.
10. GIS + hotspots + public crime map (with small-group suppression retained) — Tyler/Hexagon pattern.
11. Multilevel approvals + record synopsis for release — ARMS pattern.
12. Open API + CAD interface + PNC/NCIC-style queries — Niche/Motorola pattern.

**UI/UX (steal shamelessly):**
- Mark43: inline plain-language validation with direct links; consolidated record view; premade templates per case type.
- Motorola: unified search bar; one-tap roadside workflow; dictation-to-narrative.
- CentralSquare: enter-once dashboards; configurable creation alerts.
- SAPS: complainant SMS timeline (applied → registered → assigned → outcome).
- Estonia e-File: login shows only *my* proceedings + receipt timestamp on every submission.
- Court/insurer/registrar queues: expiry countdowns (TRACE has `expires_at` — surface it), bulk renew/revoke, outcome-SLA badges.

## 8. Sources consulted

- Mark43 RMS — https://mark43.com/platform/rms , https://mark43.com/rms , https://mark43.com/solutions/law-enforcement
- Motorola CommandCentral Records/RMS + DEMS — https://www.motorolasolutions.com/en_us/products/command-center-software/public-safety-software/records-and-evidence-management/commandcentral-records.html , https://www.motorolasolutions.com/en_us/products/command-center-software/public-safety-software/records-and-evidence-management.html
- Motorola ANPR + mobile integration guide (PDF) — https://www.motorolasolutions.com/content/dam/msi/docs/en_xa/mobile_app_anpr_integration_solution_guide_final.pdf
- CentralSquare Records/DEMS — https://centralsquare.com/solutions/public-safety-software/records-management-system , https://centralsquare.com/solutions/public-safety-software/records-supervisor
- Hexagon police — http://hexagon.com/industries/public-safety/police-services
- Tyler RMS selection (Des Moines, PDF) — https://councildocs.dsm.city/communications/2020/20-379.pdf
- Niche RMS NYSP integration response (PDF) — http://online.ogs.ny.gov/purchase/snt/awardnotes/7360022802RFQ18-02_E_RMS_Attachment2.pdf
- ARMS E-Citation — https://arms.com/products/e-citation ; Zebra eCitation — https://www.zebra.com/us/en/industry/government/ecitation.html
- TraCS / eCitation national assessment (BJA, PDF) — https://bja.ojp.gov/sites/bja/files/media/document/20030619_bja_study_of_electronic_citations.pdf
- NC eCitation — https://webservices.ncleg.gov/ViewDocSiteFile/48554 ; Indiana eCWS — https://www.in.gov/courts/oja/tech/traffic-citation ; Florida UTC/TCATS/DAVID — https://www.flhsmv.gov/courts-enforcement
- UK Operation Tutelage / RADAR / ACE — https://www.gov.uk/government/case-studies/combining-vehicle-data-to-create-safer-roads ; ANPR standards — https://www.gov.uk/government/publications/national-anpr-standards
- CDPP Referrals Gateway — https://referralsgateway.cdpp.gov.au/ ; eJusticeNY — https://www.ejustice.ny.gov/LawEnforcement/forms-and-pubs.html ; EU e-Justice — https://e-justice.europa.eu/ ; CPS dashboards — https://criminal-justice-delivery-data-dashboards.justice.gov.uk/quality-justice/cps
- Malawi Police + UNDP CMS (July 2026) — https://www.undp.org/malawi/news/dockets-data-malawi-police-and-undp-malawi-advance-digital-transformation-crime-management
- Kenya MBIS + clearance — https://nation.africa/kenya/news/certificate-of-good-conduct-goes-digital-to-be-issued-in-24hrs-5535392 ; Kenya $216M digitisation — https://www.wearetech.africa/en/fils-uk/news/public-management/kenya-unveils-216m-plan-to-modernize-police-force ; Kenya e-filing lessons — https://www.dlapiperafrica.com/africa-wide/insights/africa-connected/issue-05/embracing-electronic-court-case-management-systems-lessons-from-the-kenyan-experience-during-covid-19.html
- SAPS e-Docket — https://issafrica.org/iss-today/the-saps-e-docket-system ; Kenya digital policing survey — https://journals.eanso.org/index.php/eajle/article/download/2970/3577
- Nebraska insurance reporting guide (PDF) — http://dmv.nebraska.gov/sites/default/files/doc/dvr/registration/Nebraska_Insurance_Reporting_Guide-Final.pdf ; Vehicle Data Global — https://vehicledataglobal.com/

*Note: vendor claims (e.g. time-savings percentages, record counts) are reproduced as published by the vendors/sources above, not independently verified. Feature parity statements about TRACE are verified against `trace-web` source; peer features are as documented on the linked pages at time of search.*
