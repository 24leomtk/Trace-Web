# TRACE — Tracking, Records & Case Evidence

## 1. Platform Overview

TRACE is a shared digital records platform for law enforcement, built around
two operational domains that run on the same infrastructure but serve
different day-to-day work:

- **Regular domain** — general policing: missing persons, wanted persons,
  stolen property, crime incidents, arrests.
- **Traffic domain** — road policing: missing/flagged vehicles, vehicle
  offenses, accidents, citations, impoundments, and vehicle insurance status.

Beyond the two police domains, TRACE also gives portal access to three
**external organizations** that need to interact directly with the
platform rather than through an intermediary or a batch data feed:
**courts**, **insurers**, and the **vehicle registry authority**. Their
staff hold real accounts, scoped to their own organization rather than to
a police branch.

Shared building blocks across all of this:

| Building block                     | What it is                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Branches**                       | Police stations/posts, each tagged with a domain and district                                                          |
| **Organizations**                  | External bodies with portal accounts — courts, insurers, the vehicle registry authority                                |
| **Users**                          | Police staff (scoped to a branch, district, or the whole country) or organization staff (scoped to their organization) |
| **Records**                        | The actual case entries — one row per report, typed by `record_type`                                                   |
| **Vehicles / Persons of Interest** | Shared reference entities that multiple cases can point back to                                                        |
| **Insurance Policies**             | Entered and maintained directly by insurer staff through TRACE — not an external batch import                          |
| **Court Case Access**              | Per-record grants that give a specific court liaison visibility into a specific referred case                          |
| **Audit Log**                      | An append-only trail of who viewed or touched what, and when                                                           |

The guiding idea: **an officer's default view is narrow (their branch), and
visibility widens deliberately** — a district monitor sees their district,
a country monitor sees the whole country, and anything that needs to be
searchable beyond its home branch has to be explicitly marked that way via
its `access_level` (`branch` / `district` / `country`). The same
"deliberate widening" logic applies to the external roles: a court liaison
sees nothing until a specific case is referred to them, an insurer sees
only their own policies, and a vehicle registrar's edits are tracked
separately from an officer's ad hoc entries so the two are never confused.

---

## 2. User Types

### Police roles (domain-scoped)

#### 2.1 Officer _(regular or traffic)_

The front-line user. Files reports, works cases, and is the one most often
checking "is this person wanted" or "is this vehicle flagged" in the field.

#### 2.2 District Monitor _(regular or traffic)_

Oversight for one district. Reviews what officers under them are filing,
escalates cases that need wider visibility, and refers cases to a court
liaison when they're headed for prosecution.

#### 2.3 Country Monitor _(regular or traffic)_

Nationwide oversight for their domain. Works with aggregate data and
country-level cases (wanted bulletins, major incidents, national accident
trends), and oversees district monitors' review activity.

### Platform roles (cross-domain, no case-data access)

#### 2.4 System Administrator

Provisions branches, organizations, and user accounts (since there's no
self-registration), manages phone numbers tied to accounts, and
deactivates users who leave. **Has no access to case data itself** —
separation of duties between "who can log in" and "who can see
investigations" matters in a system like this.

#### 2.5 Data/Compliance Auditor

Read-only, cross-domain access to the **audit log only**. No case data,
no ability to open a record — this role exists purely for external
oversight of how the system itself is being used.

### External organization roles (scoped by organization, not branch/district)

#### 2.6 Court/Prosecution Liaison

Belongs to a specific court. Sees nothing by default — a police monitor
explicitly refers a case to them (`court_case_access`), and that grant is
what gives them visibility into that one record. Can be revoked once a
case concludes.

#### 2.7 Insurance Portal User

Belongs to a specific insurer. Creates and maintains that insurer's own
policies directly in TRACE — this replaced the earlier plan to pull
insurance data in via an external batch feed. An insurer can only see and
edit its own policies, never another insurer's.

#### 2.8 Vehicle Registrar

