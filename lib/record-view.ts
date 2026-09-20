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

/** Victim/witness names — Phase 5 accepts structured parties or legacy strings. */
function partyNames(data: Data, key: string): string[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.flatMap((item): string[] => {
    if (typeof item === "string" && item.trim()) return [item.trim()]
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === "string" &&
      ((item as Record<string, unknown>).name as string).trim()
    ) {
      return [((item as Record<string, unknown>).name as string).trim()]
    }
    return []
  })
}

function sentence(parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ")
}

export interface RecordView {
  title: string
  summary: string
  badges: RecordBadge[]
}

/** Derive the timeline's title / summary / badges from a record's typed payload. */
export function describeRecord(type: RecordType, data: Data): RecordView {
  const meta = RECORD_TYPE_META[type]

  switch (type) {
    case "missing_person": {
      return {
        title: str(data, "full_name") || meta.label,
        summary: sentence([
          str(data, "last_seen_location") &&
            `Last seen at ${str(data, "last_seen_location")}`,
          str(data, "last_seen_date") && `on ${str(data, "last_seen_date")}.`,
          str(data, "reporter_name") &&
            `Reported by ${str(data, "reporter_name")}.`,
        ]),
        badges: [{ label: "Missing", tone: "amber" }],
      }
    }

    case "wanted_person": {
      const danger = str(data, "danger_level")
      return {
        title: str(data, "full_name") || meta.label,
        summary: sentence([
          str(data, "offense"),
          str(data, "last_known_location") &&
            `Last known: ${str(data, "last_known_location")}.`,
        ]),
        badges: [
          danger
            ? {
                label: `Danger: ${danger}`,
                tone:
                  danger === "extreme"
                    ? "red"
                    : danger === "high"
                      ? "rose"
                      : danger === "medium"
                        ? "amber"
                        : "emerald",
              }
            : { label: "Wanted", tone: "rose" },
        ],
      }
    }

    case "stolen_property":
      return {
        title: str(data, "item_description") || meta.label,
        summary: sentence([
          str(data, "location_stolen") &&
            `Stolen at ${str(data, "location_stolen")}`,
          str(data, "date_stolen") && `on ${str(data, "date_stolen")}.`,
          str(data, "owner_name") && `Owner: ${str(data, "owner_name")}.`,
        ]),
        badges: [
          str(data, "category")
            ? { label: str(data, "category"), tone: "orange" }
            : { label: "Stolen", tone: "orange" },
        ],
      }

    case "crime_incident": {
      const victims = partyNames(data, "victims")
      return {
        title: sentence([str(data, "offense_code"), str(data, "incident_type")]) || meta.label,
        summary: sentence([
          str(data, "description"),
          str(data, "location") && `Location: ${str(data, "location")}.`,
          victims.length > 0 && `Victims: ${victims.join(", ")}.`,
        ]),
        badges: [{ label: "Incident", tone: "red" }],
      }
    }

    case "arrest_record": {
      const charges = list(data, "charges")
      const custody = str(data, "custody_status")
      const prosecutor = str(data, "prosecutor_decision")
      return {
        title: str(data, "full_name") || meta.label,
        summary: sentence([
          charges.length > 0 && `Charges: ${charges.join(", ")}.`,
          str(data, "arrest_location") &&
            `Arrested at ${str(data, "arrest_location")}`,
          str(data, "arrest_date") && `on ${str(data, "arrest_date")}.`,
          str(data, "booking_no") && `Booking: ${str(data, "booking_no")}.`,
          prosecutor &&
            prosecutor !== "pending" &&
            `Prosecutor: ${prosecutor.replace(/_/g, " ")}.`,
        ]),
        badges: [
          {
            label:
              custody && custody !== "released_unconditionally"
                ? `Custody: ${custody.replace(/_/g, " ")}`
                : "Arrest",
            tone:
              custody === "in_custody"
                ? "red"
                : custody === "released_on_bail"
                  ? "amber"
                  : "violet",
          },
        ],
      }
    }

    case "missing_vehicle":
      return {
        title: str(data, "plate_number") || meta.label,
        summary: sentence([
          sentence([str(data, "make"), str(data, "model"), str(data, "color")]),
          str(data, "last_seen_location") &&
            `Last seen at ${str(data, "last_seen_location")}`,
          str(data, "last_seen_date") && `on ${str(data, "last_seen_date")}.`,
        ]),
        badges: [{ label: "Missing vehicle", tone: "amber" }],
      }

    case "vehicle_offense":
      return {
        title: sentence([str(data, "plate_number"), str(data, "offense_type")]) ||
          meta.label,
        summary: sentence([
          str(data, "statute_code") && `[${str(data, "statute_code")}]`,
          data["is_criminal"] === true && "Criminal matter.",
          data["court_appearance_required"] === true &&
            "Court appearance required.",
          str(data, "description"),
          str(data, "location") && `Location: ${str(data, "location")}.`,
        ]),
        badges: [
          data["is_criminal"] === true
            ? { label: "Criminal offense", tone: "red" }
            : { label: "Offense", tone: "orange" },
        ],
      }

    case "road_accident": {
      const vehicles = data["vehicles_involved"]
      const count = Array.isArray(vehicles) ? vehicles.length : 0
      const severity = str(data, "severity")
      return {
        title: str(data, "location") || meta.label,
        summary: sentence([
          severity && `Severity: ${severity}.`,
          str(data, "description"),
          count > 0 && `${count} vehicle${count === 1 ? "" : "s"} involved.`,
          str(data, "cause") && `Cause: ${str(data, "cause")}.`,
        ]),
        badges: [
          {
            label: severity === "fatal" ? "Fatal accident" : "Accident",
            tone: severity === "fatal" ? "red" : "orange",
          },
        ],
      }
    }

    case "traffic_citation":
      return {
        title: sentence([str(data, "violation_type"), str(data, "plate_number")]) ||
          meta.label,
        summary: sentence([
          str(data, "driver_name") && `Driver: ${str(data, "driver_name")}.`,
          str(data, "location") && `Issued at ${str(data, "location")}`,
          str(data, "date_issued") && `on ${str(data, "date_issued")}.`,
        ]),
        badges: [{ label: "Citation", tone: "sky" }],
      }

    case "vehicle_impoundment":
      return {
        title: str(data, "plate_number") || meta.label,
        summary: sentence([
          str(data, "reason"),
          str(data, "impound_location") &&
            `Held at ${str(data, "impound_location")}`,
          str(data, "impounded_date") && `since ${str(data, "impounded_date")}.`,
        ]),
        badges: [{ label: "Impounded", tone: "slate" }],
      }

    case "unclaimed_person":
      return {
        title: str(data, "deceased_name") || meta.label,
        summary: sentence([
          str(data, "place_of_death") &&
            `Found at ${str(data, "place_of_death")}`,
          str(data, "date_of_death") && `on ${str(data, "date_of_death")}.`,
          str(data, "identification_method") &&
            `Identified by ${str(data, "identification_method")}.`,
        ]),
        badges: [{ label: "Unclaimed", tone: "slate" }],
      }

    default:
      return {
        title: meta.label,
        summary: "",
        badges: [],
      }
  }
}
