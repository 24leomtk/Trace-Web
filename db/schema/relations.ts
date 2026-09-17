/**
 * Drizzle v1 relations — defineRelations replaces the old `relations()` helper.
 *
 * NOTE: for BOTH one and many, `from` must always be a column of the table the
 * relation is declared on, and `to` a column of the target table.
 *
 * Use `alias` when a table has multiple FK columns pointing to the same target
 * table (e.g. records.reportedBy vs courtCaseAccess.referredBy → users).
 */

import { defineRelations } from "drizzle-orm"
import * as schema from "./index"

export const appRelations = defineRelations(schema, (r) => ({
  // ══════════════════════════════════════════════════════════════════════════
  // users
  // ══════════════════════════════════════════════════════════════════════════
  users: {
    sessions: r.many.sessions({
      from: r.users.id,
      to: r.sessions.userId,
    }),
    accounts: r.many.accounts({
      from: r.users.id,
      to: r.accounts.userId,
    }),
    branch: r.one.branches({
      from: r.users.branchId,
      to: r.branches.id,
      optional: true,
    }),
    organization: r.one.organizations({
      from: r.users.organizationId,
      to: r.organizations.id,
      optional: true,
    }),
    // Case records this user filed (officer / monitor)
    filedRecords: r.many.records({
      from: r.users.id,
      to: r.records.reportedBy,
      alias: "records_as_reporter",
    }),
    // Vehicles this registrar verified
    verifiedVehicles: r.many.vehicles({
      from: r.users.id,
      to: r.vehicles.registeredBy,
      alias: "vehicles_as_registrar",
    }),
    // Court referrals made by this police user
    referralsMade: r.many.courtCaseAccess({
      from: r.users.id,
      to: r.courtCaseAccess.referredBy,
      alias: "referrals_as_referrer",
    }),
    // Court referrals granted to this liaison
    referralsReceived: r.many.courtCaseAccess({
      from: r.users.id,
      to: r.courtCaseAccess.courtLiaisonId,
      alias: "referrals_as_liaison",
    }),
    // Audit actions this user performed
    actionsAsActor: r.many.actions({
      from: r.users.id,
      to: r.actions.actorId,
      alias: "actions_as_actor",
    }),
    // Reviews this user wrote
    reviews: r.many.caseReviews({
      from: r.users.id,
      to: r.caseReviews.reviewerId,
    }),
    // In-app notifications for this user
    notifications: r.many.notifications({
      from: r.users.id,
      to: r.notifications.userId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // sessions / accounts / verifications
  // ══════════════════════════════════════════════════════════════════════════
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // branches
  // ══════════════════════════════════════════════════════════════════════════
  branches: {
    staff: r.many.users({
      from: r.branches.id,
      to: r.users.branchId,
    }),
    records: r.many.records({
      from: r.branches.id,
      to: r.records.branchId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // organizations
  // ══════════════════════════════════════════════════════════════════════════
  organizations: {
    staff: r.many.users({
      from: r.organizations.id,
      to: r.users.organizationId,
    }),
    policies: r.many.insurancePolicies({
      from: r.organizations.id,
      to: r.insurancePolicies.insurerId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // records
  // ══════════════════════════════════════════════════════════════════════════
  records: {
    reporter: r.one.users({
      from: r.records.reportedBy,
      to: r.users.id,
      alias: "record_reporter",
    }),
    branch: r.one.branches({
      from: r.records.branchId,
      to: r.branches.id,
    }),
    vehicle: r.one.vehicles({
      from: r.records.vehicleId,
      to: r.vehicles.id,
      optional: true,
    }),
    person: r.one.personsOfInterest({
      from: r.records.personId,
      to: r.personsOfInterest.id,
      optional: true,
    }),
    attachments: r.many.recordAttachments({
      from: r.records.id,
      to: r.recordAttachments.recordId,
    }),
    courtReferrals: r.many.courtCaseAccess({
      from: r.records.id,
      to: r.courtCaseAccess.recordId,
    }),
    actions: r.many.actions({
      from: r.records.id,
      to: r.actions.recordId,
    }),
    reviews: r.many.caseReviews({
      from: r.records.id,
      to: r.caseReviews.recordId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // record_attachments
  // ══════════════════════════════════════════════════════════════════════════
  recordAttachments: {
    record: r.one.records({
      from: r.recordAttachments.recordId,
      to: r.records.id,
      optional: true,
    }),
    person: r.one.personsOfInterest({
      from: r.recordAttachments.personId,
      to: r.personsOfInterest.id,
      optional: true,
    }),
    vehicle: r.one.vehicles({
      from: r.recordAttachments.vehicleId,
      to: r.vehicles.id,
      optional: true,
    }),
    uploader: r.one.users({
      from: r.recordAttachments.uploadedBy,
      to: r.users.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // persons_of_interest
  // ══════════════════════════════════════════════════════════════════════════
  personsOfInterest: {
    records: r.many.records({
      from: r.personsOfInterest.id,
      to: r.records.personId,
    }),
    attachments: r.many.recordAttachments({
      from: r.personsOfInterest.id,
      to: r.recordAttachments.personId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // vehicles
  // ══════════════════════════════════════════════════════════════════════════
  vehicles: {
    registrar: r.one.users({
      from: r.vehicles.registeredBy,
      to: r.users.id,
      optional: true,
      alias: "vehicle_registrar",
    }),
    records: r.many.records({
      from: r.vehicles.id,
      to: r.records.vehicleId,
    }),
    policies: r.many.insurancePolicies({
      from: r.vehicles.id,
      to: r.insurancePolicies.vehicleId,
    }),
    attachments: r.many.recordAttachments({
      from: r.vehicles.id,
      to: r.recordAttachments.vehicleId,
    }),
    actions: r.many.actions({
      from: r.vehicles.id,
      to: r.actions.vehicleId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // insurance_policies
  // ══════════════════════════════════════════════════════════════════════════
  insurancePolicies: {
    vehicle: r.one.vehicles({
      from: r.insurancePolicies.vehicleId,
      to: r.vehicles.id,
    }),
    insurer: r.one.organizations({
      from: r.insurancePolicies.insurerId,
      to: r.organizations.id,
    }),
    enteredByUser: r.one.users({
      from: r.insurancePolicies.enteredBy,
      to: r.users.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // court_case_access
  // ══════════════════════════════════════════════════════════════════════════
  courtCaseAccess: {
    record: r.one.records({
      from: r.courtCaseAccess.recordId,
      to: r.records.id,
    }),
    courtLiaison: r.one.users({
      from: r.courtCaseAccess.courtLiaisonId,
      to: r.users.id,
      alias: "referral_liaison",
    }),
    referrer: r.one.users({
      from: r.courtCaseAccess.referredBy,
      to: r.users.id,
      alias: "referral_referrer",
    }),
    documents: r.many.referralDocuments({
      from: r.courtCaseAccess.id,
      to: r.referralDocuments.referralId,
    }),
  },
  referralDocuments: {
    referral: r.one.courtCaseAccess({
      from: r.referralDocuments.referralId,
      to: r.courtCaseAccess.id,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // coded projections
  // ══════════════════════════════════════════════════════════════════════════
  missingPersonCases: {
    record: r.one.records({
      from: r.missingPersonCases.recordId,
      to: r.records.id,
    }),
    person: r.one.personsOfInterest({
      from: r.missingPersonCases.personId,
      to: r.personsOfInterest.id,
      optional: true,
    }),
  },
  wantedPersonCases: {
    record: r.one.records({
      from: r.wantedPersonCases.recordId,
      to: r.records.id,
    }),
    person: r.one.personsOfInterest({
      from: r.wantedPersonCases.personId,
      to: r.personsOfInterest.id,
      optional: true,
    }),
  },
  vehicleCases: {
    record: r.one.records({
      from: r.vehicleCases.recordId,
      to: r.records.id,
    }),
    vehicle: r.one.vehicles({
      from: r.vehicleCases.vehicleId,
      to: r.vehicles.id,
    }),
  },
  accidents: {
    record: r.one.records({
      from: r.accidents.recordId,
      to: r.records.id,
    }),
    vehicles: r.many.accidentVehicles({
      from: r.accidents.id,
      to: r.accidentVehicles.accidentId,
    }),
  },
  accidentVehicles: {
    accident: r.one.accidents({
      from: r.accidentVehicles.accidentId,
      to: r.accidents.id,
    }),
    vehicle: r.one.vehicles({
      from: r.accidentVehicles.vehicleId,
      to: r.vehicles.id,
    }),
  },
  trafficCitations: {
    record: r.one.records({
      from: r.trafficCitations.recordId,
      to: r.records.id,
    }),
    vehicle: r.one.vehicles({
      from: r.trafficCitations.vehicleId,
      to: r.vehicles.id,
      optional: true,
    }),
    court: r.one.organizations({
      from: r.trafficCitations.courtId,
      to: r.organizations.id,
      optional: true,
    }),
    payments: r.many.citationPayments({
      from: r.trafficCitations.recordId,
      to: r.citationPayments.recordId,
    }),
  },
  citationPayments: {
    record: r.one.records({
      from: r.citationPayments.recordId,
      to: r.records.id,
    }),
    receiver: r.one.users({
      from: r.citationPayments.receivedBy,
      to: r.users.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // case_reviews
  // ══════════════════════════════════════════════════════════════════════════
  caseReviews: {
    record: r.one.records({
      from: r.caseReviews.recordId,
      to: r.records.id,
    }),
    reviewer: r.one.users({
      from: r.caseReviews.reviewerId,
      to: r.users.id,
    }),
  },
  caseAssignments: {
    record: r.one.records({
      from: r.caseAssignments.recordId,
      to: r.records.id,
    }),
    assignee: r.one.users({
      from: r.caseAssignments.assigneeId,
      to: r.users.id,
      alias: "assignment_assignee",
    }),
    assigner: r.one.users({
      from: r.caseAssignments.assignedBy,
      to: r.users.id,
      alias: "assignment_assigner",
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // notifications
  // ══════════════════════════════════════════════════════════════════════════
  notifications: {
    user: r.one.users({
      from: r.notifications.userId,
      to: r.users.id,
    }),
    record: r.one.records({
      from: r.notifications.recordId,
      to: r.records.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // actions (audit log)
  // ══════════════════════════════════════════════════════════════════════════
  actions: {
    actor: r.one.users({
      from: r.actions.actorId,
      to: r.users.id,
      alias: "action_actor",
    }),
    record: r.one.records({
      from: r.actions.recordId,
      to: r.records.id,
      optional: true,
    }),
    vehicle: r.one.vehicles({
      from: r.actions.vehicleId,
      to: r.vehicles.id,
      optional: true,
    }),
  },
}))
