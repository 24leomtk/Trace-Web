CREATE TABLE "person_physical_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"person_id" uuid NOT NULL,
	"feature_type" text NOT NULL,
	"body_location" text,
	"description" text,
	"approximate_size" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "age_years" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "age_from" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "age_to" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "height_cm_from" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "height_cm_to" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "weight_kg_from" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "weight_kg_to" integer;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "hair_color" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "hair_length" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "eye_color" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "complexion" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "build" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "clothing_description" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "jewelry_description" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "medical_notes" text;--> statement-breakpoint
ALTER TABLE "persons_of_interest" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "person_physical_features_person_id_idx" ON "person_physical_features" ("person_id");--> statement-breakpoint
CREATE INDEX "person_physical_features_type_idx" ON "person_physical_features" ("feature_type");--> statement-breakpoint
ALTER TABLE "person_physical_features" ADD CONSTRAINT "person_physical_features_person_id_persons_of_interest_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons_of_interest"("id") ON DELETE CASCADE;