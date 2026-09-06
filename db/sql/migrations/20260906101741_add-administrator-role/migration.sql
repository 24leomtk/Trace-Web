ALTER TYPE "user_role" ADD VALUE 'administrator';--> statement-breakpoint
ALTER TABLE "access_grants" ALTER COLUMN "doctor_id" DROP NOT NULL;