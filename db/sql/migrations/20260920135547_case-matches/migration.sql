ALTER TYPE "audit_action_type" ADD VALUE 'match_proposed' BEFORE 'insurer_flag_lookup';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'match_confirmed' BEFORE 'insurer_flag_lookup';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'match_excluded' BEFORE 'insurer_flag_lookup';--> statement-breakpoint
CREATE TABLE "person_case_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id_a" uuid NOT NULL,
	"record_id_b" uuid NOT NULL,
	"match_type" text DEFAULT 'possible' NOT NULL,
	"score" numeric,
	"reason" text,
	"proposed_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "person_case_matches_record_a_idx" ON "person_case_matches" ("record_id_a");--> statement-breakpoint
CREATE INDEX "person_case_matches_record_b_idx" ON "person_case_matches" ("record_id_b");--> statement-breakpoint
CREATE INDEX "person_case_matches_type_idx" ON "person_case_matches" ("match_type");--> statement-breakpoint
ALTER TABLE "person_case_matches" ADD CONSTRAINT "person_case_matches_record_id_a_records_id_fkey" FOREIGN KEY ("record_id_a") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "person_case_matches" ADD CONSTRAINT "person_case_matches_record_id_b_records_id_fkey" FOREIGN KEY ("record_id_b") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "person_case_matches" ADD CONSTRAINT "person_case_matches_proposed_by_users_id_fkey" FOREIGN KEY ("proposed_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "person_case_matches" ADD CONSTRAINT "person_case_matches_reviewed_by_users_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;