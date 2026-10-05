import "server-only";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { householdInvites, householdMembers, householdSettlements, households, transactions, users } from "@/db/schema";

export async function membershipOf(userId: string) {
  const [m] = await db
    .select({ householdId: householdMembers.householdId, role: householdMembers.role, h: households })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId));
  return m ?? null;
}

export async function pendingInvitesFor(phone: string | null) {
  if (!phone) return [];
  return db
    .select({ id: householdInvites.id, name: households.name, by: users.firstName })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .innerJoin(users, eq(users.id, householdInvites.invitedBy))
    .where(and(eq(householdInvites.phone, phone), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date())));
}

/** Equal-split balances: positive = others owe this member. */
export async function balances(householdId: string) {
  const members = await db
    .select({ id: users.id, firstName: users.firstName })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId));
  const ids = members.map((m) => m.id);
  const net = new Map(ids.map((id) => [id, 0]));
  if (ids.length < 2) return { members, net };
  const shared = await db
    .select({ userId: transactions.userId, amount: transactions.amountMinor })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.kind, "expense"), inArray(transactions.userId, ids)));
  for (const t of shared) {
    const share = t.amount / ids.length;
    for (const id of ids) net.set(id, net.get(id)! + (id === t.userId ? t.amount - share : -share));
  }
  const settles = await db.select().from(householdSettlements).where(eq(householdSettlements.householdId, householdId));
  for (const s of settles) {
    if (net.has(s.fromUserId)) net.set(s.fromUserId, net.get(s.fromUserId)! + s.amountMinor);
    if (net.has(s.toUserId)) net.set(s.toUserId, net.get(s.toUserId)! - s.amountMinor);
  }
  for (const [k, v] of net) net.set(k, Math.round(v));
  return { members, net };
}
