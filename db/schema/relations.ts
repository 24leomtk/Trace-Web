/**
 * Drizzle v1 relations — defineRelations replaces the old `relations()` helper.
 *
 * API shape:
 *   defineRelations(schema, (r) => ({
 *     tableName: {
 *       relationFieldName: r.one.targetTable({ from: r.tableName.col, to: r.targetTable.col }),
 *       relationFieldName: r.many.targetTable({ from: r.tableName.col, to: r.targetTable.col }),
 *     },
 *   }))
 *
 * NOTE: for BOTH one and many, `from` must always be a column of the table the
 * relation is declared on, and `to` a column of the target table. Drizzle
 * throws `all "from" columns must belong to table "<name>"` otherwise.
 *
 * Use `alias` when a table has multiple FK columns pointing to the same target
 * table (e.g. actions.profileId, actions.actorId, actions.reviewedBy → users).
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
    hospital: r.one.hospitals({
      from: r.users.hospitalId,
      to: r.hospitals.id,
      optional: true,
    }),
    // Records this user owns (patient)
    medicalRecords: r.many.medicalRecords({
      from: r.users.id,
      to: r.medicalRecords.profileId,
      alias: "records_as_patient",
    }),
    // Records this user created (doctor/clinician)
    createdRecords: r.many.medicalRecords({
      from: r.users.id,
      to: r.medicalRecords.createdBy,
      alias: "records_as_doctor",
    }),
    diagnoses: r.many.diagnoses({
      from: r.users.id,
      to: r.diagnoses.profileId,
    }),
    prescriptions: r.many.prescriptions({
      from: r.users.id,
      to: r.prescriptions.profileId,
    }),
    immunizations: r.many.immunizations({
      from: r.users.id,
      to: r.immunizations.profileId,
    }),
    // Access grants where this user is the patient
    accessGrantsAsPatient: r.many.accessGrants({
      from: r.users.id,
      to: r.accessGrants.profileId,
      alias: "grants_as_patient",
    }),
    // Access grants where this user is the doctor
    accessGrantsAsDoctor: r.many.accessGrants({
      from: r.users.id,
      to: r.accessGrants.doctorId,
      alias: "grants_as_doctor",
    }),
    // Audit actions where this user's data was touched
    actionsAsSubject: r.many.actions({
      from: r.users.id,
      to: r.actions.profileId,
      alias: "actions_as_subject",
    }),
    // Audit actions this user performed
    actionsAsActor: r.many.actions({
      from: r.users.id,
      to: r.actions.actorId,
      alias: "actions_as_actor",
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
  // hospitals
  // ══════════════════════════════════════════════════════════════════════════
  hospitals: {
    staff: r.many.users({
      from: r.hospitals.id,
      to: r.users.hospitalId,
    }),
    medicalRecords: r.many.medicalRecords({
      from: r.hospitals.id,
      to: r.medicalRecords.hospitalId,
    }),
    diagnoses: r.many.diagnoses({
      from: r.hospitals.id,
      to: r.diagnoses.hospitalId,
    }),
    prescriptions: r.many.prescriptions({
      from: r.hospitals.id,
      to: r.prescriptions.hospitalId,
    }),
    immunizations: r.many.immunizations({
      from: r.hospitals.id,
      to: r.immunizations.hospitalId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // medical_records
  // ══════════════════════════════════════════════════════════════════════════
  medicalRecords: {
    patient: r.one.users({
      from: r.medicalRecords.profileId,
      to: r.users.id,
      alias: "record_patient",
    }),
    doctor: r.one.users({
      from: r.medicalRecords.createdBy,
      to: r.users.id,
      optional: true,
      alias: "record_doctor",
    }),
    hospital: r.one.hospitals({
      from: r.medicalRecords.hospitalId,
      to: r.hospitals.id,
      optional: true,
    }),
    attachments: r.many.recordAttachments({
      from: r.medicalRecords.id,
      to: r.recordAttachments.recordId,
    }),
    diagnoses: r.many.diagnoses({
      from: r.medicalRecords.id,
      to: r.diagnoses.recordId,
    }),
    prescriptions: r.many.prescriptions({
      from: r.medicalRecords.id,
      to: r.prescriptions.recordId,
    }),
    immunizations: r.many.immunizations({
      from: r.medicalRecords.id,
      to: r.immunizations.recordId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // record_attachments
  // ══════════════════════════════════════════════════════════════════════════
  recordAttachments: {
    record: r.one.medicalRecords({
      from: r.recordAttachments.recordId,
      to: r.medicalRecords.id,
    }),
    uploader: r.one.users({
      from: r.recordAttachments.uploadedBy,
      to: r.users.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // diagnoses
  // ══════════════════════════════════════════════════════════════════════════
  diagnoses: {
    record: r.one.medicalRecords({
      from: r.diagnoses.recordId,
      to: r.medicalRecords.id,
    }),
    patient: r.one.users({
      from: r.diagnoses.profileId,
      to: r.users.id,
    }),
    hospital: r.one.hospitals({
      from: r.diagnoses.hospitalId,
      to: r.hospitals.id,
      optional: true,
    }),
    icd10: r.one.diagnosisCodes({
      from: r.diagnoses.icd10Code,
      to: r.diagnosisCodes.icd10Code,
    }),
    // Prescriptions that were written against this diagnosis
    prescriptions: r.many.prescriptions({
      from: r.diagnoses.id,
      to: r.prescriptions.diagnosisId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // prescriptions
  // ══════════════════════════════════════════════════════════════════════════
  prescriptions: {
    record: r.one.medicalRecords({
      from: r.prescriptions.recordId,
      to: r.medicalRecords.id,
    }),
    patient: r.one.users({
      from: r.prescriptions.profileId,
      to: r.users.id,
    }),
    diagnosis: r.one.diagnoses({
      from: r.prescriptions.diagnosisId,
      to: r.diagnoses.id,
      optional: true,
    }),
    hospital: r.one.hospitals({
      from: r.prescriptions.hospitalId,
      to: r.hospitals.id,
      optional: true,
    }),
    medication: r.one.medicationCodes({
      from: r.prescriptions.medicationCode,
      to: r.medicationCodes.code,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // immunizations
  // ══════════════════════════════════════════════════════════════════════════
  immunizations: {
    record: r.one.medicalRecords({
      from: r.immunizations.recordId,
      to: r.medicalRecords.id,
    }),
    patient: r.one.users({
      from: r.immunizations.profileId,
      to: r.users.id,
    }),
    hospital: r.one.hospitals({
      from: r.immunizations.hospitalId,
      to: r.hospitals.id,
      optional: true,
    }),
    vaccine: r.one.immunizationCodes({
      from: r.immunizations.vaccineCode,
      to: r.immunizationCodes.vaccineCode,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // access_grants
  // ══════════════════════════════════════════════════════════════════════════
  accessGrants: {
    patient: r.one.users({
      from: r.accessGrants.profileId,
      to: r.users.id,
      alias: "grant_patient",
    }),
    doctor: r.one.users({
      from: r.accessGrants.doctorId,
      to: r.users.id,
      alias: "grant_doctor",
    }),
    issuer: r.one.users({
      from: r.accessGrants.issuedBy,
      to: r.users.id,
      alias: "grant_issuer",
    }),
    actions: r.many.actions({
      from: r.accessGrants.id,
      to: r.actions.accessGrantId,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // actions (audit log)
  // ══════════════════════════════════════════════════════════════════════════
  actions: {
    subject: r.one.users({
      from: r.actions.profileId,
      to: r.users.id,
      alias: "action_subject",
    }),
    actor: r.one.users({
      from: r.actions.actorId,
      to: r.users.id,
      alias: "action_actor",
    }),
    reviewer: r.one.users({
      from: r.actions.reviewedBy,
      to: r.users.id,
      optional: true,
      alias: "action_reviewer",
    }),
    accessGrant: r.one.accessGrants({
      from: r.actions.accessGrantId,
      to: r.accessGrants.id,
      optional: true,
    }),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Clinical reference tables
  // ══════════════════════════════════════════════════════════════════════════
  diagnosisCodes: {
    diagnoses: r.many.diagnoses({
      from: r.diagnosisCodes.icd10Code,
      to: r.diagnoses.icd10Code,
    }),
    treatmentGuidelines: r.many.standardTreatmentGuidelines({
      from: r.diagnosisCodes.icd10Code,
      to: r.standardTreatmentGuidelines.icd10Code,
    }),
  },
  medicationCodes: {
    prescriptions: r.many.prescriptions({
      from: r.medicationCodes.code,
      to: r.prescriptions.medicationCode,
    }),
    treatmentGuidelines: r.many.standardTreatmentGuidelines({
      from: r.medicationCodes.code,
      to: r.standardTreatmentGuidelines.medicationCode,
    }),
  },
  immunizationCodes: {
    immunizations: r.many.immunizations({
      from: r.immunizationCodes.vaccineCode,
      to: r.immunizations.vaccineCode,
    }),
    schedule: r.many.immunizationSchedule({
      from: r.immunizationCodes.vaccineCode,
      to: r.immunizationSchedule.vaccineCode,
    }),
  },
  immunizationSchedule: {
    vaccine: r.one.immunizationCodes({
      from: r.immunizationSchedule.vaccineCode,
      to: r.immunizationCodes.vaccineCode,
    }),
  },
  standardTreatmentGuidelines: {
    diagnosis: r.one.diagnosisCodes({
      from: r.standardTreatmentGuidelines.icd10Code,
      to: r.diagnosisCodes.icd10Code,
    }),
    medication: r.one.medicationCodes({
      from: r.standardTreatmentGuidelines.medicationCode,
      to: r.medicationCodes.code,
    }),
  },
}))
