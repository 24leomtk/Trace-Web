ALTER TYPE "record_type" ADD VALUE 'unclaimed_person' BEFORE 'stolen_property';--> statement-breakpoint
CREATE TABLE "unclaimed_person_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL,
	"person_id" uuid,
	"deceased_name" text NOT NULL,
	"date_of_death" date,
	"place_of_death" text,
	"identification_method" text,
	"reason_unclaimed" text,
	"custodial_branch_id" uuid,
	"district" "district",
	"status" "case_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "unclaimed_person_cases_record_id_idx" ON "unclaimed_person_cases" ("record_id");--> statement-breakpoint
CREATE INDEX "unclaimed_person_cases_person_id_idx" ON "unclaimed_person_cases" ("person_id");--> statement-breakpoint
CREATE INDEX "unclaimed_person_cases_district_idx" ON "unclaimed_person_cases" ("district");--> statement-breakpoint
CREATE INDEX "unclaimed_person_cases_status_idx" ON "unclaimed_person_cases" ("status");--> statement-breakpoint
ALTER TABLE "unclaimed_person_cases" ADD CONSTRAINT "unclaimed_person_cases_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "unclaimed_person_cases" ADD CONSTRAINT "unclaimed_person_cases_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id");--> statement-breakpoint
ALTER TABLE "unclaimed_person_cases" ADD CONSTRAINT "unclaimed_person_cases_custodial_branch_id_branches_id_fkey" FOREIGN KEY ("custodial_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL;