ALTER TABLE "citation_payments" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "citation_payments" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "citation_payments" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "citation_payments" ADD COLUMN "receiving_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "ticket_number" text;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "statute_code" text;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD COLUMN "void_by" text;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD CONSTRAINT "traffic_citations_ticket_number_key" UNIQUE("ticket_number");--> statement-breakpoint
CREATE INDEX "traffic_citations_ticket_number_idx" ON "traffic_citations" ("ticket_number");--> statement-breakpoint
ALTER TABLE "citation_payments" ADD CONSTRAINT "citation_payments_receiving_branch_id_branches_id_fkey" FOREIGN KEY ("receiving_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "traffic_citations" ADD CONSTRAINT "traffic_citations_void_by_users_id_fkey" FOREIGN KEY ("void_by") REFERENCES "users"("id") ON DELETE SET NULL;