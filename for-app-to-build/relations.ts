/**
 * Drizzle v1 relations — see the reference schema for API notes.
 * `from` must be a column of the table the relation is declared on;
 * `to` a column of the target table.
 */

import { defineRelations } from "drizzle-orm"
import * as schema from "./index"

export const appRelations = defineRelations(schema, (r) => ({
  // ══════════════════════════════════════════════════════════════════════
  // users / branches / phone numbers
  // ══════════════════════════════════════════════════════════════════════
  users: {
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
    reportedRecords: r.many.records({
      from: r.users.id,
      to: r.records.reportedBy,
    }),
    registeredVehicles: r.many.vehicles({
      from: r.users.id,
      to: r.vehicles.registeredBy,
    }),
    enteredPolicies: r.many.insurancePolicies({
      from: r.users.id,
      to: r.insurancePolicies.enteredBy,
    }),
    // Records this user (as a court_liaison) has been granted access to
    courtCaseAccess: r.many.courtCaseAccess({
      from: r.users.id,
      to: r.courtCaseAccess.courtLiaisonId,
      alias: "court_liaison_grants",
    }),
    // Referrals this user (a police monitor) has made to a court_liaison
    referralsMade: r.many.courtCaseAccess({
      from: r.users.id,
      to: r.courtCaseAccess.referredBy,
      alias: "referrals_made",
    }),
    actions: r.many.actions({
      from: r.users.id,
      to: r.actions.actorId,
    }),
  },
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
  organizations: {
    staff: r.many.users({
      from: r.organizations.id,
      to: r.users.organizationId,
    }),
    // Present when orgType = 'insurer'
    policies: r.many.insurancePolicies({
      from: r.organizations.id,
      to: r.insurancePolicies.insurerId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // vehicles / persons / insurance
  // ══════════════════════════════════════════════════════════════════════
  vehicles: {
    registrar: r.one.users({
      from: r.vehicles.registeredBy,
      to: r.users.id,
      optional: true,
    }),
    policies: r.many.insurancePolicies({
      from: r.vehicles.id,
      to: r.insurancePolicies.vehicleId,
    }),
    records: r.many.records({
      from: r.vehicles.id,
      to: r.records.vehicleId,
    }),
    vehicleCases: r.many.vehicleCases({
      from: r.vehicles.id,
      to: r.vehicleCases.vehicleId,
    }),
    attachments: r.many.recordAttachments({
      from: r.vehicles.id,
      to: r.recordAttachments.vehicleId,
    }),
    lookups: r.many.actions({
      from: r.vehicles.id,
      to: r.actions.vehicleId,
    }),
  },
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

  // ══════════════════════════════════════════════════════════════════════
  // records / attachments
  // ══════════════════════════════════════════════════════════════════════
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
    actions: r.many.actions({
      from: r.records.id,
      to: r.actions.recordId,
    }),
    courtReferrals: r.many.courtCaseAccess({
      from: r.records.id,
      to: r.courtCaseAccess.recordId,
    }),
  },
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

  // ══════════════════════════════════════════════════════════════════════
  // coded lookup tables
  // ══════════════════════════════════════════════════════════════════════
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
  },

  // ══════════════════════════════════════════════════════════════════════
  // court referrals
  // ══════════════════════════════════════════════════════════════════════
  courtCaseAccess: {
    record: r.one.records({
      from: r.courtCaseAccess.recordId,
      to: r.records.id,
    }),
    courtLiaison: r.one.users({
      from: r.courtCaseAccess.courtLiaisonId,
      to: r.users.id,
      alias: "access_court_liaison",
    }),
    referrer: r.one.users({
      from: r.courtCaseAccess.referredBy,
      to: r.users.id,
      alias: "access_referrer",
    }),
    outcomeRecordedByUser: r.one.users({
      from: r.courtCaseAccess.outcomeRecordedBy,
      to: r.users.id,
      alias: "access_outcome_recorder",
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════
  // audit log
  // ══════════════════════════════════════════════════════════════════════
  actions: {
    actor: r.one.users({
      from: r.actions.actorId,
      to: r.users.id,
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
