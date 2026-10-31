"use server";

import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, categories, importBatches, savingsAccounts, transactions, type ImportRow } from "@/db/schema";
import { FormState, UserError, run, zUuid } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { ensureCategories } from "@/lib/budget";
import { extractRows, markAutoSaves, parseCsv, rowHash, suggestCategory } from "@/lib/import";
import { accountMethod } from "@/lib/accounts";
import { enforce } from "@/lib/rate-limit";
import { flash } from "@/lib/flash";
import { chargesCategoryId } from "@/lib/charges";

const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadStatement(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await enforce(`import:${user.id}`, 20, 60 * 60);
    const source = z.enum(["momo", "bank"]).parse(fd.get("source") ?? "momo");
    const accountId = fd.get("accountId") ? zUuid.parse(fd.get("accountId")) : null;
    const [account] = accountId ? await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id))) : [];
    if (accountId && !account) throw new UserError("Pick one of your accounts.", "accountId");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a CSV file.", "file");
    if (file.size > MAX_BYTES) throw new UserError("That file is over 4 MB.", "file");
    const name = file.name.slice(0, 120);
    if (!/\.csv$/i.test(name) && file.type !== "text/csv") throw new UserError("Export the statement as CSV, then upload it.", "file");

    const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
    if (text.includes("\u0000")) throw new UserError("That doesn't look like a CSV text file.", "file");
    const { rows, error } = extractRows(parseCsv(text), source);
    if (error) throw new UserError(error, "file");

    await ensureCategories(user.id);
    const cats = await db.select().from(categories).where(eq(categories.userId, user.id));
    const byName = new Map(cats.map((c) => [c.name, c.id]));
    const dates = rows.map((r) => r.occurredOn).sort();
    const existing = await db
      .select({ name: transactions.name, categoryId: transactions.categoryId, occurredOn: transactions.occurredOn, amount: transactions.amountMinor, kind: transactions.kind, importHash: transactions.importHash })
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), gte(transactions.occurredOn, dates[0]), lte(transactions.occurredOn, dates[dates.length - 1])));
    const learnedRows = await db
      .select({ name: transactions.name, categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.userId, user.id))
      .limit(3000);
    const learned = new Map(learnedRows.filter((r) => r.categoryId).map((r) => [r.name.toLowerCase(), r.categoryId!]));
    const hashes = new Set(existing.map((e) => e.importHash).filter(Boolean));
    const sameDayAmount = new Set(existing.map((e) => `${e.occurredOn}|${e.kind}|${e.amount}`));

    const prepared: ImportRow[] = rows.map((r) => {
      const hash = rowHash(r);
      const duplicate = hashes.has(hash) || sameDayAmount.has(`${r.occurredOn}|${r.kind}|${r.amountMinor}`);
      return { ...r, hash, duplicate, include: !duplicate, categoryId: suggestCategory(r.name, r.kind, byName, learned) };
    });
    // The account's bank takes automatic savings after payments: link those debits to their payments.
    if (account?.saveToId && account.saveMinor > 0) {
      markAutoSaves(prepared, account.saveMinor, account.saveExcept);
      for (const r of prepared) if (r.saveFor != null) r.categoryId = null;
    }
    if (account) for (const r of prepared) r.method = accountMethod(account);
    const [batch] = await db.insert(importBatches).values({ userId: user.id, source, fileName: name, rows: prepared, accountId: account?.id ?? null }).returning({ id: importBatches.id });
    await flash(`Found ${prepared.length} entr${prepared.length === 1 ? "y" : "ies"}. Check them before importing.`);
    redirect(`/import/${batch.id}`);
  });
}

