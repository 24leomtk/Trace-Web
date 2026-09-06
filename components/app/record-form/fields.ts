import { routeOptions, triageOptions, urgencyOptions } from "@/validations/record"

export interface PlainFieldDef {
  kind?: undefined
  path: string
  label: string
  type?: "text" | "textarea" | "date" | "datetime-local" | "number"
  options?: readonly string[]
  placeholder?: string
  required?: boolean
  half?: boolean
}

export interface StringListDef {
  kind: "stringlist"
  path: string
  label: string
  placeholder?: string
}

export interface RowListDef {
  kind: "rowlist"
  path: string
  label: string
  itemLabel: string
  fields: PlainFieldDef[]
}

export type CatalogRef = "diagnosis" | "medication" | "vaccine"

export interface RefFieldDef {
  kind: "ref"
  ref: CatalogRef
  path: string
  label: string
  placeholder?: string
  required?: boolean
  half?: boolean
}

export type AnyFieldDef = PlainFieldDef | StringListDef | RowListDef | RefFieldDef

function f(
  path: string,
  label: string,
  extra: Partial<PlainFieldDef> = {}
): PlainFieldDef {
  return { path, label, required: true, ...extra }
}

export const RECORD_FORM_FIELDS: Record<string, AnyFieldDef[]> = {
  outpatient_visit: [
    {
      kind: "ref",
      ref: "diagnosis",
      path: "icd10_code",
      label: "Diagnosis (ICD-10)",
      required: false,
    },
    f("chief_complaint", "Chief complaint"),
    f("history_of_present_illness", "History of present illness", {
      type: "textarea",
    }),
    f("physical_exam.bp", "Blood pressure", { half: true, placeholder: "118/76" }),
    f("physical_exam.pulse", "Pulse (bpm)", { half: true, placeholder: "78" }),
    f("physical_exam.temperature", "Temperature (°C)", {
      half: true,
      placeholder: "36.8",
    }),
    f("assessment", "Assessment", { type: "textarea" }),
    f("plan", "Plan", { type: "textarea" }),
  ],
  emergency_visit: [
    f("arrival_mode", "Arrival mode", { placeholder: "Ambulance, taxi…" }),
    f("triage_level", "Triage level", { options: triageOptions }),
    { kind: "stringlist", path: "presenting_symptoms", label: "Presenting symptoms", placeholder: "Type a symptom and press Enter" },
    { kind: "stringlist", path: "initial_interventions", label: "Initial interventions", placeholder: "Type an intervention and press Enter" },
  ],
  inpatient_admission: [
    f("admission_reason", "Admission reason"),
    f("admission_date", "Admission date", { type: "date", half: true }),
    f("ward", "Ward", { half: true }),
    f("bed_number", "Bed number", { half: true }),
    f("attending_physician", "Attending physician", { half: true }),
  ],
  lab_test_result: [
    f("test_name", "Test name"),
    f("specimen", "Specimen", { half: true, placeholder: "Venous blood" }),
    f("performed_at", "Performed at", { type: "date", half: true }),
    {
      kind: "rowlist",
      path: "results",
      label: "Results",
      itemLabel: "Parameter",
      fields: [
        f("parameter", "Parameter"),
        f("value", "Value"),
        f("unit", "Unit"),
        f("reference_range", "Reference range"),
      ],
    },
  ],
  imaging_report: [
    f("modality", "Modality", { half: true, placeholder: "X-ray, ultrasound…" }),
    f("body_part", "Body part", { half: true }),
    f("findings", "Findings", { type: "textarea" }),
    f("impression", "Impression", { type: "textarea" }),
    f("radiologist", "Radiologist"),
  ],
  pathology_report: [
    f("specimen_type", "Specimen type"),
    f("site", "Site"),
    {
      kind: "ref",
      ref: "diagnosis",
      path: "icd10_code",
      label: "Coded diagnosis (ICD-10)",
      required: false,
    },
    f("histological_findings", "Histological findings", { type: "textarea" }),
    f("diagnosis", "Diagnosis"),
    f("grade", "Grade", { half: true }),
  ],
  medication_prescription: [
    {
      kind: "ref",
      ref: "medication",
      path: "medication",
      label: "Medication",
      placeholder: "Search the formulary…",
    },
    f("dose", "Dose", { half: true, placeholder: "20mg" }),
    f("route", "Route", { options: routeOptions, half: true }),
    f("frequency", "Frequency", { half: true, placeholder: "Twice daily" }),
    f("duration", "Duration", { half: true, placeholder: "5 days" }),
    f("indication", "Indication"),
  ],
  medication_administration: [
    f("medication", "Medication"),
    f("dose", "Dose", { half: true }),
    f("route", "Route", { options: routeOptions, half: true }),
    f("administered_at", "Administered at", { type: "datetime-local" }),
    f("administered_by", "Administered by"),
  ],
  surgical_procedure: [
    f("procedure_name", "Procedure name"),
    f("procedure_date", "Procedure date", { type: "date", half: true }),
    f("surgeon", "Surgeon", { half: true }),
    f("anesthesia", "Anesthesia", { half: true }),
    f("complications", "Complications (optional)", {
      type: "textarea",
      required: false,
    }),
  ],
  nursing_notes: [
    f("shift", "Shift"),
    f("vital_signs.bp", "Blood pressure", { half: true }),
    f("vital_signs.pulse", "Pulse", { half: true }),
    f("observations", "Observations", { type: "textarea" }),
    f("notes", "Notes", { type: "textarea" }),
  ],
  intake_output_chart: [
    f("intake.oral", "Oral intake", { half: true }),
    f("intake.iv", "IV intake", { half: true }),
    f("output.urine", "Urine output", { half: true }),
    f("net_balance", "Net balance", { half: true }),
  ],
  immunization_record: [
    {
      kind: "ref",
      ref: "vaccine",
      path: "vaccine",
      label: "Vaccine",
      placeholder: "Search vaccines…",
    },
    f("dose_number", "Dose number", { type: "number", half: true }),
    f("manufacturer", "Manufacturer", { half: true }),
    f("administered_at", "Administered at", { type: "date", half: true }),
  ],
  screening_test: [
    f("screening_type", "Screening type"),
    f("result", "Result"),
    f("recommended_follow_up", "Recommended follow-up", { type: "textarea" }),
  ],
  psychiatric_evaluation: [
    f("presenting_problem", "Presenting problem", { type: "textarea" }),
    {
      kind: "ref",
      ref: "diagnosis",
      path: "icd10_code",
      label: "Coded diagnosis (ICD-10)",
      required: false,
    },
    f("mental_status_exam.mood", "Mood", { half: true }),
    f("mental_status_exam.affect", "Affect", { half: true }),
    f("mental_status_exam.thought_process", "Thought process"),
    f("diagnosis", "Diagnosis"),
    f("risk_assessment", "Risk assessment", { type: "textarea" }),
  ],
  discharge_summary: [
    f("admission_date", "Admission date", { type: "date", half: true }),
    f("discharge_date", "Discharge date", { type: "date", half: true }),
    f("final_diagnosis", "Final diagnosis"),
    {
      kind: "ref",
      ref: "diagnosis",
      path: "icd10_code",
      label: "Coded diagnosis (ICD-10)",
      required: false,
    },
    { kind: "stringlist", path: "treatments_given", label: "Treatments given", placeholder: "Type a treatment and press Enter" },
    { kind: "stringlist", path: "discharge_medications", label: "Discharge medications", placeholder: "Type a medicine and press Enter" },
    f("follow_up_instructions", "Follow-up instructions", { type: "textarea" }),
  ],
  referral_record: [
    f("referred_to", "Referred to"),
    f("urgency", "Urgency", { options: urgencyOptions, half: true }),
    f("reason", "Reason", { type: "textarea" }),
  ],
}
