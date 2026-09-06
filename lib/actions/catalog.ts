"use server"

import { asc } from "drizzle-orm"

import { db } from "@/db"
import { diagnosisCodes, immunizationCodes, medicationCodes } from "@/db/schema"

export interface DiagnosisOption {
  icd10Code: string
  name: string
  description: string
}

export interface MedicationOption {
  code: string
  name: string
  category: string | null
}

export interface VaccineOption {
  vaccineCode: string
  name: string
}

export async function listDiagnosisOptions(): Promise<DiagnosisOption[]> {
  return db
    .select({
      icd10Code: diagnosisCodes.icd10Code,
      name: diagnosisCodes.name,
      description: diagnosisCodes.description,
    })
    .from(diagnosisCodes)
    .orderBy(asc(diagnosisCodes.name))
}

export async function listMedicationOptions(): Promise<MedicationOption[]> {
  return db
    .select({
      code: medicationCodes.code,
      name: medicationCodes.name,
      category: medicationCodes.category,
    })
    .from(medicationCodes)
    .orderBy(asc(medicationCodes.name))
}

export async function listVaccineOptions(): Promise<VaccineOption[]> {
  return db
    .select({
      vaccineCode: immunizationCodes.vaccineCode,
      name: immunizationCodes.name,
    })
    .from(immunizationCodes)
    .orderBy(asc(immunizationCodes.name))
}
