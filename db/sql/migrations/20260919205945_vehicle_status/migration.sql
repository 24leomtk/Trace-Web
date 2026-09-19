CREATE TYPE "vehicle_status" AS ENUM('active', 'out_of_service');--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "status" "vehicle_status" DEFAULT 'active'::"vehicle_status" NOT NULL;--> statement-breakpoint
CREATE INDEX "vehicles_status_idx" ON "vehicles" ("status");