import {
  AmbulanceIcon,
  BedDoubleIcon,
  BrainIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  DropletsIcon,
  FileSearchIcon,
  FlaskConicalIcon,
  HeartPulseIcon,
  MicroscopeIcon,
  PillIcon,
  ScanIcon,
  ScissorsIcon,
  SendIcon,
  ShieldCheckIcon,
  SyringeIcon,
} from "lucide-react"

import type { LucideIcon } from "lucide-react"

import type { Tone } from "@/lib/types"
import type { RecordType } from "@/validations/record"

export interface RecordTypeMeta {
  label: string
  shortLabel: string
  tone: Tone
  icon: LucideIcon
}

export const RECORD_TYPE_META: Record<RecordType, RecordTypeMeta> = {
  outpatient_visit: {
    label: "Outpatient Visit",
    shortLabel: "OPD",
    tone: "sky",
    icon: ClipboardListIcon,
  },
  emergency_visit: {
    label: "Emergency Visit",
    shortLabel: "ER",
    tone: "rose",
    icon: AmbulanceIcon,
  },
  inpatient_admission: {
    label: "Inpatient Admission",
    shortLabel: "Admission",
    tone: "violet",
    icon: BedDoubleIcon,
  },
  lab_test_result: {
    label: "Lab Test Result",
    shortLabel: "Lab",
    tone: "emerald",
    icon: FlaskConicalIcon,
  },
  imaging_report: {
    label: "Imaging Report",
    shortLabel: "Imaging",
    tone: "amber",
    icon: ScanIcon,
  },
  pathology_report: {
    label: "Pathology Report",
    shortLabel: "Pathology",
    tone: "pink",
    icon: MicroscopeIcon,
  },
  medication_prescription: {
    label: "Medication Prescription",
    shortLabel: "Rx",
    tone: "indigo",
    icon: PillIcon,
  },
  medication_administration: {
    label: "Medication Administration",
    shortLabel: "Medication",
    tone: "cyan",
    icon: SyringeIcon,
  },
  surgical_procedure: {
    label: "Surgical Procedure",
    shortLabel: "Procedure",
    tone: "orange",
    icon: ScissorsIcon,
  },
  nursing_notes: {
    label: "Nursing Notes",
    shortLabel: "Nursing",
    tone: "teal",
    icon: HeartPulseIcon,
  },
  intake_output_chart: {
    label: "Intake/Output Chart",
    shortLabel: "I/O Chart",
    tone: "blue",
    icon: DropletsIcon,
  },
  immunization_record: {
    label: "Immunization Record",
    shortLabel: "Vaccine",
    tone: "lime",
    icon: ShieldCheckIcon,
  },
  screening_test: {
    label: "Screening Test",
    shortLabel: "Screening",
    tone: "fuchsia",
    icon: FileSearchIcon,
  },
  psychiatric_evaluation: {
    label: "Psychiatric Evaluation",
    shortLabel: "Psychiatry",
    tone: "slate",
    icon: BrainIcon,
  },
  discharge_summary: {
    label: "Discharge Summary",
    shortLabel: "Discharge",
    tone: "blue",
    icon: CircleCheckIcon,
  },
  referral_record: {
    label: "Referral Record",
    shortLabel: "Referral",
    tone: "orange",
    icon: SendIcon,
  },
}

export const RECORD_TYPE_ORDER = Object.keys(RECORD_TYPE_META) as RecordType[]

export const TONE_DOT_CLASS: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  indigo: "bg-indigo-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  lime: "bg-lime-500",
  fuchsia: "bg-fuchsia-500",
  orange: "bg-orange-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
}

export const TONE_BADGE_CLASS: Record<Tone, string> = {
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
  violet:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  pink: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300",
  indigo:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300",
  teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300",
  lime: "border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-500/20 dark:bg-lime-500/10 dark:text-lime-300",
  fuchsia:
    "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300",
  orange:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  slate:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300",
}
