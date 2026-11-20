import type { LearnerProfile } from "@prisma/client";
import { REVIEW_ITEM_STATUS } from "@/lib/domain-constants";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";
import { claimAuthenticatedSecurityState } from "@/lib/security-state";
import { ensureLearnerForUser } from "@/lib/learner-identity";

// A guardian account can create profiles for children who practice on the
// guardian's device. Children have no login of their own: the guardian picks
// the active learner, and every learning API then reads and writes that
// child's profile. The selection cookie only chooses among profiles this
// account owns; it never grants access to anything else.

export const ACTIVE_LEARNER_COOKIE = "eduloop-learner";
export const MAX_CHILD_PROFILES = 6;
export const CHILD_PROFILE_CONSENT_METHOD = "CHILD_PROFILE";
const GUARDIAN_BASIS = "GUARDIAN";

type AccountUser = { id: string; displayName: string | null };

export function activeLearnerSelection(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ACTIVE_LEARNER_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

async function selectedChild(request: Request, userId: string) {
  const selected = activeLearnerSelection(request);
  if (!selected) return null;
  return prisma.learnerProfile.findFirst({ where: { id: selected, guardianUserId: userId } });
}

// The learner whose data a request reads: the selected child, or the account
// holder's own profile. Reads never create a profile.
export async function findActiveLearner(request: Request, user: AccountUser): Promise<LearnerProfile | null> {
  return await selectedChild(request, user.id)
    ?? prisma.learnerProfile.findUnique({ where: { userId: user.id } });
}

// The learner a learning mutation writes to, creating the account holder's
// own profile on first use.
export async function ensureActiveLearner(request: Request, user: AccountUser): Promise<LearnerProfile> {
  return await selectedChild(request, user.id) ?? ensureLearnerForUser(user.id, user.displayName);
}

export async function familyOverview(request: Request, user: AccountUser) {
  const [own, children, active] = await Promise.all([
    prisma.learnerProfile.findUnique({ where: { userId: user.id }, select: { id: true, displayName: true, xp: true, currentStreak: true } }),
    prisma.learnerProfile.findMany({
      where: { guardianUserId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true, xp: true, currentStreak: true, createdAt: true, knowledgeBand: { select: { slug: true, name: true } } },
    }),
    selectedChild(request, user.id),
  ]);
  const now = new Date();
  const due = children.length ? await prisma.reviewItem.groupBy({
    by: ["learnerId"],
    where: { learnerId: { in: children.map(({ id }) => id) }, status: REVIEW_ITEM_STATUS.ACTIVE, dueAt: { lte: now } },
    _count: { _all: true },
  }) : [];
  const dueByLearner = new Map(due.map((row) => [row.learnerId, row._count._all]));
  return {
    activeLearnerId: active?.id ?? null,
    self: { displayName: own?.displayName ?? user.displayName ?? null, xp: own?.xp ?? 0, currentStreak: own?.currentStreak ?? 0 },
    children: children.map((child) => ({
      id: child.id,
      displayName: child.displayName ?? "",
      xp: child.xp,
      currentStreak: child.currentStreak,
      knowledgeBand: child.knowledgeBand,
      dueReviews: dueByLearner.get(child.id) ?? 0,
      createdAt: child.createdAt.toISOString(),
    })),
    limit: MAX_CHILD_PROFILES,
  };
}

export async function createChildProfile(user: AccountUser, input: { displayName: string; knowledgeBandId: string | null }) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.learnerProfile.count({ where: { guardianUserId: user.id } });
    if (existing >= MAX_CHILD_PROFILES) return { status: "LIMIT_REACHED" as const };
    const child = await transaction.learnerProfile.create({
      data: { guardianUserId: user.id, displayName: input.displayName, knowledgeBandId: input.knowledgeBandId },
      select: { id: true, displayName: true },
    });
    // The guardian's attestation for this specific child is kept with the
    // guardian's consent history.
    await transaction.consentRecord.create({ data: {
      userId: user.id,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      basis: GUARDIAN_BASIS,
      method: CHILD_PROFILE_CONSENT_METHOD,
      subjectLearnerId: child.id,
    } });
    return { status: "CREATED" as const, child };
  });
}

// Deleting a child profile removes all of that child's learning data. Like
// learning-data erasure it binds to the exact authenticated session version.
export async function deleteChildProfile(user: { id: string; sessionVersion: number }, childId: string) {
  return prisma.$transaction(async (transaction) => {
    const claimed = await claimAuthenticatedSecurityState(transaction, { userId: user.id, sessionVersion: user.sessionVersion });
    if (!claimed) return "CONFLICT" as const;
    const removed = await transaction.learnerProfile.deleteMany({ where: { id: childId, guardianUserId: user.id } });
    return removed.count ? "DELETED" as const : "NOT_FOUND" as const;
  });
}

export async function isManagedChild(userId: string, learnerId: string) {
  return Boolean(await prisma.learnerProfile.findFirst({ where: { id: learnerId, guardianUserId: userId }, select: { id: true } }));
}
