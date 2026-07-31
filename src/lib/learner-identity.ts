import type { Prisma } from "@prisma/client";
import { getSessionUser, type SessionUser } from "@/lib/auth";
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

export async function findLearnerForUser(user: Pick<SessionUser, "id" | "displayName">) {
  const learner = await prisma.learnerProfile.findUnique({ where: { userId: user.id } });
  return learner ?? ensureLearnerForUser(user.id, user.displayName);
}

export async function findLearnerForRequest(request: Request, options: { allowMissingConsent?: boolean } = {}) {
  const user = await getSessionUser(request, options);
  if (!user) return null;
  return findLearnerForUser(user);
}
