import * as z from "zod"

export const dangerLevelOptions = ["low", "medium", "high", "extreme"] as const

// Phase 5 record-completion vocab (review §1.3). All optional during
// transition — filing must never hard-gate on data the officer can't know
// roadside.
export const custodyStatusOptions = [
  "in_custody",
  "released_on_bail",
  "handed_to_court",
  "released_unconditionally",
] as const

export const prosecutorDecisionOptions = [
  "pending",
  "accepted",
  "declined",
  "diverted",
] as const

export const accidentSeverityOptions = ["minor", "serious", "fatal"] as const

// F10 GPS capture: optional precise coordinates alongside the free-text
// location. Never required — filing must work without a GPS fix.
const geoFields = {
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}

// ---------------------------------------------------------------------------
// Regular domain
// ---------------------------------------------------------------------------

export const missingPersonSchema = z.object({
  person_id: z.uuid().optional(), // link to persons_of_interest if matched
  full_name: z.string().min(1),
  national_id: z.string().optional(),
  age: z.number().int().min(0).optional(),
  sex: z.enum(["male", "female", "other"]).optional(),
  last_seen_location: z.string().min(1),
  last_seen_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  distinguishing_features: z.string().optional(),
  reporter_name: z.string().min(1),
  reporter_relationship: z.string().min(1),
  reporter_contact: z.string().min(1),
  ...geoFields,
})

export const wantedPersonSchema = z.object({
  person_id: z.uuid().optional(),
  full_name: z.string().min(1),
  national_id: z.string().optional(),
  offense: z.string().min(1),
  danger_level: z.enum(dangerLevelOptions),
  warrant_number: z.string().optional(),
  last_known_location: z.string().optional(),
  description: z.string().min(1),
})

export const stolenPropertySchema = z.object({
  item_description: z.string().min(1),
  category: z.string().min(1),
  estimated_value: z.number().nonnegative().optional(),
  serial_number: z.string().optional(),
  location_stolen: z.string().min(1),
  date_stolen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  owner_name: z.string().min(1),
  owner_contact: z.string().min(1),
  ...geoFields,
})

export const crimeIncidentSchema = z.object({
  incident_type: z.string().min(1),
  // Phase 5: statute/section coding drives court + fine tables downstream.
  offense_code: z.string().trim().max(32).optional(),
  description: z.string().min(1),
  location: z.string().min(1),
  date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Phase 5: structured parties (name + contact + statement ref) accepted
  // alongside legacy bare strings — read-compatibly, never a hard gate.
  victims: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          name: z.string().min(1).max(200),
          contact: z.string().max(64).optional(),
          statement_ref: z.string().max(64).optional(),
        }),
      ])
    )
    .default([]),
  witnesses: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          name: z.string().min(1).max(200),
          contact: z.string().max(64).optional(),
          statement_ref: z.string().max(64).optional(),
        }),
      ])
    )
    .default([]),
  linked_person_ids: z.array(z.uuid()).default([]),
  ...geoFields,
})

export const arrestRecordSchema = z.object({
  person_id: z.uuid().optional(),
  full_name: z.string().min(1),
  national_id: z.string().optional(),
  charges: z.array(z.string().min(1)),
  arrest_location: z.string().min(1),
  arrest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arresting_officer: z.string().min(1),
  // Phase 5: link the officer account (set via the case tab, not typed) —
  // free text stays as fallback display. Booking/custody/prosecutor ride in
  // the payload (full F8 booking remains partner-gated).
  arresting_officer_id: z.uuid().optional(),
  booking_no: z.string().trim().max(64).optional(),
  custody_status: z.enum(custodyStatusOptions).optional(),
  prosecutor_decision: z.enum(prosecutorDecisionOptions).optional(),
  linked_wanted_record_id: z.uuid().optional(),
  ...geoFields,
})

// ---------------------------------------------------------------------------
// Traffic domain
// ---------------------------------------------------------------------------

export const missingVehicleSchema = z.object({
  plate_number: z.string().min(1),
  make: z.string().optional(),
  model: z.string().optional(),
  color: z.string().optional(),
  last_seen_location: z.string().min(1),
  last_seen_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reporter_name: z.string().min(1),
  reporter_contact: z.string().min(1),
  ...geoFields,
})

export const vehicleOffenseSchema = z.object({
  plate_number: z.string().min(1),
  offense_type: z.string().min(1),
  // Phase 5: statute coding + criminal/court flags drive scheduling.
  statute_code: z.string().trim().max(32).optional(),
  is_criminal: z.boolean().default(false),
  court_appearance_required: z.boolean().default(false),
  description: z.string().min(1),
  location: z.string().min(1),
  date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linked_crime_record_id: z.uuid().optional(),
  ...geoFields,
})

export const roadAccidentSchema = z.object({
  location: z.string().min(1),
  accident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  cause: z.string().optional(),
  // Phase 5: crash-report minimums. Never required — filing works with
  // location + date + description alone.
  severity: z.enum(accidentSeverityOptions).optional(),
  road_condition: z.string().trim().max(120).optional(),
  weather: z.string().trim().max(120).optional(),
  vehicles_involved: z.array(
    z.object({
      plate_number: z.string().min(1),
      role: z.string().optional(), // e.g. "at_fault", "involved"
      driver_name: z.string().trim().max(120).optional(),
      policy_number: z.string().trim().max(64).optional(),
      // Frozen at filing by the server (policies lapse after the crash).
      insurance_snapshot: z
        .object({
          policy_number: z.string().max(64).optional(),
          insurer_name: z.string().max(200).optional(),
          coverage_type: z.string().max(64).optional(),
        })
        .optional(),
    })
  ),
  fatalities: z.number().int().min(0).default(0),
  injuries: z.number().int().min(0).default(0),
  ...geoFields,
})

export const trafficCitationSchema = z.object({
  plate_number: z.string().min(1),
  driver_name: z.string().optional(),
  driver_license_no: z.string().optional(),
  violation_type: z.string().min(1),
  // Phase 1: statute coding drives court scheduling + fine tables;
  // free-text violation alone cannot. Optional during transition.
  statute_code: z.string().trim().max(32).optional(),
  fine_amount: z.number().nonnegative(),
  // Payment due date (monitor-set or filing default). Optional during transition.
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  location: z.string().min(1),
  date_issued: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ...geoFields,
})

export const vehicleImpoundmentSchema = z.object({
  plate_number: z.string().min(1),
  reason: z.string().min(1),
  impound_location: z.string().min(1),
  impounded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  release_conditions: z.string().optional(),
  // Phase 4: tow chain captured at filing when known (hold placement can
  // confirm/correct it). All optional during transition.
  tow_company: z.string().trim().max(120).optional(),
  lot_location: z.string().trim().max(200).optional(),
  bay: z.string().trim().max(40).optional(),
  ...geoFields,
})

// ---------------------------------------------------------------------------

export const recordSchemas = {
  missing_person: missingPersonSchema,
  wanted_person: wantedPersonSchema,
  stolen_property: stolenPropertySchema,
  crime_incident: crimeIncidentSchema,
  arrest_record: arrestRecordSchema,
  missing_vehicle: missingVehicleSchema,
  vehicle_offense: vehicleOffenseSchema,
  road_accident: roadAccidentSchema,
  traffic_citation: trafficCitationSchema,
  vehicle_impoundment: vehicleImpoundmentSchema,
}

export type RecordType = keyof typeof recordSchemas
