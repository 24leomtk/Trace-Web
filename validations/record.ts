import * as z from "zod"

export const routeOptions = ["ORAL", "IV", "IM", "SC", "TOPICAL"] as const

export const urgencyOptions = ["LOW", "MEDIUM", "HIGH"] as const

export const triageOptions = ["RED", "YELLOW", "GREEN"] as const

export const outpatientVisitSchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  icd10_code: z.string().min(1).optional(),
  visit_type: z.literal("OUTPATIENT"),
  chief_complaint: z.string().min(1),
  history_of_present_illness: z.string().min(1),
  physical_exam: z.object({
    bp: z.string().min(1),
    pulse: z.string().min(1),
    temperature: z.string().min(1),
  }),
  assessment: z.string().min(1),
  plan: z.string().min(1),
})

export const emergencyVisitSchema = z.object({
  visit_type: z.literal("EMERGENCY"),
  arrival_mode: z.string().min(1),
  triage_level: z.enum(triageOptions),
  presenting_symptoms: z.array(z.string().min(1)),
  initial_interventions: z.array(z.string().min(1)),
})

export const inpatientAdmissionSchema = z.object({
  admission_reason: z.string().min(1),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ward: z.string().min(1),
  bed_number: z.string().min(1),
  attending_physician: z.string().min(1),
})

export const labTestResultSchema = z.object({
  test_name: z.string().min(1),
  specimen: z.string().min(1),
  results: z.array(
    z.object({
      parameter: z.string().min(1),
      value: z.string().min(1),
      unit: z.string().min(1),
      reference_range: z.string().min(1),
    })
  ),
  performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const imagingReportSchema = z.object({
  modality: z.string().min(1),
  body_part: z.string().min(1),
  findings: z.string().min(1),
  impression: z.string().min(1),
  radiologist: z.string().min(1),
})

export const pathologyReportSchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  icd10_code: z.string().min(1).optional(),
  specimen_type: z.string().min(1),
  site: z.string().min(1),
  histological_findings: z.string().min(1),
  diagnosis: z.string().min(1),
  grade: z.string().min(1),
})

export const medicationPrescriptionSchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  prescription_id: z.string().uuid().optional(),
  medication_code: z.string().min(1).optional(),
  medication: z.string().min(1),
  dose: z.string().min(1),
  route: z.enum(routeOptions),
  frequency: z.string().min(1),
  duration: z.string().min(1),
  indication: z.string().min(1),
})

export const medicationAdministrationSchema = z.object({
  medication: z.string().min(1),
  dose: z.string().min(1),
  route: z.enum(routeOptions),
  administered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  administered_by: z.string().min(1),
})

export const surgicalProcedureSchema = z.object({
  procedure_name: z.string().min(1),
  procedure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  surgeon: z.string().min(1),
  anesthesia: z.string().min(1),
  complications: z.string().optional(),
})

export const nursingNotesSchema = z.object({
  shift: z.string().min(1),
  observations: z.string().min(1),
  vital_signs: z.object({
    bp: z.string().min(1),
    pulse: z.string().min(1),
  }),
  notes: z.string().min(1),
})

export const intakeOutputChartSchema = z.object({
  intake: z.object({
    oral: z.string().min(1),
    iv: z.string().min(1),
  }),
  output: z.object({
    urine: z.string().min(1),
  }),
  net_balance: z.string().min(1),
})

export const immunizationRecordSchema = z.object({
  immunization_id: z.string().uuid().optional(),
  vaccine_code: z.string().min(1).optional(),
  vaccine: z.string().min(1),
  dose_number: z.number().int().min(1),
  manufacturer: z.string().min(1),
  administered_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const screeningTestSchema = z.object({
  screening_type: z.string().min(1),
  result: z.string().min(1),
  recommended_follow_up: z.string().min(1),
})

export const psychiatricEvaluationSchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  icd10_code: z.string().min(1).optional(),
  presenting_problem: z.string().min(1),
  mental_status_exam: z.object({
    mood: z.string().min(1),
    affect: z.string().min(1),
    thought_process: z.string().min(1),
  }),
  diagnosis: z.string().min(1),
  risk_assessment: z.string().min(1),
})

export const dischargeSummarySchema = z.object({
  diagnosis_id: z.string().uuid().optional(),
  icd10_code: z.string().min(1).optional(),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discharge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  final_diagnosis: z.string().min(1),
  treatments_given: z.array(z.string().min(1)),
  discharge_medications: z.array(z.string().min(1)),
  follow_up_instructions: z.string().min(1),
})

export const referralRecordSchema = z.object({
  referred_to: z.string().min(1),
  reason: z.string().min(1),
  urgency: z.enum(urgencyOptions),
})

export const recordSchemas = {
  outpatient_visit: outpatientVisitSchema,
  emergency_visit: emergencyVisitSchema,
  inpatient_admission: inpatientAdmissionSchema,
  lab_test_result: labTestResultSchema,
  imaging_report: imagingReportSchema,
  pathology_report: pathologyReportSchema,
  medication_prescription: medicationPrescriptionSchema,
  medication_administration: medicationAdministrationSchema,
  surgical_procedure: surgicalProcedureSchema,
  nursing_notes: nursingNotesSchema,
  intake_output_chart: intakeOutputChartSchema,
  immunization_record: immunizationRecordSchema,
  screening_test: screeningTestSchema,
  psychiatric_evaluation: psychiatricEvaluationSchema,
  discharge_summary: dischargeSummarySchema,
  referral_record: referralRecordSchema,
}

export type RecordType = keyof typeof recordSchemas
