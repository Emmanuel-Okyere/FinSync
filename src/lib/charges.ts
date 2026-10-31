import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { feeRules, transferFee } from "@/lib/fees";

const CHARGES = "Transfer charges";

export async function chargesCategoryId(userId: string) {
  await db.insert(categories).values({ userId, name: CHARGES, bucket: "needs", icon: "bank" }).onConflictDoNothing();
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, userId), eq(categories.name, CHARGES)));
  return c.id;
}

/** The charge the user's rules give for a payment. */
export function ruleFee(user: SessionUser, amount: number, method: string) {
  return transferFee(amount, method, feeRules(user.settings.fees));
}

/**
 * Keeps a payment's linked transfer charge in step: creates, updates or removes it.
 * `fee` is in pesewas; 0 removes the charge.
 */
export async function syncCharge(
  userId: string,
  parent: { id: string; name: string; method: string; occurredOn: string; householdId?: string | null },
  fee: number,
) {
  const [existing] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.feeForId, parent.id), eq(transactions.userId, userId)));
  if (fee <= 0) {
    if (existing) await db.delete(transactions).where(eq(transactions.id, existing.id));
    return;
  }
  const values = {
    amountMinor: fee,
    name: `Charge · ${parent.name}`.slice(0, 80),
    method: parent.method,
    occurredOn: parent.occurredOn,
    householdId: parent.householdId ?? null,
  };
  if (existing) {
    await db.update(transactions).set(values).where(eq(transactions.id, existing.id));
  } else {
    await db.insert(transactions).values({
      ...values,
      userId,
      kind: "expense",
      categoryId: await chargesCategoryId(userId),
      source: "fee",
      feeForId: parent.id,
    });
  }
}
