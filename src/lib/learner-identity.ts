import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Transaction = Prisma.TransactionClient;

export async function createLearnerForUser(
  transaction: Transaction,
  userId: string,
  displayName: string | null = null,
  knowledgeBandId: string | null = null,
) {
  return transaction.learnerProfile.upsert({
    where: { userId },
    create: { userId, displayName, knowledgeBandId },
    update: displayName ? { displayName } : {},
  });
}

export async function ensureLearnerForUser(userId: string, displayName: string | null = null) {
  return prisma.learnerProfile.upsert({
    where: { userId },
    create: { userId, displayName },
    update: {},
  });
}

// Reads never create a profile. Registration, sign-in, consent, and learning
// mutations create it explicitly through ensureLearnerForUser, so an account
// whose learning data was erased is not given an empty profile by a page view.
export async function findLearnerForUser(user: Pick<SessionUser, "id">) {
  return prisma.learnerProfile.findUnique({ where: { userId: user.id } });
}
