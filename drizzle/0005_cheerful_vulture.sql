ALTER TABLE "devices" ADD COLUMN "event_token_digest" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_event_token_digest_unique" UNIQUE("event_token_digest");