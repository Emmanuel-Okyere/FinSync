CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"last4" text,
	"fee" jsonb,
	"save_minor" bigint DEFAULT 0 NOT NULL,
	"save_to_id" uuid,
	"save_except" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_last4" CHECK ("accounts"."last4" IS NULL OR "accounts"."last4" ~ '^[0-9]{4}$'),
	CONSTRAINT "accounts_save_pos" CHECK ("accounts"."save_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "save_for_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "savings_account_id" uuid;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_save_to_id_savings_accounts_id_fk" FOREIGN KEY ("save_to_id") REFERENCES "public"."savings_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_name_uq" ON "accounts" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "fixed_expenses" ADD CONSTRAINT "fixed_expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_save_for_id_transactions_id_fk" FOREIGN KEY ("save_for_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_savings_account_id_savings_accounts_id_fk" FOREIGN KEY ("savings_account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_save_for_idx" ON "transactions" USING btree ("save_for_id");