ALTER TYPE "audit_action_type" ADD VALUE 'locate_reported' BEFORE 'review_added';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'locate_confirmed' BEFORE 'review_added';--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "locate_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "locate_by" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "locate_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "locate_place" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "locate_note" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "disposition" text;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_locate_by_users_id_fkey" FOREIGN KEY ("locate_by") REFERENCES "users"("id") ON DELETE SET NULL;