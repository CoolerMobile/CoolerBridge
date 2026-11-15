CREATE TABLE "cloud_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_user_id" text NOT NULL,
	"cloud_bridge_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "cloud_links_cloud_bridge_id_unique" UNIQUE("cloud_bridge_id")
);
--> statement-breakpoint
CREATE TABLE "pairing_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairing_challenges_code_digest_unique" UNIQUE("code_digest")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_link_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cloud_link_id_cloud_links_id_fk" FOREIGN KEY ("cloud_link_id") REFERENCES "public"."cloud_links"("id") ON DELETE cascade ON UPDATE no action;