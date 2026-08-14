CREATE TABLE "product_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb,
	"non_goals" jsonb DEFAULT '[]'::jsonb,
	"open_questions" jsonb DEFAULT '[]'::jsonb,
	"generated_by" "generated_by" DEFAULT 'human' NOT NULL,
	"prompt_snapshot" text,
	"model_version" varchar(120),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_docs_opportunity_id_unique" UNIQUE("opportunity_id")
);
--> statement-breakpoint
CREATE TABLE "user_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"as_a" varchar(255),
	"i_want" text NOT NULL,
	"so_that" text,
	"acceptance_criteria" jsonb DEFAULT '[]'::jsonb,
	"priority" varchar(20) DEFAULT 'should' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"confirmed" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "outcome_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "outcome_summary" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "outcome_evidence_id" uuid;--> statement-breakpoint
ALTER TABLE "product_docs" ADD CONSTRAINT "product_docs_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_docs" ADD CONSTRAINT "product_docs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_docs" ADD CONSTRAINT "product_docs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_outcome_evidence_id_evidence_id_fk" FOREIGN KEY ("outcome_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;