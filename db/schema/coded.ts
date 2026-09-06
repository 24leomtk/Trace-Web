import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { records } from "./records"
import { personsOfInterest } from "./persons"
import { vehicles } from "./vehicles"
import { districtEnum, caseStatusEnum, dangerLevelEnum } from "./enums"

// ---------------------------------------------------------------------------
// missing_person_cases — populated by a trigger on records INSERT/UPDATE
// where record_type = 'missing_person'.
// ---------------------------------------------------------------------------

export const missingPersonCases = pgTable(
  "missing_person_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => personsOfInterest.id),

    fullName: text("full_name").notNull(),
    age: integer("age"),
    lastSeenLocation: text("last_seen_location"),
    lastSeenDate: date("last_seen_date"),
    district: districtEnum("district"),
    status: caseStatusEnum("status").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("missing_person_cases_record_id_idx").on(table.recordId),
    index("missing_person_cases_person_id_idx").on(table.personId),
    index("missing_person_cases_district_idx").on(table.district),
    index("missing_person_cases_status_idx").on(table.status),
  ]
)

// ---------------------------------------------------------------------------
// wanted_person_cases — record_type = 'wanted_person'
// ---------------------------------------------------------------------------

export const wantedPersonCases = pgTable(
  "wanted_person_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => personsOfInterest.id),

    fullName: text("full_name").notNull(),
    offense: text("offense").notNull(),
    dangerLevel: dangerLevelEnum("danger_level"),
    district: districtEnum("district"),
    status: caseStatusEnum("status").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("wanted_person_cases_record_id_idx").on(table.recordId),
    index("wanted_person_cases_person_id_idx").on(table.personId),
    index("wanted_person_cases_district_idx").on(table.district),
    index("wanted_person_cases_status_idx").on(table.status),
    index("wanted_person_cases_danger_idx").on(table.dangerLevel),
  ]
)

// ---------------------------------------------------------------------------
// vehicle_cases — record_type IN (missing_vehicle, vehicle_offense,
// vehicle_impoundment). One shared lookup table since they all boil down to
// "this plate has an active case of type X".
// ---------------------------------------------------------------------------

export const vehicleCases = pgTable(
  "vehicle_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),

    caseType: text("case_type").notNull(), // mirrors records.record_type
    plateNumber: text("plate_number").notNull(), // denormalized for fast search
    district: districtEnum("district"),
    status: caseStatusEnum("status").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("vehicle_cases_record_id_idx").on(table.recordId),
    index("vehicle_cases_vehicle_id_idx").on(table.vehicleId),
    index("vehicle_cases_plate_number_idx").on(table.plateNumber),
    index("vehicle_cases_type_idx").on(table.caseType),
  ]
)

// ---------------------------------------------------------------------------
// accidents — record_type = 'road_accident'. A single accident can involve
// several vehicles, so they hang off a junction table rather than one FK.
// ---------------------------------------------------------------------------

export const accidents = pgTable(
  "accidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),

    accidentDate: date("accident_date").notNull(),
    location: text("location").notNull(),
    district: districtEnum("district"),
    fatalities: integer("fatalities").default(0).notNull(),
    injuries: integer("injuries").default(0).notNull(),
    status: caseStatusEnum("status").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("accidents_record_id_idx").on(table.recordId),
    index("accidents_district_date_idx").on(table.district, table.accidentDate),
  ]
)

export const accidentVehicles = pgTable(
  "accident_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accidentId: uuid("accident_id")
      .notNull()
      .references(() => accidents.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    role: text("role"), // e.g. "at_fault", "involved"
  },
  (table) => [
    index("accident_vehicles_accident_id_idx").on(table.accidentId),
    index("accident_vehicles_vehicle_id_idx").on(table.vehicleId),
  ]
)

// ---------------------------------------------------------------------------
// traffic_citations — record_type = 'traffic_citation'
// ---------------------------------------------------------------------------

export const trafficCitations = pgTable(
  "traffic_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),

    violationType: text("violation_type").notNull(),
    fineAmount: numeric("fine_amount"),
    isPaid: boolean("is_paid").default(false).notNull(),
    district: districtEnum("district"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("traffic_citations_record_id_idx").on(table.recordId),
    index("traffic_citations_vehicle_id_idx").on(table.vehicleId),
    index("traffic_citations_district_idx").on(table.district),
  ]
)
