CREATE TABLE "user_legal_consents" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"terms_version" varchar(20) NOT NULL,
	"privacy_version" varchar(20) NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"source" varchar(30) DEFAULT 'register' NOT NULL,
	CONSTRAINT "user_legal_consents_versions_check" CHECK (length("user_legal_consents"."terms_version") > 0 AND length("user_legal_consents"."privacy_version") > 0)
);
--> statement-breakpoint
ALTER TABLE "user_legal_consents" ADD CONSTRAINT "user_legal_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_legal_consents_user_accepted_idx" ON "user_legal_consents" USING btree ("user_id","accepted_at");