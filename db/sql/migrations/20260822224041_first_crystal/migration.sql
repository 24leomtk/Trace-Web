CREATE TYPE "access_action_type" AS ENUM('code_issued', 'code_redeemed', 'code_expired', 'code_revoked', 'foreign_access', 'admin_access', 'emergency_access', 'analytics_report_access');--> statement-breakpoint
CREATE TYPE "diagnosis_threat_level" AS ENUM('none', 'moderate', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "district" AS ENUM('balaka', 'blantyre', 'chikwawa', 'chiradzulu', 'chitipa', 'dedza', 'dowa', 'karonga', 'kasungu', 'likoma', 'lilongwe', 'machinga', 'mangochi', 'mchinji', 'mulanje', 'mwanza', 'mzimba', 'neno', 'nkhata_bay', 'nkhotakota', 'nsanje', 'ntcheu', 'ntchisi', 'phalombe', 'rumphi', 'salima', 'thyolo', 'zomba');--> statement-breakpoint
CREATE TYPE "record_type" AS ENUM('outpatient_visit', 'emergency_visit', 'inpatient_admission', 'lab_test_result', 'imaging_report', 'pathology_report', 'medication_prescription', 'medication_administration', 'surgical_procedure', 'nursing_notes', 'intake_output_chart', 'immunization_record', 'screening_test', 'psychiatric_evaluation', 'discharge_summary', 'referral_record');--> statement-breakpoint
CREATE TYPE "route" AS ENUM('ORAL', 'IV', 'IM', 'SC', 'TOPICAL');--> statement-breakpoint
CREATE TYPE "sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "triage_level" AS ENUM('RED', 'YELLOW', 'GREEN');--> statement-breakpoint
CREATE TYPE "urgency" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('patient', 'doctor', 'district_admin', 'country_admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone_number" text UNIQUE,
	"phone_number_verified" boolean,
	"national_id" text UNIQUE,
	"date_of_birth" date,
	"sex" "sex",
	"district" "district",
	"role" "user_role" DEFAULT 'patient'::"user_role" NOT NULL,
	"hospital_id" uuid,
	"medical_license_no" text,
	"emergency_info" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"district" "district" NOT NULL,
	"location" text,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"profile_id" text NOT NULL,
	"hospital_id" uuid,
	"created_by" text,
	"record_type" "record_type" NOT NULL,
	"record_date" date DEFAULT current_date NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_type" text,
	"file_size_bytes" bigint,
	"checksum" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diagnosis_codes" (
	"icd10_code" text PRIMARY KEY,
	"description" text NOT NULL,
	"name" text NOT NULL,
	"is_infectious" boolean DEFAULT false NOT NULL,
	"threat_level" "diagnosis_threat_level"
);
--> statement-breakpoint
CREATE TABLE "immunization_codes" (
	"vaccine_code" text PRIMARY KEY,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "immunization_schedule" (
	"vaccine_code" text,
	"dose_number" integer,
	"recommended_age_days" integer NOT NULL,
	CONSTRAINT "immunization_schedule_pkey" PRIMARY KEY("vaccine_code","dose_number")
);
--> statement-breakpoint
CREATE TABLE "medication_codes" (
	"code" text PRIMARY KEY,
	"name" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "standard_treatment_guidelines" (
	"icd10_code" text,
	"medication_code" text,
	"is_first_line" boolean DEFAULT true NOT NULL,
	CONSTRAINT "standard_treatment_guidelines_pkey" PRIMARY KEY("icd10_code","medication_code")
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"icd10_code" text NOT NULL,
	"hospital_id" uuid,
	"district" "district",
	"age_band" text,
	"sex" "sex",
	"notes" text,
	"severity" text,
	"diagnosed_at" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "immunizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"vaccine_code" text NOT NULL,
	"dose_number" integer NOT NULL,
	"manufacturer" text,
	"hospital_id" uuid,
	"district" "district",
	"administered_at" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"profile_id" text NOT NULL,
	"diagnosis_id" uuid,
	"medication_code" text NOT NULL,
	"dose" text NOT NULL,
	"route" "route" NOT NULL,
	"frequency" text,
	"duration" text,
	"indication" text,
	"quantity" numeric,
	"hospital_id" uuid,
	"district" "district",
	"age_band" text,
	"prescribed_at" date DEFAULT current_date NOT NULL,
	"administered_at" timestamp with time zone,
	"administered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"profile_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"issued_by" text NOT NULL,
	"code" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"profile_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action_type" "access_action_type" NOT NULL,
	"access_grant_id" uuid,
	"reason" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"doctor_name" text,
	"medical_license_no" text,
	"hospital_name" text,
	"district" text,
	"location" text,
	"ip_address" inet,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_account_id_uidx" ON "accounts" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "users_national_id_idx" ON "users" ("national_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" ("role");--> statement-breakpoint
CREATE INDEX "users_hospital_id_idx" ON "users" ("hospital_id");--> statement-breakpoint
CREATE INDEX "users_district_idx" ON "users" ("district");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "medical_records_profile_id_idx" ON "medical_records" ("profile_id");--> statement-breakpoint
CREATE INDEX "medical_records_hospital_id_idx" ON "medical_records" ("hospital_id");--> statement-breakpoint
CREATE INDEX "medical_records_date_idx" ON "medical_records" ("record_date");--> statement-breakpoint
CREATE INDEX "medical_records_type_idx" ON "medical_records" ("record_type");--> statement-breakpoint
CREATE INDEX "record_attachments_record_id_idx" ON "record_attachments" ("record_id");--> statement-breakpoint
CREATE INDEX "diagnoses_district_date_idx" ON "diagnoses" ("district","diagnosed_at");--> statement-breakpoint
CREATE INDEX "diagnoses_icd10_code_idx" ON "diagnoses" ("icd10_code");--> statement-breakpoint
CREATE INDEX "diagnoses_profile_id_idx" ON "diagnoses" ("profile_id");--> statement-breakpoint
CREATE INDEX "diagnoses_record_id_idx" ON "diagnoses" ("record_id");--> statement-breakpoint
CREATE INDEX "immunizations_district_vaccine_idx" ON "immunizations" ("district","vaccine_code");--> statement-breakpoint
CREATE INDEX "immunizations_profile_id_idx" ON "immunizations" ("profile_id");--> statement-breakpoint
CREATE INDEX "immunizations_record_id_idx" ON "immunizations" ("record_id");--> statement-breakpoint
CREATE INDEX "prescriptions_district_date_idx" ON "prescriptions" ("district","prescribed_at");--> statement-breakpoint
CREATE INDEX "prescriptions_medication_code_idx" ON "prescriptions" ("medication_code");--> statement-breakpoint
CREATE INDEX "prescriptions_profile_id_idx" ON "prescriptions" ("profile_id");--> statement-breakpoint
CREATE INDEX "prescriptions_record_id_idx" ON "prescriptions" ("record_id");--> statement-breakpoint
CREATE INDEX "access_grants_profile_id_idx" ON "access_grants" ("profile_id");--> statement-breakpoint
CREATE INDEX "access_grants_doctor_id_idx" ON "access_grants" ("doctor_id");--> statement-breakpoint
CREATE INDEX "access_grants_active_idx" ON "access_grants" ("profile_id","doctor_id");--> statement-breakpoint
CREATE INDEX "actions_profile_id_idx" ON "actions" ("profile_id");--> statement-breakpoint
CREATE INDEX "actions_actor_id_idx" ON "actions" ("actor_id");--> statement-breakpoint
CREATE INDEX "actions_type_idx" ON "actions" ("action_type");--> statement-breakpoint
CREATE INDEX "actions_unreviewed_idx" ON "actions" ("reviewed");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_hospitals_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_hospital_id_hospitals_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_record_id_medical_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "immunization_schedule" ADD CONSTRAINT "immunization_schedule_UccZuikpuuTY_fkey" FOREIGN KEY ("vaccine_code") REFERENCES "immunization_codes"("vaccine_code");--> statement-breakpoint
ALTER TABLE "standard_treatment_guidelines" ADD CONSTRAINT "standard_treatment_guidelines_NFoAeLapbJQL_fkey" FOREIGN KEY ("icd10_code") REFERENCES "diagnosis_codes"("icd10_code");--> statement-breakpoint
ALTER TABLE "standard_treatment_guidelines" ADD CONSTRAINT "standard_treatment_guidelines_p4BJc7yiMbHx_fkey" FOREIGN KEY ("medication_code") REFERENCES "medication_codes"("code");--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_record_id_medical_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_icd10_code_diagnosis_codes_icd10_code_fkey" FOREIGN KEY ("icd10_code") REFERENCES "diagnosis_codes"("icd10_code");--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_hospital_id_hospitals_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");--> statement-breakpoint
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_record_id_medical_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_vaccine_code_immunization_codes_vaccine_code_fkey" FOREIGN KEY ("vaccine_code") REFERENCES "immunization_codes"("vaccine_code");--> statement-breakpoint
ALTER TABLE "immunizations" ADD CONSTRAINT "immunizations_hospital_id_hospitals_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_record_id_medical_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "medical_records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_diagnosis_id_diagnoses_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id");--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medication_code_medication_codes_code_fkey" FOREIGN KEY ("medication_code") REFERENCES "medication_codes"("code");--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospital_id_hospitals_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id");--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_administered_by_users_id_fkey" FOREIGN KEY ("administered_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_doctor_id_users_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_issued_by_users_id_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_profile_id_users_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_access_grant_id_access_grants_id_fkey" FOREIGN KEY ("access_grant_id") REFERENCES "access_grants"("id");--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_reviewed_by_users_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id");