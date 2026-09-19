ALTER TYPE "audit_action_type" ADD VALUE 'tax_assessed';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'tax_payment_recorded';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'tax_waiver_proposed';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'tax_waiver_decided';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'tax_rule_updated';--> statement-breakpoint
ALTER TYPE "organization_type" ADD VALUE 'revenue_authority';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'tax_officer';--> statement-breakpoint
ALTER TYPE "user_role" ADD VALUE 'tax_compliance_officer';--> statement-breakpoint
CREATE TABLE "tax_automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_org_id" uuid NOT NULL,
	"tax_type" text NOT NULL,
	"period" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"amount" numeric,
	"engine_bands" jsonb,
	"due_day_offset" integer DEFAULT 30 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"vehicle_id" uuid NOT NULL,
	"owner_org_id" uuid NOT NULL,
	"tax_type" text NOT NULL,
	"amount_due" numeric NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_no" text,
	"received_by" text,
	"due_date" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"reference_no" text,
	"engine_cc" integer,
	"is_waived" boolean DEFAULT false NOT NULL,
	"is_exempt" boolean DEFAULT false NOT NULL,
	"waiver_status" text DEFAULT 'none' NOT NULL,
	"waiver_reason" text,
	"waiver_decided_by" text,
	"waiver_decided_at" timestamp with time zone,
	"entered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engine_cc" integer;--> statement-breakpoint
CREATE INDEX "tax_automation_rules_owner_org_id_idx" ON "tax_automation_rules" ("owner_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_automation_rules_org_type_period_uidx" ON "tax_automation_rules" ("owner_org_id","tax_type","period");--> statement-breakpoint
CREATE INDEX "vehicle_taxes_vehicle_id_idx" ON "vehicle_taxes" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_taxes_owner_org_id_idx" ON "vehicle_taxes" ("owner_org_id");--> statement-breakpoint
CREATE INDEX "vehicle_taxes_tax_type_idx" ON "vehicle_taxes" ("tax_type");--> statement-breakpoint
CREATE INDEX "vehicle_taxes_due_date_idx" ON "vehicle_taxes" ("due_date");--> statement-breakpoint
CREATE INDEX "vehicle_taxes_is_paid_idx" ON "vehicle_taxes" ("is_paid");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_taxes_vehicle_type_period_uidx" ON "vehicle_taxes" ("vehicle_id","tax_type","period_start");--> statement-breakpoint
ALTER TABLE "tax_automation_rules" ADD CONSTRAINT "tax_automation_rules_owner_org_id_organizations_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "tax_automation_rules" ADD CONSTRAINT "tax_automation_rules_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vehicle_taxes" ADD CONSTRAINT "vehicle_taxes_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vehicle_taxes" ADD CONSTRAINT "vehicle_taxes_owner_org_id_organizations_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "vehicle_taxes" ADD CONSTRAINT "vehicle_taxes_received_by_users_id_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vehicle_taxes" ADD CONSTRAINT "vehicle_taxes_waiver_decided_by_users_id_fkey" FOREIGN KEY ("waiver_decided_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vehicle_taxes" ADD CONSTRAINT "vehicle_taxes_entered_by_users_id_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id");