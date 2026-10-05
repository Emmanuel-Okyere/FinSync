"use server";

import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, importBatches, transactions, type ImportRow } from "@/db/schema";
import { FormState, UserError, run, zUuid } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { ensureCategories } from "@/lib/budget";
import { extractRows, parseCsv, rowHash, suggestCategory } from "@/lib/import";
import { enforce } from "@/lib/rate-limit";
import { flash } from "@/lib/flash";

const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadStatement(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await enforce(`import:${user.id}`, 20, 60 * 60);
    const source = z.enum(["momo", "bank"]).parse(fd.get("source") ?? "momo");
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
    const [batch] = await db.insert(importBatches).values({ userId: user.id, source, fileName: name, rows: prepared }).returning({ id: importBatches.id });
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

    const chosen = batch.rows
      .map((r, i) => ({ ...r, include: fd.get(`inc_${i}`) === "on", categoryId: String(fd.get(`cat_${i}`) ?? r.categoryId ?? "") || null }))
      .filter((r) => r.include);
    for (const r of chosen) if (r.categoryId && !catIds.has(r.categoryId)) throw new UserError("Pick categories from your list.");

    // Mark done first so a double submit can't import twice.
    const claimed = await db
      .update(importBatches)
      .set({ status: "done", importedCount: chosen.length })
      .where(and(eq(importBatches.id, batch.id), eq(importBatches.status, "pending")))
      .returning({ id: importBatches.id });
    if (!claimed.length) throw new UserError("This import is already finished.");

    for (let i = 0; i < chosen.length; i += 500) {
      await db.insert(transactions).values(
        chosen.slice(i, i + 500).map((r) => ({
          userId: user.id,
          kind: r.kind,
          amountMinor: r.amountMinor,
          categoryId: r.categoryId,
          name: r.name,
          method: r.method,
          occurredOn: r.occurredOn,
          source: "import",
          importHash: r.hash,
        })),
      );
    }
    await flash(`${chosen.length} entr${chosen.length === 1 ? "y" : "ies"} imported`);
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
