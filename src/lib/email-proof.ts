import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ProofDeliveryOperations = {
  markDelivered: (transaction: Prisma.TransactionClient) => Promise<{ count: number }>;
  findLatestDelivered: (
    transaction: Prisma.TransactionClient,
  ) => Promise<{ id: string } | null>;
  removeSuperseded: (
    transaction: Prisma.TransactionClient,
    retainedId: string,
  ) => Promise<unknown>;
};

export async function finalizeEmailProofDelivery(
  userId: string,
  proofId: string,
  operations: ProofDeliveryOperations,
) {
  return prisma.$transaction(async (transaction) => {
    // Security mutations and proof issuance also claim User first. Using the
    // same lock order makes concurrent deliveries choose exactly one winner
    // and prevents a delayed provider response from reviving a revoked proof.
    const locked = await transaction.user.updateMany({
      where: { id: userId },
      data: { sessionVersion: { increment: 0 } },
    });
    if (!locked.count) return false;

    const marked = await operations.markDelivered(transaction);
    if (!marked.count) return false;
    const latest = await operations.findLatestDelivered(transaction);
    if (!latest) return false;
    await operations.removeSuperseded(transaction, latest.id);
    return latest.id === proofId;
  });
}

export function nextEmailProofCreatedAt(now: Date, latestCreatedAt?: Date) {
  return latestCreatedAt && latestCreatedAt >= now
    ? new Date(latestCreatedAt.getTime() + 1)
    : now;
}
