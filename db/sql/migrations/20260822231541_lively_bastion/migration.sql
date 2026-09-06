ALTER TABLE "record_attachments" ADD COLUMN "url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "record_attachments" ALTER COLUMN "file_type" SET NOT NULL;
