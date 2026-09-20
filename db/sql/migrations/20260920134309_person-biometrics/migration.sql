ALTER TYPE "audit_action_type" ADD VALUE 'fingerprint_recorded' BEFORE 'insurer_flag_lookup';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'dna_sample_recorded' BEFORE 'insurer_flag_lookup';--> statement-breakpoint
CREATE TABLE "person_dna_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"person_id" uuid NOT NULL,
	"sample_type" text,
	"lab_name" text,
	"lab_reference" text,
	"status" text DEFAULT 'collected' NOT NULL,
	"relationship_to_subject" text,
	"collected_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"person_id" uuid NOT NULL,
	"reference_no" text,
	"quality" text,
	"date_processed" date,
	"processed_by" text,
	"afis_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "person_id" uuid;--> statement-breakpoint
CREATE INDEX "person_dna_samples_person_id_idx" ON "person_dna_samples" ("person_id");--> statement-breakpoint
CREATE INDEX "person_fingerprints_person_id_idx" ON "person_fingerprints" ("person_id");--> statement-breakpoint
CREATE INDEX "actions_person_id_idx" ON "actions" ("person_id");--> statement-breakpoint
ALTER TABLE "person_dna_samples" ADD CONSTRAINT "person_dna_samples_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "person_fingerprints" ADD CONSTRAINT "person_fingerprints_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "person_fingerprints" ADD CONSTRAINT "person_fingerprints_processed_by_users_id_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id") ON DELETE SET NULL;