import { actions } from "./actions"
import { accounts, sessions, users, verifications } from "./auth"
import {
  diagnosisCodes,
  medicationCodes,
  immunizationCodes,
  immunizationSchedule,
  standardTreatmentGuidelines,
} from "./clinical"
import { diagnoses, immunizations, prescriptions } from "./coded"
import { accessGrants } from "./grants"
import { hospitals } from "./hospitals"
import { medicalRecords, recordAttachments } from "./records"

// Auth tables (better-auth managed + profile fields)
export * from "./auth"

// Core domain
export * from "./hospitals"

// Medical records
export * from "./records"

// Clinical reference / codebook (administrator-managed)
export * from "./clinical"

// Coded analytics facts (written by DB triggers)
export * from "./coded"

// Access control
export * from "./grants"

// Audit log
export * from "./actions"

// Enums (re-export so callers only need one import path)
export * from "./enums"
