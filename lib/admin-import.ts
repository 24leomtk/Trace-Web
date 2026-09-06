"use client"

import * as XLSX from "xlsx"

import {
  importPatientRowSchema,
  type ImportPatientRow,
} from "@/validations/admin"

export interface ParsedImportRow {
  rowNumber: number
  data: ImportPatientRow | null
  issues: string[]
}

export interface ParsedImportFile {
  valid: ImportPatientRow[]
  invalid: ParsedImportRow[]
}

const HEADER_ALIASES: Record<string, keyof ImportPatientRow> = {
  name: "name",
  full_name: "name",
  fullname: "name",
  patient_name: "name",
  phone: "phoneNumber",
  phone_number: "phoneNumber",
  phonenumber: "phoneNumber",
  phoneNumber: "phoneNumber",
  national_id: "nationalId",
  nationalid: "nationalId",
  nationalId: "nationalId",
  date_of_birth: "dateOfBirth",
  dateofbirth: "dateOfBirth",
  dateOfBirth: "dateOfBirth",
  dob: "dateOfBirth",
  sex: "sex",
  gender: "sex",
  district: "district",
}

function normalizeHeader(header: string): keyof ImportPatientRow | null {
  const key = header.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[header.trim()] ?? null
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "number") {
    // Excel may store phone numbers as numbers — restore the leading +.
    const text = String(Math.trunc(value))
    if (/^265\d{9}$/.test(text)) return `+${text}`
    return text
  }
  return String(value).trim()
}

function normalizeSex(value: string): string {
  const v = value.trim().toLowerCase()
  if (v === "m" || v === "male") return "male"
  if (v === "f" || v === "female") return "female"
  return v
}

function normalizeDistrict(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

/** Reads the first sheet of an .xlsx/.csv file into validated patient rows. */
export async function parsePatientImportFile(file: File): Promise<ParsedImportFile> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) {
    return { valid: [], invalid: [{ rowNumber: 1, data: null, issues: ["The file has no sheets."] }] }
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  })
  if (matrix.length < 2) {
    return { valid: [], invalid: [{ rowNumber: 1, data: null, issues: ["The file has no data rows."] }] }
  }

  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? ""))
  const columns = headers.map(normalizeHeader)
  if (!columns.includes("name") || !columns.includes("phoneNumber")) {
    return {
      valid: [],
      invalid: [
        {
          rowNumber: 1,
          data: null,
          issues: ["The header must include at least name and phone_number columns."],
        },
      ],
    }
  }

  const valid: ImportPatientRow[] = []
  const invalid: ParsedImportRow[] = []

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] as unknown[]
    if (cells.every((c) => cellToString(c) === "")) continue
    const raw: Record<string, string> = {}
    columns.forEach((mapped, colIndex) => {
      if (!mapped) return
      raw[mapped] = cellToString(cells[colIndex])
    })
    const candidate = {
      name: raw.name ?? "",
      phoneNumber: (raw.phoneNumber ?? "").replace(/[\s-]/g, ""),
      nationalId: raw.nationalId ?? "",
      dateOfBirth: raw.dateOfBirth ?? "",
      sex: raw.sex ? normalizeSex(raw.sex) : undefined,
      district: raw.district ? normalizeDistrict(raw.district) : undefined,
    }
    const result = importPatientRowSchema.safeParse(candidate)
    if (result.success) {
      valid.push(result.data)
    } else {
      invalid.push({
        rowNumber: i + 1,
        data: null,
        issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      })
    }
  }

  return { valid, invalid }
}

export function downloadPatientTemplate(): void {
  const rows = [
    ["name", "phone_number", "national_id", "date_of_birth", "sex", "district"],
    ["Alinafe Banda", "+265991234567", "A1234567", "1990-04-12", "female", "lilongwe"],
    ["Yamikani Phiri", "+265881234567", "P7654321", "1988-11-02", "male", "blantyre"],
  ]
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "patients")
  XLSX.writeFile(workbook, "patient-import-template.xlsx")
}
