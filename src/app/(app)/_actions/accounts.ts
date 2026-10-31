"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, categories, savingsAccounts } from "@/db/schema";
import { FormState, UserError, formObject, run, zMoneyOpt, zText, zUuid } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { ACCOUNT_KIND_VALUES } from "@/lib/fees";
import { parseMoney } from "@/lib/money";
import { cedis } from "@/lib/money";

const accountSchema = z.object({
  name: zText(40, "Name"),
  kind: z.enum(ACCOUNT_KIND_VALUES),
  last4: z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s : null))
    .pipe(z.string().regex(/^\d{4}$/, "Last 4 digits only, like 0421").nullable()),
  feeMode: z.enum(["default", "own", "none"]).catch("default"),
  feePct: z.string().optional(),
  feeCap: z.string().optional(),
  saveTo: z.string().optional(),
  save: zMoneyOpt("Amount saved"),
});

/**
 * Adds or edits one of the user's accounts: name, kind, optional last 4 digits (never a full number),
 * its own transfer-charge rule, and the automatic saving its bank takes on payments.
 */
export async function saveAccountSetup(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = accountSchema.parse(formObject(fd));

    let fee: { pct: number; cap: number } | null = null;
    if (d.feeMode === "none") fee = { pct: 0, cap: 0 };
    if (d.feeMode === "own") {
      const pct = Number(d.feePct ?? "");
      if (!d.feePct || !Number.isFinite(pct) || pct < 0 || pct > 10) throw new UserError("Enter a charge between 0 and 10%.", "feePct");
      const cap = d.feeCap?.trim() ? parseMoney(d.feeCap) : 0;
      if (cap == null || cap < 0 || cap > 100000) throw new UserError("Enter a cap like 20, or leave it blank for none.", "feeCap");
      fee = { pct: Math.round(pct * 100) / 100, cap };
    }

    let saveToId: string | null = null;
    let saveMinor = 0;
    if (d.saveTo) {
      saveToId = zUuid.parse(d.saveTo);
      const [s] = await db.select({ id: savingsAccounts.id }).from(savingsAccounts).where(and(eq(savingsAccounts.id, saveToId), eq(savingsAccounts.userId, user.id)));
      if (!s) throw new UserError("Pick one of your savings places.", "saveTo");
      saveMinor = d.save ?? 0;
      if (saveMinor <= 0) throw new UserError("Enter how much is saved on each payment, like 100.", "save");
      if (saveMinor > 1_000_000) throw new UserError("That looks too high. Check it.", "save");
    }
    const except = fd.getAll("saveExcept").map(String).filter(Boolean);
    if (except.length > 50) throw new UserError("Pick fewer categories.");
    const own = except.length
      ? await db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, user.id), inArray(categories.id, except.map((x) => zUuid.parse(x)))))
      : [];

    const values = { name: d.name, kind: d.kind, last4: d.last4, fee, saveToId, saveMinor, saveExcept: own.map((c) => c.id) };
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    try {
      if (id) {
        const r = await db.update(accounts).set(values).where(and(eq(accounts.id, id), eq(accounts.userId, user.id))).returning({ id: accounts.id });
        if (!r.length) throw new UserError("That account no longer exists.");
      } else {
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(accounts).where(eq(accounts.userId, user.id));
        if (n >= 20) throw new UserError("You can have up to 20 accounts.");
        await db.insert(accounts).values({ ...values, userId: user.id });
      }
    } catch (e) {
      if (String((e as { cause?: unknown })?.cause ?? e).includes("accounts_user_name_uq")) throw new UserError("You already have an account with that name.", "name");
      throw e;
    }
    return saveToId ? `${d.name} saved · GH₵ ${cedis(saveMinor)} to savings on each payment` : `${d.name} saved`;
  });
}

/** Removes an account from the pickers. Past entries keep it (archived, not deleted). */
export async function archiveAccount(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const [a] = await db
      .update(accounts)
      .set({ archived: true, name: sql`${accounts.name} || ' (removed ' || to_char(now(), 'YYYYMMDDHH24MISS') || ')'` })
      .where(and(eq(accounts.id, zUuid.parse(fd.get("id"))), eq(accounts.userId, user.id)))
      .returning({ name: accounts.name });
    if (!a) throw new UserError("That account no longer exists.");
    return "Account removed";
  });
}
