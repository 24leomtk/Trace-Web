CREATE TYPE "access_level" AS ENUM('branch', 'district', 'country');--> statement-breakpoint
CREATE TYPE "audit_action_type" AS ENUM('record_created', 'record_viewed', 'record_updated', 'status_changed', 'cross_district_access', 'cross_branch_access', 'report_generated', 'court_case_referred', 'court_case_viewed', 'court_case_outcome_recorded', 'court_access_renewed', 'court_access_expired', 'policy_entered', 'policy_updated', 'review_added', 'insurer_flag_lookup', 'vehicle_registered', 'user_provisioned');--> statement-breakpoint
CREATE TYPE "case_status" AS ENUM('active', 'resolved', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "court_case_outcome" AS ENUM('pending', 'charged', 'withdrawn', 'dismissed', 'convicted', 'acquitted', 'other');--> statement-breakpoint
CREATE TYPE "danger_level" AS ENUM('low', 'medium', 'high', 'extreme');--> statement-breakpoint
CREATE TYPE "district" AS ENUM('balaka', 'blantyre', 'chikwawa', 'chiradzulu', 'chitipa', 'dedza', 'dowa', 'karonga', 'kasungu', 'likoma', 'lilongwe', 'machinga', 'mangochi', 'mchinji', 'mulanje', 'mwanza', 'mzimba', 'neno', 'nkhata_bay', 'nkhotakota', 'nsanje', 'ntcheu', 'ntchisi', 'phalombe', 'rumphi', 'salima', 'thyolo', 'zomba');--> statement-breakpoint
CREATE TYPE "domain" AS ENUM('regular', 'traffic');--> statement-breakpoint
CREATE TYPE "organization_type" AS ENUM('court', 'insurer', 'vehicle_registry');--> statement-breakpoint
CREATE TYPE "record_type" AS ENUM('missing_person', 'wanted_person', 'stolen_property', 'crime_incident', 'arrest_record', 'missing_vehicle', 'vehicle_offense', 'road_accident', 'traffic_citation', 'vehicle_impoundment');--> statement-breakpoint
CREATE TYPE "sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('officer', 'district_monitor', 'country_monitor', 'system_admin', 'compliance_auditor', 'court_liaison', 'insurance_portal_user', 'vehicle_registrar');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"domain" "domain" NOT NULL,
	"district" "district" NOT NULL,
	"location" text,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"org_type" "organization_type" NOT NULL,
	"district" "district",
	"contact_phone" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"phone_number" text UNIQUE,
	"phone_number_verified" boolean,
	"badge_number" text UNIQUE,
	"role" "user_role" NOT NULL,
	"domain" "domain",
	"branch_id" uuid,
	"district" "district",
	"organization_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "persons_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" text NOT NULL,
	"national_id" text,
	"date_of_birth" date,
	"sex" "sex",
	"home_district" "district",
	"distinguishing_features" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"plate_number" text NOT NULL UNIQUE,
	"make" text,
	"model" text,
	"year" integer,
	"color" text,
	"chassis_number" text,
	"engine_number" text,
	"owner_name" text,
	"owner_national_id" text,
	"owner_phone" text,
	"owner_district" "district",
	"is_flagged" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"registered_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"vehicle_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"policy_number" text NOT NULL,
	"coverage_type" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"external_reference" text,
	"entered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid,
	"person_id" uuid,
	"vehicle_id" uuid,
	"url" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_type" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_type" "record_type" NOT NULL,
	"domain" "domain" NOT NULL,
	"reported_by" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"district" "district" NOT NULL,
	"vehicle_id" uuid,
	"person_id" uuid,
	"access_level" "access_level" DEFAULT 'branch'::"access_level" NOT NULL,
	"status" "case_status" DEFAULT 'active'::"case_status" NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accident_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"accident_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "accidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"accident_date" date NOT NULL,
	"location" text NOT NULL,
	"district" "district",
	"fatalities" integer DEFAULT 0 NOT NULL,
	"injuries" integer DEFAULT 0 NOT NULL,
	"status" "case_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missing_person_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"person_id" uuid,
	"full_name" text NOT NULL,
	"age" integer,
	"last_seen_location" text,
	"last_seen_date" date,
	"district" "district",
	"status" "case_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"violation_type" text NOT NULL,
	"fine_amount" numeric,
	"is_paid" boolean DEFAULT false NOT NULL,
	"district" "district",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"case_type" text NOT NULL,
	"plate_number" text NOT NULL,
	"district" "district",
	"status" "case_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wanted_person_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"person_id" uuid,
	"full_name" text NOT NULL,
	"offense" text NOT NULL,
	"danger_level" "danger_level",
	"district" "district",
	"status" "case_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_case_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"court_liaison_id" text NOT NULL,
	"referred_by" text NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"renewed_at" timestamp with time zone,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"outcome" "court_case_outcome" DEFAULT 'pending'::"court_case_outcome" NOT NULL,
	"outcome_notes" text,
	"outcome_recorded_by" text,
	"outcome_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"status_code" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"record_id" uuid,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid,
	"vehicle_id" uuid,
	"actor_id" text NOT NULL,
	"action_type" "audit_action_type" NOT NULL,
	"reason" text,
	"ip_address" inet,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "branches_domain_idx" ON "branches" ("domain");--> statement-breakpoint
CREATE INDEX "branches_district_idx" ON "branches" ("district");--> statement-breakpoint
CREATE INDEX "organizations_org_type_idx" ON "organizations" ("org_type");--> statement-breakpoint
CREATE INDEX "organizations_district_idx" ON "organizations" ("district");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_account_id_uidx" ON "accounts" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" ("role");--> statement-breakpoint
CREATE INDEX "users_domain_idx" ON "users" ("domain");--> statement-breakpoint
CREATE INDEX "users_branch_id_idx" ON "users" ("branch_id");--> statement-breakpoint
CREATE INDEX "users_district_idx" ON "users" ("district");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" ("organization_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "persons_of_interest_national_id_idx" ON "persons_of_interest" ("national_id");--> statement-breakpoint
CREATE INDEX "persons_of_interest_full_name_idx" ON "persons_of_interest" ("full_name");--> statement-breakpoint
CREATE INDEX "vehicles_plate_number_idx" ON "vehicles" ("plate_number");--> statement-breakpoint
CREATE INDEX "vehicles_owner_national_id_idx" ON "vehicles" ("owner_national_id");--> statement-breakpoint
CREATE INDEX "vehicles_is_flagged_idx" ON "vehicles" ("is_flagged");--> statement-breakpoint
CREATE INDEX "vehicles_is_verified_idx" ON "vehicles" ("is_verified");--> statement-breakpoint
CREATE INDEX "insurance_policies_vehicle_id_idx" ON "insurance_policies" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "insurance_policies_insurer_id_idx" ON "insurance_policies" ("insurer_id");--> statement-breakpoint
CREATE INDEX "insurance_policies_policy_number_idx" ON "insurance_policies" ("policy_number");--> statement-breakpoint
CREATE INDEX "insurance_policies_is_active_idx" ON "insurance_policies" ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_policies_vehicle_policy_uidx" ON "insurance_policies" ("vehicle_id","policy_number");--> statement-breakpoint
CREATE INDEX "record_attachments_record_id_idx" ON "record_attachments" ("record_id");--> statement-breakpoint
CREATE INDEX "record_attachments_person_id_idx" ON "record_attachments" ("person_id");--> statement-breakpoint
CREATE INDEX "record_attachments_vehicle_id_idx" ON "record_attachments" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "records_type_idx" ON "records" ("record_type");--> statement-breakpoint
CREATE INDEX "records_domain_idx" ON "records" ("domain");--> statement-breakpoint
CREATE INDEX "records_branch_id_idx" ON "records" ("branch_id");--> statement-breakpoint
CREATE INDEX "records_district_idx" ON "records" ("district");--> statement-breakpoint
CREATE INDEX "records_access_level_idx" ON "records" ("access_level");--> statement-breakpoint
CREATE INDEX "records_status_idx" ON "records" ("status");--> statement-breakpoint
CREATE INDEX "records_vehicle_id_idx" ON "records" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "records_person_id_idx" ON "records" ("person_id");--> statement-breakpoint
CREATE INDEX "accident_vehicles_accident_id_idx" ON "accident_vehicles" ("accident_id");--> statement-breakpoint
CREATE INDEX "accident_vehicles_vehicle_id_idx" ON "accident_vehicles" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "accidents_record_id_idx" ON "accidents" ("record_id");--> statement-breakpoint
CREATE INDEX "accidents_district_date_idx" ON "accidents" ("district","accident_date");--> statement-breakpoint
CREATE INDEX "missing_person_cases_record_id_idx" ON "missing_person_cases" ("record_id");--> statement-breakpoint
CREATE INDEX "missing_person_cases_person_id_idx" ON "missing_person_cases" ("person_id");--> statement-breakpoint
CREATE INDEX "missing_person_cases_district_idx" ON "missing_person_cases" ("district");--> statement-breakpoint
CREATE INDEX "missing_person_cases_status_idx" ON "missing_person_cases" ("status");--> statement-breakpoint
CREATE INDEX "traffic_citations_record_id_idx" ON "traffic_citations" ("record_id");--> statement-breakpoint
CREATE INDEX "traffic_citations_vehicle_id_idx" ON "traffic_citations" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "traffic_citations_district_idx" ON "traffic_citations" ("district");--> statement-breakpoint
CREATE INDEX "vehicle_cases_record_id_idx" ON "vehicle_cases" ("record_id");--> statement-breakpoint
CREATE INDEX "vehicle_cases_vehicle_id_idx" ON "vehicle_cases" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_cases_plate_number_idx" ON "vehicle_cases" ("plate_number");--> statement-breakpoint
CREATE INDEX "vehicle_cases_type_idx" ON "vehicle_cases" ("case_type");--> statement-breakpoint
CREATE INDEX "wanted_person_cases_record_id_idx" ON "wanted_person_cases" ("record_id");--> statement-breakpoint
CREATE INDEX "wanted_person_cases_person_id_idx" ON "wanted_person_cases" ("person_id");--> statement-breakpoint
CREATE INDEX "wanted_person_cases_district_idx" ON "wanted_person_cases" ("district");--> statement-breakpoint
CREATE INDEX "wanted_person_cases_status_idx" ON "wanted_person_cases" ("status");--> statement-breakpoint
CREATE INDEX "wanted_person_cases_danger_idx" ON "wanted_person_cases" ("danger_level");--> statement-breakpoint
CREATE INDEX "court_case_access_record_id_idx" ON "court_case_access" ("record_id");--> statement-breakpoint
CREATE INDEX "court_case_access_court_liaison_id_idx" ON "court_case_access" ("court_liaison_id");--> statement-breakpoint
CREATE INDEX "court_case_access_expires_at_idx" ON "court_case_access" ("expires_at");--> statement-breakpoint
CREATE INDEX "court_case_access_outcome_idx" ON "court_case_access" ("outcome");--> statement-breakpoint
CREATE INDEX "case_reviews_record_id_idx" ON "case_reviews" ("record_id");--> statement-breakpoint
CREATE INDEX "case_reviews_reviewer_id_idx" ON "case_reviews" ("reviewer_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_user_id_idx" ON "idempotency_keys" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" ("is_read");--> statement-breakpoint
CREATE INDEX "actions_record_id_idx" ON "actions" ("record_id");--> statement-breakpoint
CREATE INDEX "actions_vehicle_id_idx" ON "actions" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "actions_actor_id_idx" ON "actions" ("actor_id");--> statement-breakpoint
CREATE INDEX "actions_type_idx" ON "actions" ("action_type");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_registered_by_users_id_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_insurer_id_organizations_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_entered_by_users_id_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_uploaded_by_users_id_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_reported_by_users_id_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_branch_id_branches_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id");--> statement-breakpoint
ALTER TABLE "accident_vehicles" ADD CONSTRAINT "accident_vehicles_accident_id_accidents_id_fkey" FOREIGN KEY ("accident_id") REFERENCES "accidents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "accident_vehicles" ADD CONSTRAINT "accident_vehicles_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id");--> statement-breakpoint
ALTER TABLE "accidents" ADD CONSTRAINT "accidents_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "missing_person_cases" ADD CONSTRAINT "missing_person_cases_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "missing_person_cases" ADD CONSTRAINT "missing_person_cases_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id");--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD CONSTRAINT "traffic_citations_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD CONSTRAINT "traffic_citations_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id");--> statement-breakpoint
ALTER TABLE "vehicle_cases" ADD CONSTRAINT "vehicle_cases_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vehicle_cases" ADD CONSTRAINT "vehicle_cases_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id");--> statement-breakpoint
ALTER TABLE "wanted_person_cases" ADD CONSTRAINT "wanted_person_cases_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wanted_person_cases" ADD CONSTRAINT "wanted_person_cases_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id");--> statement-breakpoint
ALTER TABLE "court_case_access" ADD CONSTRAINT "court_case_access_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "court_case_access" ADD CONSTRAINT "court_case_access_court_liaison_id_users_id_fkey" FOREIGN KEY ("court_liaison_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "court_case_access" ADD CONSTRAINT "court_case_access_referred_by_users_id_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "court_case_access" ADD CONSTRAINT "court_case_access_outcome_recorded_by_users_id_fkey" FOREIGN KEY ("outcome_recorded_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");