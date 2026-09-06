import * as z from "zod"

export const dangerLevelOptions = ["low", "medium", "high", "extreme"] as const

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
})

export const crimeIncidentSchema = z.object({
  incident_type: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  victims: z.array(z.string().min(1)).default([]),
  witnesses: z.array(z.string().min(1)).default([]),
  linked_person_ids: z.array(z.uuid()).default([]),
})

export const arrestRecordSchema = z.object({
  person_id: z.uuid().optional(),
  full_name: z.string().min(1),
  national_id: z.string().optional(),
  charges: z.array(z.string().min(1)),
  arrest_location: z.string().min(1),
  arrest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  arresting_officer: z.string().min(1),
  linked_wanted_record_id: z.uuid().optional(),
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
})

export const vehicleOffenseSchema = z.object({
  plate_number: z.string().min(1),
  offense_type: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  linked_crime_record_id: z.uuid().optional(),
})

export const roadAccidentSchema = z.object({
  location: z.string().min(1),
  accident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  cause: z.string().optional(),
  vehicles_involved: z.array(
    z.object({
      plate_number: z.string().min(1),
      role: z.string().optional(), // e.g. "at_fault", "involved"
    })
  ),
  fatalities: z.number().int().min(0).default(0),
  injuries: z.number().int().min(0).default(0),
})

export const trafficCitationSchema = z.object({
  plate_number: z.string().min(1),
  driver_name: z.string().optional(),
  driver_license_no: z.string().optional(),
  violation_type: z.string().min(1),
  fine_amount: z.number().nonnegative(),
  location: z.string().min(1),
  date_issued: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const vehicleImpoundmentSchema = z.object({
  plate_number: z.string().min(1),
  reason: z.string().min(1),
  impound_location: z.string().min(1),
  impounded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  release_conditions: z.string().optional(),
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
