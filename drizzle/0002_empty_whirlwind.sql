CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_link_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"pushProvider" text NOT NULL,
	"pushToken" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_pushToken_unique" UNIQUE("pushToken")
);
--> statement-breakpoint
ALTER TABLE "cloud_links" RENAME COLUMN "cloud_bridge_id" TO "bridge_id";--> statement-breakpoint
ALTER TABLE "cloud_links" DROP CONSTRAINT "cloud_links_cloud_bridge_id_unique";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "bridge_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_cloud_link_id_cloud_links_id_fk" FOREIGN KEY ("cloud_link_id") REFERENCES "public"."cloud_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_bridge_id_bridges_id_fk" FOREIGN KEY ("bridge_id") REFERENCES "public"."bridges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_links" ADD CONSTRAINT "cloud_links_bridge_id_unique" UNIQUE("bridge_id");