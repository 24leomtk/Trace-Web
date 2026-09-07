"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSchemas = exports.vehicleImpoundmentSchema = exports.trafficCitationSchema = exports.roadAccidentSchema = exports.vehicleOffenseSchema = exports.missingVehicleSchema = exports.arrestRecordSchema = exports.crimeIncidentSchema = exports.stolenPropertySchema = exports.wantedPersonSchema = exports.missingPersonSchema = exports.dangerLevelOptions = void 0;
const z = __importStar(require("zod"));
exports.dangerLevelOptions = ["low", "medium", "high", "extreme"];
// ---------------------------------------------------------------------------
// Regular domain
// ---------------------------------------------------------------------------
exports.missingPersonSchema = z.object({
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
});
exports.wantedPersonSchema = z.object({
    person_id: z.uuid().optional(),
    full_name: z.string().min(1),
    national_id: z.string().optional(),
    offense: z.string().min(1),
    danger_level: z.enum(exports.dangerLevelOptions),
    warrant_number: z.string().optional(),
    last_known_location: z.string().optional(),
    description: z.string().min(1),
});
exports.stolenPropertySchema = z.object({
    item_description: z.string().min(1),
    category: z.string().min(1),
    estimated_value: z.number().nonnegative().optional(),
    serial_number: z.string().optional(),
    location_stolen: z.string().min(1),
    date_stolen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    owner_name: z.string().min(1),
    owner_contact: z.string().min(1),
});
exports.crimeIncidentSchema = z.object({
    incident_type: z.string().min(1),
    description: z.string().min(1),
    location: z.string().min(1),
    date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    victims: z.array(z.string().min(1)).default([]),
    witnesses: z.array(z.string().min(1)).default([]),
    linked_person_ids: z.array(z.uuid()).default([]),
});
exports.arrestRecordSchema = z.object({
    person_id: z.uuid().optional(),
    full_name: z.string().min(1),
    national_id: z.string().optional(),
    charges: z.array(z.string().min(1)),
    arrest_location: z.string().min(1),
    arrest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    arresting_officer: z.string().min(1),
    linked_wanted_record_id: z.uuid().optional(),
});
// ---------------------------------------------------------------------------
// Traffic domain
// ---------------------------------------------------------------------------
exports.missingVehicleSchema = z.object({
    plate_number: z.string().min(1),
    make: z.string().optional(),
    model: z.string().optional(),
    color: z.string().optional(),
    last_seen_location: z.string().min(1),
    last_seen_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reporter_name: z.string().min(1),
    reporter_contact: z.string().min(1),
});
exports.vehicleOffenseSchema = z.object({
    plate_number: z.string().min(1),
    offense_type: z.string().min(1),
    description: z.string().min(1),
    location: z.string().min(1),
    date_occurred: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    linked_crime_record_id: z.uuid().optional(),
});
exports.roadAccidentSchema = z.object({
    location: z.string().min(1),
    accident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1),
    cause: z.string().optional(),
    vehicles_involved: z.array(z.object({
        plate_number: z.string().min(1),
        role: z.string().optional(), // e.g. "at_fault", "involved"
    })),
    fatalities: z.number().int().min(0).default(0),
    injuries: z.number().int().min(0).default(0),
});
exports.trafficCitationSchema = z.object({
    plate_number: z.string().min(1),
    driver_name: z.string().optional(),
    driver_license_no: z.string().optional(),
    violation_type: z.string().min(1),
    fine_amount: z.number().nonnegative(),
    location: z.string().min(1),
    date_issued: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.vehicleImpoundmentSchema = z.object({
    plate_number: z.string().min(1),
    reason: z.string().min(1),
    impound_location: z.string().min(1),
    impounded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    release_conditions: z.string().optional(),
});
// ---------------------------------------------------------------------------
exports.recordSchemas = {
    missing_person: exports.missingPersonSchema,
    wanted_person: exports.wantedPersonSchema,
    stolen_property: exports.stolenPropertySchema,
    crime_incident: exports.crimeIncidentSchema,
    arrest_record: exports.arrestRecordSchema,
    missing_vehicle: exports.missingVehicleSchema,
    vehicle_offense: exports.vehicleOffenseSchema,
    road_accident: exports.roadAccidentSchema,
    traffic_citation: exports.trafficCitationSchema,
    vehicle_impoundment: exports.vehicleImpoundmentSchema,
};
