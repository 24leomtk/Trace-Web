# Chipatala Registry — App Concept

### Malawi's National Medical Records Platform

## 1. The problem

Right now a patient's medical history lives on paper, or scattered
across whichever clinics they've visited, or in their own memory. That
falls apart in three specific moments: an emergency where the patient
can't speak for themselves, a referral or second opinion where a new
doctor is starting from zero, and a district or national health
authority trying to see the bigger picture — is a disease spreading,
are the right medicines reaching people, are children falling behind
on immunizations.

Chipatala Registry is one national record per person, accessible everywhere,
with the patient in control of who reads it, doctors able to log an
encounter and pull a patient's history with permission, and health
authorities able to see population-level trends without ever opening
an individual's file.

## 2. Who uses it

| Role               | Can do                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patient**        | See their own full history any time; generate a time-limited code for a specific doctor; revoke it early; see who has accessed their records and when                                                                                                                |
| **Doctor**         | See any patient's emergency info at any time; add records/prescriptions/immunizations to a patient's history during an encounter; view a patient's full history once handed a valid code, or via break-glass in a genuine emergency (reason required, always logged) |
| **District admin** | Everything a doctor can see for emergency info; full record access scoped to their own district (see note below); run disease/medicine/immunization reports for their district; manage hospitals and doctor accounts in their district                               |
| **Country admin**  | Same as district admin, unscoped — sees every district, manages the hospital list nationally                                                                                                                                                                         |

## 3. How access works, in plain terms

**A patient viewing their own history:** just logs in with phone + OTP.
That's it — no separate code needed to see your own data. It's yours,
the app already knows who you are.

**A doctor viewing a patient's history:** the patient generates a short
code from their app for a specific doctor, with a lifetime they choose
(an hour, a day, however long fits the visit or referral). They hand
it to the doctor — read aloud, shown on screen, however's practical.
The doctor enters it once in their app; that activates a temporary
window of access for exactly the length the patient chose. When it
expires, it's gone — the patient generates a fresh one for next time.

**Emergency info** (blood type, allergies, chronic conditions,
emergency contact) is different on purpose: any doctor can see it
immediately, without a code, because an unconscious patient can't hand
anyone anything. It's a small, deliberately limited slice of
information — not the full history — and every time it's read outside
a normal encounter, it's logged.

**True emergencies, full history:** if a doctor genuinely needs the
full record and there's no time or way to get a code (patient
unconscious, code lost, no signal), break-glass access lets them in
immediately — but it requires typing a real reason, and it's flagged
for a district or country admin to review afterward. This is meant to
be rare and visible, not a quiet backdoor.

**Admins and analytics:** district and country admins don't browse
individual patients' data day-to-day. Their main view is aggregate
reports — disease trends by district and month, which medicines are
being used where, and immunization coverage gaps — none of which ever
shows a group smaller than 5 people, so no report can be reverse-
engineered down to one patient. Raw record access for admins exists
for oversight (as scoped above) but every single read is logged the
same way a doctor's is.

## 4. What's tracked, and why

Every access to something beyond a patient's own data — a doctor
opening a chart, an admin pulling records, an emergency override, a
report being run — writes a row to a permanent, append-only log:
who did it, when, for whom, from where, and why (for emergencies).
Patients can see their own access history; nothing about who looked at
their file is invisible to them.

## 5. Data at rest

Records aren't individually encrypted by the patient anymore — that
model was rejected in favor of access control, mainly because it
turns a lost phone or forgotten code into permanently lost medical
history, and it makes exactly the population-level reporting this
platform exists for much harder to build. Instead, protection comes
from standard, well-understood layers: the database encrypts
everything on disk, all traffic is encrypted in transit, and — the
part that actually does the daily work — no one reads a row they
aren't authorized to, and every read outside "your own data" is
logged. This is the same trust model used by most deployed national
and hospital health record systems.

## 6. Building blocks (technical)

- **Auth:** Supabase Auth, phone number + OTP. No separate crypto
  layer to manage — losing a phone is a normal "verify and log back
  in" problem, not a data-loss event.
- **Database:** Postgres via Supabase, Row Level Security on every
  sensitive table, with the actual permission logic + audit logging
  centralized in a small set of database functions (`view_patient_
records`, `break_glass_access`, `request_doctor_access`, `redeem_
doctor_access`, and the report-pulling functions) rather than spread
  across app code.
- **Files:** Supabase Storage, private buckets, access mirrored to the
  same rules as the records they belong to.
- **Scheduled jobs:** `pg_cron` for two things — expiring stale codes
  every few minutes, and refreshing the aggregate analytics views
  overnight.
- **SMS / national ID lookups** (for account recovery when a patient's
  registered number is unreachable): an Edge Function that checks
  alternate numbers via the national registration bureau and sends a
  standard OTP — no special recovery cryptography needed anymore,
  since there's no encryption key tied to the phone.

## 7. What this deliberately leaves open for a v1 vs. later

Good enough for a first version:

- Doctor-issued access codes, break-glass, and emergency info as
  described above.
- District/country aggregate reporting on disease trends, medicine
  utilization, and immunization shortfalls.

Worth revisiting once the platform has real usage data:

- Whether district/country admins should keep raw record access at
  all, versus aggregate-only plus an audit-review workflow — the
  schema is built so that branch can be removed without restructuring
  anything else.
- A formal review queue UI for break-glass events, so "flagged for
  review" actually gets looked at on a schedule.
- Multi-factor protection on top of OTP for doctor and admin accounts
  specifically, given the amount of data a compromised doctor or admin
  login could reach.
