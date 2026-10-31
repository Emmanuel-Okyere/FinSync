ALTER TABLE "fixed_expenses" ADD COLUMN "method" text DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD COLUMN "no_charge" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "fee_for_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fee_for_id_transactions_id_fk" FOREIGN KEY ("fee_for_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_fee_for_idx" ON "transactions" USING btree ("fee_for_id");