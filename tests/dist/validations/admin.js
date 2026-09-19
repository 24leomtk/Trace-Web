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
exports.apiKeySchema = exports.apiKeyScopes = exports.assignmentSchema = exports.referralDocumentSchema = exports.referralDocumentLabels = exports.citationCourtScheduleSchema = exports.ownerNoticeSchema = exports.custodyReleaseSchema = exports.custodyHoldSchema = exports.dispositionSchema = exports.dispositionOptions = exports.locateReportSchema = exports.citationVoidSchema = exports.citationPaymentSchema = exports.paymentChannelOptions = exports.paymentMethodOptions = exports.courtOutcomeSchema = exports.courtOutcomeOptions = exports.courtReferralSchema = exports.bulkPolicyRowSchema = exports.insurancePolicySchema = exports.personSchema = exports.vehicleSchema = exports.vehicleStatusOptions = exports.organizationSchema = exports.organizationTypeOptions = exports.branchSchema = exports.updateManagedUserSchema = exports.createManagedUserSchema = exports.domainOptions = exports.managedRoleOptions = void 0;
const z = __importStar(require("zod"));
exports.managedRoleOptions = [
    "OFFICER",
    "DISTRICT_MONITOR",
    "COUNTRY_MONITOR",
    "SYSTEM_ADMIN",
    "COMPLIANCE_AUDITOR",
    "COURT_LIAISON",
    "INSURANCE_PORTAL_USER",
    "VEHICLE_REGISTRAR",
];
exports.domainOptions = ["regular", "traffic"];
const phoneSchema = z
    .string()
    .regex(/^\+265\d{9}$/, "Phone must be a Malawian number like +265991234567.");
const districtSchema = z
    .string()
    .min(1)
    .regex(/^[a-z_]+$/, "District must be a snake_case enum value.")
    .optional();
const uuidOrEmpty = z.uuid().optional().or(z.literal(""));
// Scope rules (enforced in action code, see lib/actions/admin.ts):
//   OFFICER               -> domain + branchId required
//   DISTRICT_MONITOR      -> domain + district required
//   COUNTRY_MONITOR       -> domain required
//   SYSTEM_ADMIN / COMPLIANCE_AUDITOR -> no domain/branch/district/organization
//   COURT_LIAISON / INSURANCE_PORTAL_USER / VEHICLE_REGISTRAR -> organizationId required
exports.createManagedUserSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phoneNumber: phoneSchema,
    role: z.enum(exports.managedRoleOptions),
    badgeNumber: z.string().trim().max(32).optional().or(z.literal("")),
    domain: z.enum(exports.domainOptions).optional(),
    branchId: uuidOrEmpty,
    district: districtSchema,
    organizationId: uuidOrEmpty,
});
exports.updateManagedUserSchema = exports.createManagedUserSchema
    .partial()
    .extend({ id: z.string().min(1) });
