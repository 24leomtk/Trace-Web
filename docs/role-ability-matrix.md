# TRACE — Role → Ability Matrix (least privilege + separation of duties)

> Static, reviewable, recertifiable. Source of truth for what each role may do;
> enforced in `lib/actions/*` (app gate) + `db/sql/Functions&Policies.sql` (RLS
> backstop). Review quarterly via **Administration → Access review**
> (`getAccessReview`: dormant accounts, blocked transitions). No shared or
> counter accounts — every receipt, hold, and confirmation must name a human
> (`received_by`, `hold_authority_id`, `locate_by`), which is what makes the
> money reconcilable. Lesson: Mark43 Scottsdale audit — roles set once at
> implementation and never recertified drift into fraud risk.

Legend: ✅ allowed · 🔒 conditional (see note) · — denied.

## Police roles (domain-scoped)

| Ability | OFFICER (own branch) | DISTRICT_MONITOR (own district) | COUNTRY_MONITOR (domain) |
|---|---|---|---|
| File record (own domain) | ✅ own branch | ✅ any branch in scope | ✅ any branch in domain |
| Read case file | ✅ own branch + escalated | ✅ district-wide | 🔒 `country` level (+ aggregates) |
| Edit while `active` | 🔒 own filings | ✅ in scope | — (national bulletins only) |
| Set access level | 🔒 widen own filing | ✅ up/down | 🔒 to `country` |
| Receive fine payment (`receive_payment`) | ✅ any branch, same domain | ✅ | ✅ + may receipt for a branch counter |
| Countersign another's receipt | ✅ | ✅ | ✅ |
| Receipt own ticket alone | — (needs named countersign) | — (needs named countersign) | — (needs named countersign) |
| Void ticket | — | ✅ in scope | 🔒 `country` level |
| Schedule court date | — | ✅ in scope | 🔒 `country` level |
| Place impound hold | 🔒 own filings | ✅ in scope | 🔒 `country` level |
| Release hold (`release_hold`) | 🔒 hold authority only | ✅ in scope | 🔒 `country` level |
| Report locate | ✅ in scope | ✅ in scope | 🔒 `country` level |
| Confirm locate | 🔒 originating branch + not locator | ✅ + not locator | 🔒 `country` level + not locator |
| Resolve / close / archive | — | ✅ in scope (guards apply) | 🔒 `country` level (guards apply) |
| Refer to court / renew / revoke | — | ✅ in scope | ✅ nationwide |
| Assign task / record disposition | — / 🔒 own filings | ✅ in scope | 🔒 `country` level |
| Reconciliation board | — | ✅ own district | ✅ domain-wide |
| Analytics feed | — | ✅ own district | ✅ national (+ district breakdown) |
| Audit log | — | 🔒 own district | ✅ domain-wide |

## Platform roles (no case data, ever)

| Ability | SYSTEM_ADMIN | COMPLIANCE_AUDITOR |
|---|---|---|
| Provision / deactivate users | ✅ | — |
| Manage branches / organizations / API keys / tax automation rules | ✅ | — |
| Read case records, vehicles, persons, policies | — | — |
| Full audit log | ✅ (incident investigation) | ✅ (oversight only) |
| Access review board | ✅ | — |

## External organization roles (scoped by organization)

| Ability | COURT_LIAISON | INSURANCE_PORTAL_USER | VEHICLE_REGISTRAR | TAX_OFFICER | TAX_COMPLIANCE_OFFICER |
|---|---|---|---|---|---|
| Browse / search cases | — | — | — | — | — |
| Read referred case + attachments | 🔒 live grant only | — | — | — | — |
| Record outcome on own referral (even post-expiry) | ✅ | — | — | — | — |
| Renew own grant | — (monitor does) | — | — | — | — |
| Own-org policies (create/update + bulk CSV) | — | ✅ own insurer | — | — | — |
| Boolean plate-flag lookup | — | ✅ (audited) | policy-gated | — | — |
| Registry create / verify-in-place | — | — | ✅ national | — | — |
| Read case / person / insurance detail | — | — | — | — | — |
| Tax assessments (create/update) | — | — | — | ✅ own revenue office | — |
| Record tax payments (receipted toggle) | — | — | — | ✅ own revenue office | — |
| Propose waiver (→ pending) | — | — | — | ✅ | — |
| Approve / reject waiver | — | — | — | — | ✅ |
| Read own-org tax ledger | — | — | — | ✅ | ✅ read-only |
| Read tax audit trail | — | — | — | own entries | all `tax_*` |

## Separation-of-duties invariants (the ones that prevent fraud)

1. **Issuer ≠ receiver.** The officer who filed a citation cannot receipt it alone — a named countersign is required. (Platte County, Missouri: one clerk collecting + recording + closing stole $3k+.)
2. **Billing ≠ cashiering ≠ reconciliation.** Officers/counters bill (issue), any in-domain officer/clerk receives, monitors reconcile daily. No single user holds all three.
3. **Lot executes, never authorizes.** Release needs the hold authority's (or monitor's) signature plus an ID-checked recipient — dual-signed, set-once.
4. **Locator ≠ confirmer.** Only the originating branch or a monitor clears; the finder never closes their own find. (NCIC originate-vs-locate discipline.)
5. **Court disposes, police don't.** Once deposited, a citation ends by payment, court outcome, or monitor void — never by editing the fine.
6. **Corrections are new rows.** Payments, releases, locates, and audit entries are append-only; voids stay queryable. (TCATS DELETE + re-ADD, never silent overwrite.)
7. **Access expires unless renewed.** Court grants lapse at `expires_at`; dormant accounts (>90 days) are deactivation candidates.
8. **Assess ≠ waive.** A tax officer bills and collects but can only *propose* waivers; only the tax compliance officer approves. The junior role never forgives money.

## Recertification checklist (quarterly, system admin)

- [ ] Open Access review: every dormant active account justified or deactivated.
- [ ] Blocked-transition counts (`status_rejected`) reviewed — repeated blocks mean either a training gap or a guard misfiring.
- [ ] Spot-check 5 receipts: payer + method + receiving branch present, issuer ≠ receiver.
- [ ] Spot-check 3 releases: hold basis present, releaser = hold authority or monitor, recipient ID recorded.
- [ ] Confirm no shared/counter logins exist (each `received_by` resolves to one human).
- [ ] This matrix still matches `lib/actions/*` — update both together when abilities change.