Belongs to the vehicle registry authority. Creates and formally verifies
vehicle records against the official registry. This is distinct from the
ad hoc vehicle rows officers create when a plate first comes up in a case
— a registrar's verification enriches or confirms that same row rather
than replacing it, so existing case links never break.

---

## 3. Access & Permissions by Role

### 3.1 Officer

| Can do                        | Detail                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Create** records            | Any record type in their own domain, tagged to their own branch and district                                                                                                                                       |
| **Read** records              | All records filed at their branch, plus any record (from any branch) marked `access_level: district` or `access_level: country`                                                                                    |
| **Update** records            | Records they filed, while status is `active` — edits after that (or by anyone else) should be logged as a reviewed change, not a silent overwrite                                                                  |
| **Set** access level          | Can mark their own record `district` or `country` if it needs wider reach                                                                                                                                          |
| **Read (safety lookup only)** | A narrow, cross-domain check — "is this national ID wanted" / "is this plate flagged" — returns a yes/no plus minimal detail, not the full case file                                                               |
| **Create** vehicle rows       | Ad hoc, when a case references a plate not yet in the registry (`is_verified: false` until a registrar confirms it)                                                                                                |
| **Cannot**                    | See records scoped to other branches/districts that weren't escalated; see the audit log; create or edit users/branches/organizations; edit insurance data; refer a case to a court liaison (monitor-level action) |

### 3.2 District Monitor

| Can do                                  | Detail                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read** records                        | Every record in their district, across all branches and all access levels, in their domain                                                                     |
| **Create** records                      | Same as officers, plus district-wide bulletins (e.g. a wanted-person notice meant to circulate to every branch in the district)                                |
| **Update** records                      | Anything in their district — status changes, reassigning to a different branch, marking resolved/closed                                                        |
| **Escalate / de-escalate** access level | Can promote a branch-level case to `district` or `country`, or pull one back down                                                                              |
| **Refer to court**                      | Grants a specific `court_liaison` access to a specific record via `court_case_access`, with a reason and a time-boxed `expires_at`; can renew before it lapses |
| **Review**                              | Mark records as reviewed, add follow-up notes                                                                                                                  |
| **Read** audit log                      | For their own district only                                                                                                                                    |
| **Cannot**                              | See or act on another district's branch-scoped records; manage users/branches/organizations; see the other domain's data                                       |

### 3.3 Country Monitor

| Can do                    | Detail                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Read** records          | Everything in their domain marked `access_level: country`, plus aggregate/statistical access to district- and branch-level records for reporting |
| **Create** records        | National-level bulletins and cases                                                                                                               |
| **Escalate** access level | Can promote any record in their domain to `country`                                                                                              |
| **Refer to court**        | Same as district monitor, nationwide                                                                                                             |
| **Run reports**           | Aggregate analytics — trends by district, case-type volumes, resolution rates                                                                    |
| **Read** audit log        | Domain-wide, across all districts                                                                                                                |
| **Cannot**                | Edit user/branch/organization accounts directly; access the other domain; bypass the audit log                                                   |

> **Note on "aggregate access":** whether a country monitor can open any
> individual branch-level case, or only ones already escalated to
> `country`, is a policy call worth making explicitly. The safer default:
> full access to aggregates and to anything escalated, but opening an
> un-escalated branch-level case requires a logged "cross-district access"
> action with a reason.

### 3.4 System Administrator

| Can do                                     | Detail                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Create/edit/deactivate** users           | Including assigning role, domain, branch, district, or organization                                            |
| **Manage** phone numbers                   | Add/remove login numbers on a user's account                                                                   |
| **Create/edit** branches and organizations | Add new stations/posts, courts, insurers, or the registry authority; correct district assignments              |
| **Read** audit log                         | Full visibility, for compliance and incident investigation                                                     |
| **Cannot**                                 | Read, create, or edit any actual case record, vehicle, person-of-interest, insurance policy, or court referral |

### 3.5 Data/Compliance Auditor

