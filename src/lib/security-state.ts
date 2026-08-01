import type { Prisma } from "@prisma/client";

type Transaction = Prisma.TransactionClient;

export async function claimAuthenticatedSecurityState(
  transaction: Transaction,
  snapshot: { userId: string; sessionVersion: number; role?: string },
) {
  const claimed = await transaction.user.updateMany({
    where: {
      id: snapshot.userId,
      sessionVersion: snapshot.sessionVersion,
      ...(snapshot.role === undefined ? {} : { role: snapshot.role }),
    },
    // A no-op update locks this exact security snapshot for the rest of the
    // transaction on both supported databases. A competing revocation or
    // role/security mutation therefore has a deterministic before/after order.
    data: { sessionVersion: { increment: 0 } },
  });
  return claimed.count === 1;
}
