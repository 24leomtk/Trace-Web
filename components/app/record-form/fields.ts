import {
  accidentSeverityOptions,
  custodyStatusOptions,
  dangerLevelOptions,
  prosecutorDecisionOptions,
} from "@/validations/record"
import type { Domain } from "@/lib/types"

export interface PlainFieldDef {
  kind?: undefined
  path: string
  label: string
  type?: "text" | "textarea" | "date" | "datetime-local" | "number" | "checkbox"
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

export type CatalogRef = "branch"

export interface RefFieldDef {
  kind: "ref"
  ref: CatalogRef
  /** Branch pickers are domain-scoped (monitors filing under a branch). */
  domain: Domain
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

function o(path: string, label: string, extra: Partial<PlainFieldDef> = {}): PlainFieldDef {
  return { path, label, required: false, ...extra }
}

// N1 NamUs-inspired description block — shared optional physical-description
// fields for person-centred filings. All o() so roadside filing (minimum
// payload) keeps working; mirrors personDescriptionFields in
// validations/record.ts.
const personDescriptionFields: AnyFieldDef[] = [
  o("age_from", "Age from", { type: "number", half: true }),
  o("age_to", "Age to", { type: "number", half: true }),
  o("height_cm_from", "Height from (cm)", { type: "number", half: true }),
  o("height_cm_to", "Height to (cm)", { type: "number", half: true }),
  o("weight_kg_from", "Weight from (kg)", { type: "number", half: true }),
  o("weight_kg_to", "Weight to (kg)", { type: "number", half: true }),
  o("hair_color", "Hair color", { half: true }),
  o("hair_length", "Hair length", { half: true }),
  o("eye_color", "Eye color", { half: true }),
  o("complexion", "Complexion", { half: true }),
  o("build", "Build", { half: true }),
  o("clothing_description", "Clothing", { type: "textarea" }),
  o("jewelry_description", "Jewelry", { type: "textarea" }),
]

export const RECORD_FORM_FIELDS: Record<string, AnyFieldDef[]> = {
  missing_person: [
    f("full_name", "Full name"),
    o("national_id", "National ID", { half: true }),
    o("age", "Age", { type: "number", half: true }),
    o("sex", "Sex", { options: ["male", "female", "other"], half: true }),
    f("last_seen_location", "Last seen location"),
    f("last_seen_date", "Last seen date", { type: "date", half: true }),
    o("distinguishing_features", "Distinguishing features", { type: "textarea" }),
    ...personDescriptionFields,
    f("reporter_name", "Reporter name", { half: true }),
    f("reporter_relationship", "Reporter relationship", { half: true }),
    f("reporter_contact", "Reporter contact", { half: true }),
  ],
  wanted_person: [
    f("full_name", "Full name"),
    o("national_id", "National ID", { half: true }),
    f("offense", "Offense"),
    f("danger_level", "Danger level", { options: dangerLevelOptions, half: true }),
    o("warrant_number", "Warrant number", { half: true }),
    o("last_known_location", "Last known location"),
    f("description", "Description", { type: "textarea" }),
    ...personDescriptionFields,
  ],
  // N2 unclaimed person — only deceased_name + place_of_death required
  // (mirrors unclaimedPersonSchema); custodial branch reuses the generic
  // branch CatalogField (kind: "ref"), same as monitor filing pickers.
  unclaimed_person: [
    f("deceased_name", "Deceased name"),
    o("national_id", "National ID", { half: true }),
    o("age", "Age", { type: "number", half: true }),
    o("sex", "Sex", { options: ["male", "female", "other"], half: true }),
    o("date_of_death", "Date of death", { type: "date", half: true }),
    f("place_of_death", "Place of death"),
    o("identification_method", "Identification method", {
      half: true,
      placeholder: "Visual, fingerprints, dental, DNA…",
    }),
    o("reason_unclaimed", "Reason unclaimed", { type: "textarea" }),
    {
      kind: "ref",
      ref: "branch",
      domain: "regular",
      path: "custodial_branch_id",
      label: "Custodial branch",
      placeholder: "Branch holding the remains…",
      required: false,
      half: true,
    },
    o("description", "Description", { type: "textarea" }),
    ...personDescriptionFields,
  ],
  stolen_property: [
    f("item_description", "Item description"),
    f("category", "Category", { half: true, placeholder: "Electronics, vehicle part…" }),
    o("estimated_value", "Estimated value", { type: "number", half: true }),
    o("serial_number", "Serial number", { half: true }),
    f("location_stolen", "Location stolen"),
    f("date_stolen", "Date stolen", { type: "date", half: true }),
    f("owner_name", "Owner name", { half: true }),
    f("owner_contact", "Owner contact", { half: true }),
  ],
  crime_incident: [
    f("incident_type", "Incident type", { placeholder: "Burglary, assault…" }),
    o("offense_code", "Offense code", { half: true, placeholder: "Statute/section…" }),
    f("location", "Location"),
    f("date_occurred", "Date occurred", { type: "date", half: true }),
    f("description", "Description", { type: "textarea" }),
    { kind: "stringlist", path: "victims", label: "Victims", placeholder: "Type a name and press Enter" },
    { kind: "stringlist", path: "witnesses", label: "Witnesses", placeholder: "Type a name and press Enter" },
  ],
  arrest_record: [
    f("full_name", "Full name"),
    o("national_id", "National ID", { half: true }),
    { kind: "stringlist", path: "charges", label: "Charges", placeholder: "Type a charge and press Enter" },
    f("arrest_location", "Arrest location"),
    f("arrest_date", "Arrest date", { type: "date", half: true }),
    f("arresting_officer", "Arresting officer", { half: true }),
    o("booking_no", "Booking number", { half: true, placeholder: "Station booking ref…" }),
    o("custody_status", "Custody status", { options: custodyStatusOptions, half: true }),
    o("prosecutor_decision", "Prosecutor decision", { options: prosecutorDecisionOptions, half: true }),
  ],
  missing_vehicle: [
    f("plate_number", "Plate number", { half: true, placeholder: "e.g. MH 1234" }),
    o("make", "Make", { half: true }),
    o("model", "Model", { half: true }),
    o("color", "Color", { half: true }),
    f("last_seen_location", "Last seen location"),
    f("last_seen_date", "Last seen date", { type: "date", half: true }),
    f("reporter_name", "Reporter name", { half: true }),
    f("reporter_contact", "Reporter contact", { half: true }),
  ],
  vehicle_offense: [
    f("plate_number", "Plate number", { half: true }),
    f("offense_type", "Offense type", { half: true, placeholder: "Speeding, no license…" }),
    o("statute_code", "Statute code", { half: true, placeholder: "e.g. s.316.074" }),
    o("is_criminal", "Criminal offense", { type: "checkbox", half: true }),
    o("court_appearance_required", "Court appearance required", { type: "checkbox", half: true }),
    f("location", "Location"),
    f("date_occurred", "Date occurred", { type: "date", half: true }),
    f("description", "Description", { type: "textarea" }),
  ],
  road_accident: [
    f("location", "Location"),
    f("accident_date", "Accident date", { type: "date", half: true }),
    o("cause", "Cause", { half: true, placeholder: "Speeding, brake failure…" }),
    o("severity", "Severity", { options: accidentSeverityOptions, half: true }),
    o("road_condition", "Road condition", { half: true, placeholder: "Wet, potholes…" }),
    o("weather", "Weather", { half: true, placeholder: "Rain, clear…" }),
    {
      kind: "rowlist",
      path: "vehicles_involved",
      label: "Vehicles involved",
      itemLabel: "Vehicle",
      fields: [
        f("plate_number", "Plate number"),
        o("role", "Role", { placeholder: "at_fault, involved…" }),
        o("driver_name", "Driver name"),
        o("policy_number", "Policy no. (if known)"),
      ],
    },
    f("description", "Description", { type: "textarea" }),
  ],
  traffic_citation: [
    f("plate_number", "Plate number", { half: true }),
    f("violation_type", "Violation type", { half: true }),
    o("statute_code", "Statute code", { half: true, placeholder: "e.g. s.316.074" }),
    f("fine_amount", "Fine amount", { type: "number", half: true }),
    o("due_date", "Due date", { type: "date", half: true }),
    o("driver_name", "Driver name", { half: true }),
    o("driver_license_no", "Driver license no.", { half: true }),
    f("location", "Location"),
    f("date_issued", "Date issued", { type: "date", half: true }),
  ],
  vehicle_impoundment: [
    f("plate_number", "Plate number", { half: true }),
    f("reason", "Reason"),
    f("impound_location", "Impound location"),
    f("impounded_date", "Impounded date", { type: "date", half: true }),
    o("tow_company", "Tow company", { half: true }),
    o("lot_location", "Lot location", { half: true }),
    o("bay", "Bay / slot", { half: true }),
    o("release_conditions", "Release conditions", { type: "textarea" }),
  ],
}