export async function confirmImport(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.userId, user.id)));
    if (!batch || batch.status !== "pending") throw new UserError("This import is already finished.");
    const catIds = new Set((await db.select({ id: categories.id }).from(categories).where(eq(categories.userId, user.id))).map((c) => c.id));

    const [account] = batch.accountId ? await db.select().from(accounts).where(and(eq(accounts.id, batch.accountId), eq(accounts.userId, user.id))) : [];
    const [saveTo] = account?.saveToId ? await db.select().from(savingsAccounts).where(and(eq(savingsAccounts.id, account.saveToId), eq(savingsAccounts.userId, user.id))) : [];
    const all = batch.rows.map((r, i) => ({ ...r, i, include: fd.get(`inc_${i}`) === "on", categoryId: String(fd.get(`cat_${i}`) ?? r.categoryId ?? "") || null }));
    // Automatic savings are recorded against their payment, not as spending.
    const savesRows = saveTo ? all.filter((r) => r.include && r.saveFor != null) : [];
    const chosen = all.filter((r) => r.include && !(saveTo && r.saveFor != null));
    for (const r of chosen) if (r.categoryId && !catIds.has(r.categoryId)) throw new UserError("Pick categories from your list.");

    // Mark done first so a double submit can't import twice.
    const claimed = await db
      .update(importBatches)
      .set({ status: "done", importedCount: chosen.length })
      .where(and(eq(importBatches.id, batch.id), eq(importBatches.status, "pending")))
      .returning({ id: importBatches.id });
    if (!claimed.length) throw new UserError("This import is already finished.");

    const withFees = chosen.some((r) => r.kind === "expense" && r.feeMinor);
    const feeCat = withFees ? await chargesCategoryId(user.id) : null;
    const idByRow = new Map<number, string>();
    for (let i = 0; i < chosen.length; i += 500) {
      const slice = chosen.slice(i, i + 500);
      const inserted = await db.insert(transactions).values(
        slice.map((r) => ({
          userId: user.id,
          kind: r.kind,
          amountMinor: r.amountMinor,
          categoryId: r.categoryId,
          name: r.name,
          method: r.method,
          accountId: account?.id ?? null,
          occurredOn: r.occurredOn,
          source: "import",
          importHash: r.hash,
        })),
      ).returning({ id: transactions.id });
      slice.forEach((r, j) => inserted[j] && idByRow.set(r.i, inserted[j].id));
      // The statement's own fee column becomes a linked "Transfer charges" entry.
      const fees = slice
        .map((r, j) => ({ r, parentId: inserted[j]?.id }))
        .filter(({ r, parentId }) => parentId && r.kind === "expense" && r.feeMinor && r.feeMinor > 0)
        .map(({ r, parentId }) => ({
          userId: user.id,
          kind: "expense" as const,
          amountMinor: r.feeMinor!,
          categoryId: feeCat,
          name: `Charge · ${r.name}`.slice(0, 80),
          method: r.method,
          occurredOn: r.occurredOn,
          source: "fee",
          feeForId: parentId!,
          accountId: account?.id ?? null,
        }));
      if (fees.length) await db.insert(transactions).values(fees);
    }
    if (saveTo && savesRows.length) {
      await db.insert(categories).values({ userId: user.id, name: saveTo.name, bucket: "savings", icon: "wallet" }).onConflictDoNothing();
      const [cat] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, user.id), eq(categories.name, saveTo.name)));
      const values = savesRows.map((r) => {
        const parentId = r.saveFor != null ? idByRow.get(r.saveFor) : undefined;
        const parent = r.saveFor != null ? batch.rows[r.saveFor] : undefined;
        return {
          userId: user.id,
          kind: "expense" as const,
          amountMinor: r.amountMinor,
          categoryId: cat.id,
          name: `${saveTo.name}${parent ? ` · ${parent.name}` : ""}`.slice(0, 80),
          method: r.method,
          accountId: account!.id,
          occurredOn: r.occurredOn,
          source: "autosave",
          importHash: r.hash,
          saveForId: parentId ?? null,
          savingsAccountId: saveTo.id,
        };
      });
      for (let i = 0; i < values.length; i += 500) await db.insert(transactions).values(values.slice(i, i + 500));
      const total = values.reduce((s, v) => s + v.amountMinor, 0);
      await db.update(savingsAccounts).set({ balanceMinor: sql`${savingsAccounts.balanceMinor} + ${total}`, updatedAt: new Date() }).where(eq(savingsAccounts.id, saveTo.id));
    }
    await flash(`${chosen.length} entr${chosen.length === 1 ? "y" : "ies"} imported${savesRows.length ? `, plus ${savesRows.length} automatic saving${savesRows.length === 1 ? "" : "s"} to ${saveTo!.name}` : ""}`);
    redirect(`/import/${batch.id}/done`);
  });
}

export async function discardImport(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await db.delete(importBatches).where(and(eq(importBatches.id, zUuid.parse(fd.get("id"))), eq(importBatches.userId, user.id), inArray(importBatches.status, ["pending"])));
    await flash("Import discarded");
    redirect("/import");
  });
}
