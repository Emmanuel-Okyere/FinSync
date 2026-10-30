ALTER TABLE "budget_months" ADD COLUMN "end_date" date;--> statement-breakpoint
-- Existing budgets were calendar months: each ends on its month's last day.
UPDATE "budget_months" SET "end_date" = ("month" + interval '1 month' - interval '1 day')::date WHERE "end_date" IS NULL;--> statement-breakpoint
ALTER TABLE "budget_months" ALTER COLUMN "end_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_months" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "budget_cycle" text DEFAULT 'calendar' NOT NULL;--> statement-breakpoint
CREATE INDEX "budget_months_user_end_idx" ON "budget_months" USING btree ("user_id","end_date");--> statement-breakpoint
ALTER TABLE "budget_months" ADD CONSTRAINT "budget_period_order" CHECK ("budget_months"."end_date" >= "budget_months"."month");