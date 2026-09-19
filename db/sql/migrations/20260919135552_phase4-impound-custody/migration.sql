ALTER TYPE "audit_action_type" ADD VALUE 'hold_placed' BEFORE 'review_added';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'hold_released' BEFORE 'review_added';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'owner_notified' BEFORE 'review_added';--> statement-breakpoint
CREATE TABLE "impound_custody" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_id" uuid NOT NULL UNIQUE,
	"tow_company" text,
	"lot_location" text,
	"bay" text,
	"hold_authority_id" text,
	"hold_basis" text,
	"hold_placed_at" timestamp with time zone,
	"owner_notified_at" timestamp with time zone,
	"owner_notified_by" text,
	"release_auth_id" text,
	"release_at" timestamp with time zone,
	"recipient_name" text,
	"recipient_id_checked" text,
	"fees_snapshot" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "impound_custody_record_id_idx" ON "impound_custody" ("record_id");--> statement-breakpoint
ALTER TABLE "impound_custody" ADD CONSTRAINT "impound_custody_record_id_records_id_fkey" FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "impound_custody" ADD CONSTRAINT "impound_custody_hold_authority_id_users_id_fkey" FOREIGN KEY ("hold_authority_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "impound_custody" ADD CONSTRAINT "impound_custody_owner_notified_by_users_id_fkey" FOREIGN KEY ("owner_notified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "impound_custody" ADD CONSTRAINT "impound_custody_release_auth_id_users_id_fkey" FOREIGN KEY ("release_auth_id") REFERENCES "users"("id") ON DELETE SET NULL;