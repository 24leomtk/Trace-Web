ALTER TYPE "audit_action_type" ADD VALUE 'payment_received' BEFORE 'review_added';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'citation_voided' BEFORE 'review_added';--> statement-breakpoint
ALTER TYPE "audit_action_type" ADD VALUE 'status_rejected' BEFORE 'review_added';