| Can do             | Detail                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Read** audit log | Full visibility, cross-domain, all districts and organizations                                                        |
| **Cannot**         | Read any case record, vehicle, person-of-interest, or insurance data; take any action that would itself need auditing |

### 3.6 Court/Prosecution Liaison

| Can do                  | Detail                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read** records        | Only records explicitly referred to them via `court_case_access`, and only while that grant is unexpired and unrevoked                                                                                                       |
| **Read** attachments    | For a referred record, the same attachments an officer/monitor would see                                                                                                                                                     |
| **Record** case outcome | Sets `outcome` (charged / dismissed / convicted / acquitted / withdrawn / other) plus free-text notes on the referral once known — this is what closes the loop back to the referring police user                            |
| **Cannot**              | Browse or search records generally; see a case after its access has expired or been revoked; renew their own access (a monitor does that); edit any record, vehicle, or person-of-interest data; see other courts' referrals |

### 3.7 Insurance Portal User

| Can do                                     | Detail                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create/update** insurance policies       | For their own organization only (`insurer_id` fixed to their organization)                                                                                                                   |
| **Read** their own organization's policies | Full history, including expired/inactive ones                                                                                                                                                |
| **Look up** a vehicle's flagged status     | Self-serve check — "is this plate currently associated with an open case" — returns only the `is_flagged` boolean, not case detail; logged as `insurer_flag_lookup`                          |
| **Cannot**                                 | See another insurer's policies; read any case record, person-of-interest data, or vehicle detail beyond the flag and what's needed to attach a policy to a plate; edit vehicle registry data |

### 3.8 Vehicle Registrar

| Can do                                     | Detail                                                                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create** vehicle records                 | Authoritative entries, `is_verified: true` from the start                                                                                                                                                                                       |
| **Verify/enrich** existing vehicle records | Confirms or corrects a row an officer created ad hoc, without changing its id — existing case links keep working                                                                                                                                |
| **Read** vehicle records                   | Full registry, nationwide                                                                                                                                                                                                                       |
| **Cannot**                                 | Read case records, person-of-interest data, or insurance policies; see _why_ a vehicle was flagged — only that it is, if that's even exposed to this role at all (a policy choice: registrars may not need flag visibility to do registry work) |

---

## 4. Cross-Cutting, Common-Sense Rules

- **Cross-domain safety lookups are read-only and minimal.** A traffic
  officer checking a driver's ID against the wanted list, or a regular
  officer checking a plate at a crime scene, should get a flag and just
  enough detail to act safely — not a backdoor into the other domain's
  full case files.
- **Escalation is an action, not a default.** Nothing should become
  district- or country-visible, or visible to a court liaison, just
  because someone happened to look at it — it has to be a deliberate,
  logged decision.
- **External access expires unless renewed.** A `court_case_access` grant
  lapses on its own once `expires_at` passes — a monitor has to actively
  extend it, rather than access defaulting to indefinite until someone
  remembers to revoke it.
- **Referrals close the loop.** A court liaison records the case outcome
  back onto the referral itself, so the referring police user (and anyone
  auditing the case later) can see what happened without a separate
  out-of-band conversation.
- **Every external role is scoped to its own organization.** An insurer
  sees only its own policies (plus a flag-only lookup on any vehicle); a
  court liaison sees only cases referred to their specific court/account.
  There is no "browse everything" view for any external role.
- **Ad hoc and authoritative data coexist without conflict.** An officer
  can reference a vehicle that doesn't exist in the registry yet; a
  registrar's later verification enriches that same row rather than
  creating a duplicate or overwriting case history.
- **Vehicles and persons-of-interest are shared, not domain-owned.** A
  vehicle flagged in a Regular-domain crime record and a Traffic-domain
  offense record resolve to the _same_ vehicle row.
- **Every access outside "my own scope" gets logged.** That's what makes
  wide read access (district/country monitors), cross-domain lookups, and
  cross-organization interactions (referrals, insurer entries, registrar
  verifications) safe to grant in the first place — and it's the only
  thing the compliance auditor role ever looks at.
