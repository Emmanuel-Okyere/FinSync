CREATE TABLE "set_aside_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_aside_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_aside_payout_pos" CHECK ("set_aside_payouts"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "set_asides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_minor" bigint NOT NULL,
	"opening_minor" bigint DEFAULT 0 NOT NULL,
	"due_on" date NOT NULL,
	"repeat" text DEFAULT 'yearly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "set_aside_target_pos" CHECK ("set_asides"."target_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "budget_months" ADD COLUMN "carried_in_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_months" ADD COLUMN "carried_out_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_months" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD COLUMN "varies" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "set_aside_payouts" ADD CONSTRAINT "set_aside_payouts_set_aside_id_set_asides_id_fk" FOREIGN KEY ("set_aside_id") REFERENCES "public"."set_asides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside_payouts" ADD CONSTRAINT "set_aside_payouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_asides" ADD CONSTRAINT "set_asides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_asides" ADD CONSTRAINT "set_asides_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_aside_payouts_idx" ON "set_aside_payouts" USING btree ("set_aside_id");--> statement-breakpoint
CREATE INDEX "set_asides_user_idx" ON "set_asides" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "set_asides_category_uq" ON "set_asides" USING btree ("category_id");