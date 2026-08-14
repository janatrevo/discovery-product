CREATE TABLE "pattern_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"patterns_json" jsonb NOT NULL,
	"evidence_count_analyzed" integer DEFAULT 0 NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "source_survey_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "source_interview_id" uuid;--> statement-breakpoint
ALTER TABLE "pattern_analyses" ADD CONSTRAINT "pattern_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_analyses" ADD CONSTRAINT "pattern_analyses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;