exports.branchSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(200),
    domain: z.enum(exports.domainOptions),
    district: z
        .string()
        .min(1)
        .regex(/^[a-z_]+$/),
    location: z.string().trim().max(300).optional().or(z.literal("")),
    contactPhone: z
        .string()
        .regex(/^\+265\d{9}$/, "Contact must be like +265991234567.")
        .optional()
        .or(z.literal("")),
});
exports.organizationTypeOptions = [
    "court",
    "insurer",
    "vehicle_registry",
];
exports.organizationSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2).max(200),
    orgType: z.enum(exports.organizationTypeOptions),
    district: z
        .string()
        .min(1)
        .regex(/^[a-z_]+$/)
        .optional()
        .or(z.literal("")),
    contactPhone: z
        .string()
        .regex(/^\+265\d{9}$/, "Contact must be like +265991234567.")
        .optional()
        .or(z.literal("")),
    contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
});
exports.vehicleStatusOptions = ["active", "out_of_service"];
exports.vehicleSchema = z.object({
    plateNumber: z.string().trim().min(1).max(32),
    make: z.string().trim().max(80).optional().or(z.literal("")),
    model: z.string().trim().max(80).optional().or(z.literal("")),
    year: z.number().int().min(1900).max(2100).optional(),
    color: z.string().trim().max(40).optional().or(z.literal("")),
    chassisNumber: z.string().trim().max(64).optional().or(z.literal("")),
    engineNumber: z.string().trim().max(64).optional().or(z.literal("")),
    ownerName: z.string().trim().max(120).optional().or(z.literal("")),
    ownerNationalId: z.string().trim().max(32).optional().or(z.literal("")),
    ownerPhone: z
        .string()
        .regex(/^\+265\d{9}$/, "Owner phone must be like +265991234567.")
        .optional()
        .or(z.literal("")),
    ownerDistrict: districtSchema,
});
exports.personSchema = z.object({
    fullName: z.string().trim().min(2).max(200),
    nationalId: z.string().trim().max(32).optional().or(z.literal("")),
    dateOfBirth: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
        .optional()
        .or(z.literal("")),
    sex: z.enum(["male", "female", "other"]).optional(),
    homeDistrict: districtSchema,
    distinguishingFeatures: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .or(z.literal("")),
});
exports.insurancePolicySchema = z.object({
    vehicleId: z.uuid(),
    policyNumber: z.string().trim().min(1).max(64),
    coverageType: z.string().trim().max(64).optional().or(z.literal("")),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isActive: z.boolean().default(true),
    externalReference: z.string().trim().max(128).optional().or(z.literal("")),
});
// F7 bulk import: same policy shape keyed by plate (vehicles must pre-exist)
// instead of vehicle id — CSV-friendly.
exports.bulkPolicyRowSchema = z.object({
    plateNumber: z.string().trim().min(1).max(32),
    policyNumber: z.string().trim().min(1).max(64),
    coverageType: z.string().trim().max(64).optional().or(z.literal("")),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isActive: z.boolean().default(true),
    externalReference: z.string().trim().max(128).optional().or(z.literal("")),
});
exports.courtReferralSchema = z.object({
    recordId: z.uuid(),
    courtLiaisonId: z.string().min(1),
    reason: z.string().trim().max(1000).optional().or(z.literal("")),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.courtOutcomeOptions = [
    "pending",
    "charged",
    "withdrawn",
    "dismissed",
    "convicted",
    "acquitted",
    "other",
];
exports.courtOutcomeSchema = z.object({
    referralId: z.uuid(),
    outcome: z.enum(exports.courtOutcomeOptions),
    outcomeNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});
// F3 fine ledger: payments are positive, receipted, and capped above any
// realistic Malawian traffic fine so typos (extra zeros) fail loudly.
// Phase 1 (records review R2/R3): every payment records who paid, how, and
// which branch received it — the issuer/receiver split that makes
// any-counter payment safe.
exports.paymentMethodOptions = ["cash", "mobile", "bank"];
exports.paymentChannelOptions = ["counter", "mobile", "clerk"];
exports.citationPaymentSchema = z.object({
    recordId: z.uuid(),
    amount: z.number().positive().max(100000000),
    receiptNo: z.string().trim().max(64).optional().or(z.literal("")),
    note: z.string().trim().max(500).optional().or(z.literal("")),
    payerName: z.string().trim().min(2).max(120),
    paymentMethod: z.enum(exports.paymentMethodOptions),
    channel: z.enum(exports.paymentChannelOptions).default("counter"),
    // Set when a monitor receipts on behalf of another branch's counter;
    // otherwise the server stamps the viewer's own branch.
    receivingBranchId: z.uuid().optional().or(z.literal("")),
    // Countersign path: issuer receipting their own ticket must name the
    // second officer/monitor who witnessed it.
    countersignedBy: z.string().trim().max(120).optional().or(z.literal("")),
});
// Phase 1: spoiled/duplicate tickets are voided with a reason + supervisor
// countersign — never edited away. Voided tickets stay queryable.
exports.citationVoidSchema = z.object({
    recordId: z.uuid(),
    reason: z.string().trim().min(10).max(500),
});
// Phase 3 locate → confirm → clear: a locate report carries where + what
// happened; confirmation is a separate human (approver ≠ reporter).
exports.locateReportSchema = z.object({
    recordId: z.uuid(),
    place: z.string().trim().min(2).max(300),
    note: z.string().trim().min(10).max(2000),
});
exports.dispositionOptions = [
    "held",
    "returned",
    "destroyed",
    "auctioned",
];
exports.dispositionSchema = z.object({
    recordId: z.uuid(),
    disposition: z.enum(exports.dispositionOptions),
});
// Phase 4 impound custody: holds are ordered (supervisor/investigator),
// releases are dual-signed (authority + ID-checked recipient), owner notice
// is timestamped. Release/hold rows are set-once — corrections go to audit.
exports.custodyHoldSchema = z.object({
    recordId: z.uuid(),
    holdBasis: z.string().trim().min(10).max(500),
    towCompany: z.string().trim().max(120).optional().or(z.literal("")),
    lotLocation: z.string().trim().max(200).optional().or(z.literal("")),
    bay: z.string().trim().max(40).optional().or(z.literal("")),
});
exports.custodyReleaseSchema = z.object({
    recordId: z.uuid(),
    recipientName: z.string().trim().min(2).max(120),
    recipientIdChecked: z.string().trim().min(2).max(120),
    feesSnapshot: z.number().nonnegative().max(100000000).optional(),
});
exports.ownerNoticeSchema = z.object({
    recordId: z.uuid(),
});
// F3 court scheduling: monitors set the appearance date (today or future)
// and optionally the court organization.
exports.citationCourtScheduleSchema = z.object({
    recordId: z.uuid(),
    courtDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => value >= new Date().toISOString().slice(0, 10), {
        message: "Court date cannot be in the past.",
    }),
    courtId: z.uuid().optional().or(z.literal("")),
});
// F4 e-Brief: fixed brief-item labels keep the statement checklist
// comparable across referrals.
exports.referralDocumentLabels = [
    "charge_sheet",
    "witness_statement",
    "exhibit_photo",
    "id_document",
    "medical_report",
    "other",
];
exports.referralDocumentSchema = z.object({
    referralId: z.string().uuid(),
    label: z.enum(exports.referralDocumentLabels),
    url: z.string().min(1).max(2000),
    storagePath: z.string().min(1).max(500),
    fileType: z.string().min(1).max(120),
    fileHash: z.string().min(1).max(128).optional().or(z.literal("")),
});
// F9 tasking: monitors assign a case to one officer/monitor with an optional
// due date (today or future) and note.
exports.assignmentSchema = z.object({
    recordId: z.string().uuid(),
    assigneeId: z.string().min(1),
    dueAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => value >= new Date().toISOString().slice(0, 10), {
        message: "Due date cannot be in the past.",
    })
        .optional()
        .or(z.literal("")),
    note: z.string().trim().max(500).optional().or(z.literal("")),
});
// N4 machine keys: issued by system admins to one active user, bound by
// scopes, optionally expiring.
exports.apiKeyScopes = ["plate:read"];
exports.apiKeySchema = z.object({
    userId: z.string().min(1),
    name: z.string().trim().min(2).max(80),
    scopes: z.array(z.enum(exports.apiKeyScopes)).min(1).max(10),
    expiresAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => value >= new Date().toISOString().slice(0, 10), {
        message: "Expiry cannot be in the past.",
    })
        .optional()
        .or(z.literal("")),
});
