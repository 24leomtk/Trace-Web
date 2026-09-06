import { RECORD_TYPE_META } from "@/lib/record-meta"
import type { RecordBadge } from "@/lib/types"
import type { RecordType } from "@/validations/record"

type Data = Record<string, unknown>

function str(data: Data, key: string): string {
  const value = data[key]
  return typeof value === "string" ? value.trim() : ""
}

function list(data: Data, key: string): string[] {
  const value = data[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function sentence(parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ")
}

/** Accept unknown JSON values and only surface readable scalars. */
function scalar(value: unknown): string | false {
  if (typeof value === "string" && value.trim()) return value
  if (typeof value === "number") return String(value)
  return false
}

const ABNORMAL_HINTS = ["positive", "reactive", "detected", "abnormal"]

export interface RecordView {
  title: string
  summary: string
  badges: RecordBadge[]
}

/** Derive the timeline's title / summary / badges from a record's typed payload. */
export function describeRecord(type: RecordType, data: Data): RecordView {
  const meta = RECORD_TYPE_META[type]

  switch (type) {
    case "outpatient_visit": {
      const complaint = str(data, "chief_complaint")
      const assessment = str(data, "assessment")
      const plan = str(data, "plan")
      return {
        title: complaint || meta.label,
        summary: sentence([
          assessment,
          plan && `Plan: ${plan}`,
        ]),
        badges: [{ label: "OPD visit", tone: "sky" }],
      }
    }

    case "emergency_visit": {
      const symptoms = list(data, "presenting_symptoms")
      const interventions = list(data, "initial_interventions")
      const triage = str(data, "triage_level")
      const tone =
        triage === "RED" ? "red" : triage === "YELLOW" ? "amber" : "emerald"
      return {
        title:
          symptoms[0] ??
          (str(data, "arrival_mode")
            ? `Emergency arrival — ${str(data, "arrival_mode").toLowerCase()}`
            : meta.label),
        summary: sentence([
          symptoms.length > 0 && `Presented with ${symptoms.join(", ").toLowerCase()}.`,
          interventions.length > 0 &&
            `Initial care: ${interventions.join(", ").toLowerCase()}.`,
        ]),
        badges: [
          triage
            ? { label: `Triage ${triage}`, tone }
            : { label: "Emergency", tone: "red" },
        ],
      }
    }

    case "inpatient_admission":
      return {
        title: str(data, "admission_reason") || meta.label,
        summary: sentence([
          str(data, "ward") && `Ward ${str(data, "ward")}`,
          str(data, "bed_number") && `Bed ${str(data, "bed_number")}`,
          str(data, "attending_physician") &&
            `Attending: ${str(data, "attending_physician")}`,
        ]),
        badges: [{ label: "Admitted", tone: "violet" }],
      }

    case "lab_test_result": {
      const results = data["results"]
      const rows = Array.isArray(results)
        ? (results as Data[]).map((row) =>
            sentence([
              typeof row.parameter === "string" ? row.parameter : "",
              typeof row.value === "string" || typeof row.value === "number"
                ? String(row.value)
                : "",
              typeof row.unit === "string" ? row.unit : "",
            ])
          )
        : []
      const abnormal =
        rows.some((row) =>
          ABNORMAL_HINTS.some((hint) => row.toLowerCase().includes(hint))
        ) || false
      return {
        title: str(data, "test_name") || meta.label,
        summary: rows.join(" · "),
        badges: [
          abnormal
            ? { label: "Review result", tone: "amber" }
            : { label: "Result ready", tone: "emerald" },
        ],
      }
    }

    case "imaging_report":
      return {
        title: sentence([str(data, "modality"), str(data, "body_part")]) || meta.label,
        summary: str(data, "impression") || str(data, "findings"),
        badges: [{ label: "Imaging", tone: "cyan" }],
      }

    case "pathology_report":
      return {
        title: str(data, "diagnosis") || meta.label,
        summary: sentence([
          str(data, "site") && `Site: ${str(data, "site")}`,
          str(data, "histological_findings"),
        ]),
        badges: [
          str(data, "grade")
            ? { label: str(data, "grade"), tone: "rose" }
            : { label: "Histology", tone: "rose" },
        ],
      }

    case "medication_prescription":
      return {
        title: sentence([str(data, "medication"), "prescribed"]) || meta.label,
        summary: sentence([
          str(data, "dose"),
          str(data, "route") && `· ${str(data, "route")}`,
          str(data, "frequency") && `· ${str(data, "frequency")}`,
          str(data, "duration") && `· ${str(data, "duration")}`,
          str(data, "indication") && `— for ${str(data, "indication").toLowerCase()}`,
        ]),
        badges: [{ label: "Prescription", tone: "amber" }],
      }

    case "medication_administration":
      return {
        title:
          sentence([str(data, "medication"), "administered"]) || meta.label,
        summary: sentence([
          str(data, "dose"),
          str(data, "route") && `· ${str(data, "route")}`,
          str(data, "administered_at") && `at ${str(data, "administered_at")}`,
          str(data, "administered_by") && `by ${str(data, "administered_by")}`,
        ]),
        badges: [{ label: "Given", tone: "teal" }],
      }

    case "surgical_procedure":
      return {
        title: str(data, "procedure_name") || meta.label,
        summary: sentence([
          str(data, "surgeon") && `Surgeon: ${str(data, "surgeon")}`,
          str(data, "anesthesia") && `Anaesthesia: ${str(data, "anesthesia")}`,
          str(data, "complications") &&
            `Complications: ${str(data, "complications")}`,
        ]),
        badges: [{ label: "Procedure", tone: "fuchsia" }],
      }

    case "nursing_notes":
      return {
        title:
          sentence(["Nursing notes", str(data, "shift")]) || meta.label,
        summary: str(data, "notes") || str(data, "observations"),
        badges: [{ label: "Nursing", tone: "lime" }],
      }

    case "intake_output_chart": {
      const intake = data["intake"] as Data | undefined
      const output = data["output"] as Data | undefined
      return {
        title: meta.label,
        summary: sentence([
          scalar(intake?.oral) && `Oral ${scalar(intake?.oral)}`,
          scalar(intake?.iv) && `IV ${scalar(intake?.iv)}`,
          scalar(output?.urine) && `Urine ${scalar(output?.urine)}`,
          str(data, "net_balance") && `Net: ${str(data, "net_balance")}`,
        ]),
        badges: [{ label: "Chart", tone: "blue" }],
      }
    }

    case "immunization_record": {
      const dose = data["dose_number"]
      return {
        title: str(data, "vaccine") || meta.label,
        summary: sentence([
          typeof dose === "number" ? `Dose ${dose}` : "",
          str(data, "manufacturer") && `· ${str(data, "manufacturer")}`,
          str(data, "administered_at") && `· given ${str(data, "administered_at")}`,
        ]),
        badges: [{ label: "Immunization", tone: "lime" }],
      }
    }

    case "screening_test":
      return {
        title: str(data, "screening_type") || meta.label,
        summary: sentence([
          str(data, "result"),
          str(data, "recommended_follow_up") &&
            `Follow-up: ${str(data, "recommended_follow_up")}`,
        ]),
        badges: [{ label: "Screening", tone: "orange" }],
      }

    case "psychiatric_evaluation":
      return {
        title: str(data, "diagnosis") || str(data, "presenting_problem") || meta.label,
        summary: sentence([
          str(data, "risk_assessment") && `Risk: ${str(data, "risk_assessment")}`,
        ]),
        badges: [{ label: "Mental health", tone: "pink" }],
      }

    case "discharge_summary":
      return {
        title: str(data, "final_diagnosis") || meta.label,
        summary: sentence([
          list(data, "treatments_given").length > 0 &&
            `Treated: ${list(data, "treatments_given").join(", ")}.`,
          list(data, "discharge_medications").length > 0 &&
            `Discharged on ${list(data, "discharge_medications").join(", ")}.`,
          list(data, "follow_up_instructions").length > 0 &&
            `Follow-up: ${list(data, "follow_up_instructions").join("; ")}.`,
        ]),
        badges: [{ label: "Discharged", tone: "emerald" }],
      }

    case "referral_record": {
      const urgency = str(data, "urgency")
      return {
        title: str(data, "referred_to")
          ? `Referral to ${str(data, "referred_to")}`
          : meta.label,
        summary: str(data, "reason"),
        badges: [
          urgency === "HIGH"
            ? { label: "Urgent", tone: "red" }
            : urgency === "MEDIUM"
              ? { label: "Priority", tone: "amber" }
              : { label: "Referral", tone: "slate" },
        ],
      }
    }

    default:
      return {
        title: meta.label,
        summary: "",
        badges: [],
      }
  }
}
