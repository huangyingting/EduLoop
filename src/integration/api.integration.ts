import { NextRequest } from "next/server";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { encode } from "next-auth/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { DELETE as deleteCurrentAccount, PATCH as updateCurrentAccount } from "@/app/api/auth/account/route";
import { POST as acceptLegalConsent } from "@/app/api/auth/consent/route";
import { PATCH as completeEmailChange, POST as requestEmailChange } from "@/app/api/auth/email-change/route";
import { PATCH as completeEmailVerification, POST as requestEmailVerification } from "@/app/api/auth/email-verification/route";
import { DELETE as disconnectCurrentProvider } from "@/app/api/auth/provider/route";
import { POST as registerAccount } from "@/app/api/auth/register/route";
import { DELETE as revokeCurrentSessions } from "@/app/api/auth/sessions/route";
import { PATCH as completePasswordReset, POST as requestPasswordReset } from "@/app/api/auth/password-reset/route";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { DELETE as deleteLearner, GET as getLearner } from "@/app/api/learner/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as exportLearner } from "@/app/api/learner/export/route";
import { GET as getLearnerProfile, PATCH as updateLearnerProfile } from "@/app/api/learner/profile/route";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getQuestionHint } from "@/app/api/questions/hint/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { POST as createReport } from "@/app/api/reports/route";
import { GET as getReview, PATCH as dismissReview, POST as saveQuestion } from "@/app/api/review/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getStudioReports, PATCH as updateStudioReport } from "@/app/api/studio/reports/route";
import { GET as getStudioMetrics } from "@/app/api/studio/metrics/route";
import { prisma } from "@/lib/prisma";
import { MAX_JSON_BODY_BYTES } from "@/lib/api";
import { changeAccountPassword, deleteAccount, revokeAccountSessions } from "@/lib/account";
import { AUTH_SECRET_VALUE, AUTH_SESSION_COOKIE, getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { credentialMinimizingAdapter } from "@/lib/auth-adapter";
import { SENSITIVE_ACTION_MAX_AGE_SECONDS } from "@/lib/auth-validation";
import { calendarDay, calendarDaysBefore } from "@/lib/dates";
import { REQUIRED_DATABASE_MIGRATION } from "@/lib/database-readiness";
import { hashEmailChangeToken, issueEmailChangeToken } from "@/lib/email-change";
import { hashEmailVerificationToken } from "@/lib/email-verification";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { disconnectProviderAccount, linkProviderAccountSafely } from "@/lib/provider-account";
import { cleanupExpiredSecurityArtifacts } from "@/lib/retention";
import {
  addressRateLimitKey,
  checkRateLimit,
  cleanupExpiredRateLimitBuckets,
  rateLimitBucketId,
} from "@/lib/rate-limit";
const subjectId = "integration-subject";
const bandId = "integration-band";
const gradeId = "integration-grade";
const choiceId = "integration-choice-question";
const writtenId = "integration-written-question";
const scienceSubjectId = "integration-science-subject";
const scienceQuestionId = "integration-science-question";
const topicDimensionId = "integration-topic-dimension";
const skillDimensionId = "integration-skill-dimension";
const mathTopicId = "integration-math-topic";
const scienceTopicId = "integration-science-topic";
const mathSkillId = "integration-math-skill";
const headers = { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" };
const authUserId = "integration-auth-user";
const lifecycleUserId = "integration-lifecycle-user";
const socialPasswordUserId = "integration-social-password-user";
const sessionRevocationUserId = "integration-session-revocation-user";
const expiredRetentionUserId = "integration-expired-retention-user";
const activeRetentionUserId = "integration-active-retention-user";
const staleRegistrationUserIds = [
  "integration-stale-registration-a",
  "integration-stale-registration-b",
  "integration-stale-registration-active-verification",
  "integration-stale-registration-active-recovery",
  "integration-stale-registration-provider",
  "integration-stale-registration-session",
  "integration-stale-registration-learning",
  "integration-stale-registration-future",
  "integration-stale-registration-verified",
  "integration-stale-registration-operator",
] as const;
const deletionRaceUserId = "integration-deletion-race-user";
const sensitiveUserId = "integration-sensitive-user";
const providerUserId = "integration-provider-user";
const providerMinimizationUserId = "integration-provider-minimization-user";
const providerSocialUserId = "integration-provider-social-user";
const providerRaceUserId = "integration-provider-race-user";
const passwordResetUserId = "integration-password-reset-user";
const socialRecoveryUserId = "integration-social-recovery-user";
const verifiedRecoveryUserId = "integration-verified-recovery-user";
const ownershipRaceUserId = "integration-ownership-race-user";
const proofLockRaceUserId = "integration-proof-lock-race-user";
const providerLinkRaceUserId = "integration-provider-link-race-user";
const emailChangeUserId = "integration-email-change-user";
const emailChangeConflictUserId = "integration-email-change-conflict-user";
const emailChangeIssuanceRaceUserId = "integration-email-change-issuance-race-user";
const sensitiveMutationRaceUserId = "integration-sensitive-mutation-race-user";
const sensitiveMutationRaceReportId = "integration-sensitive-mutation-race-report";
const consentUserId = "integration-consent-user";
const authJsEmail = "authjs-flow@example.com";
const expiredRegistrationEmail = "expired-registration-retry@example.com";
const shieldUserId = "integration-shield-user";
const concurrentUserId = "integration-concurrent-user";
const journeyUserId = "integration-journey-user";
const profileUserId = "integration-profile-user";
const studioOperatorId = "integration-studio-operator";
const studioLearnerId = "integration-studio-learner";
const studioReporterId = "integration-studio-reporter";
const studioReportId = "integration-studio-report";
const consentData = {
  termsAcceptedAt: new Date("2026-07-31T00:00:00.000Z"),
  termsVersion: TERMS_VERSION,
  privacyAcceptedAt: new Date("2026-07-31T00:00:00.000Z"),
  privacyVersion: PRIVACY_VERSION,
  consentBasis: "ADULT",
} as const;

function request(url: string, method: string, body: unknown, cookie?: string) {
  return new Request(url, { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

function responseCookie(response: Response, name: string) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${name.replace(".", "\\.")}=([^;,]+)`));
  return match ? `${name}=${match[1]}` : null;
}

async function authCookie(userId: string, sessionVersion = 0, issuedAt?: number) {
  const token = await encode({
    token: {
      sub: userId,
      sessionVersion,
      authenticatedAt: issuedAt ?? Math.floor(Date.now() / 1000),
    },
    secret: AUTH_SECRET_VALUE!,
    salt: AUTH_SESSION_COOKIE,
  });
  return `${AUTH_SESSION_COOKIE}=${token}`;
}

async function revokeAfterNextUserLookup<T>(
  userId: string,
  sessionVersion: number,
  action: () => Promise<T>,
) {
  const original = prisma.user.findUnique.bind(prisma.user) as unknown as (
    args: unknown,
  ) => Promise<unknown>;
  const lookup = vi.spyOn(prisma.user, "findUnique");
  const controllable = lookup as unknown as {
    mockImplementationOnce: (implementation: (args: unknown) => Promise<unknown>) => void;
  };
  controllable.mockImplementationOnce(async (args) => {
    const snapshot = await original(args);
    expect(await revokeAccountSessions(userId, sessionVersion)).toBe("REVOKED");
    return snapshot;
  });
  try {
    return await action();
  } finally {
    lookup.mockRestore();
  }
}

beforeAll(async () => {
  await prisma.subject.create({ data: { id: subjectId, slug: "integration-math", name: "测试数学", icon: "∑", color: "#6c5ce7" } });
  await prisma.subject.create({ data: { id: scienceSubjectId, slug: "integration-science", name: "测试科学", icon: "◇", color: "#2c9b73" } });
  await prisma.gradeBand.create({ data: { id: bandId, slug: "integration-middle", name: "测试初中" } });
  await prisma.grade.create({ data: { id: gradeId, slug: "integration-grade-7", name: "测试七年级", sortOrder: 7, gradeBandId: bandId } });
  await prisma.tagDimension.create({ data: { id: topicDimensionId, key: "TOPIC", label: "知识主题", sortOrder: 0 } });
  await prisma.tagDimension.create({ data: { id: skillDimensionId, key: "SKILL", label: "能力维度", sortOrder: 1 } });
  await prisma.tag.create({ data: { id: mathTopicId, dimensionId: topicDimensionId, slug: "integration-arithmetic", label: "测试运算" } });
  await prisma.tag.create({ data: { id: scienceTopicId, dimensionId: topicDimensionId, slug: "integration-laboratory", label: "测试实验" } });
  await prisma.tag.create({ data: { id: mathSkillId, dimensionId: skillDimensionId, slug: "integration-quantitative", label: "测试计算推理" } });
  await prisma.badge.create({ data: { id: "integration-badge", slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1 } });
  await prisma.question.create({ data: {
    id: choiceId, sourceId: choiceId, sourceFile: "integration.json", sourceType: "单选题", type: "SINGLE_CHOICE",
    difficulty: "EASY", stem: "1 + 1 等于？", answer: "B", correctAnswer: JSON.stringify(["B"]), explanation: "1 + 1 = 2。",
    status: "PUBLISHED", isAutoGradable: true, optionSplit: true, subjectId, gradeBandId: bandId, gradeId,
    options: { create: [{ label: "A", content: "1", sortOrder: 0 }, { label: "B", content: "2", sortOrder: 1 }] },
    tags: { create: [{ tagId: mathTopicId }, { tagId: mathSkillId }] },
  } });
  await prisma.question.create({ data: {
    id: writtenId, sourceId: writtenId, sourceFile: "integration.json", sourceType: "解答题", type: "WRITTEN_RESPONSE",
    difficulty: "MEDIUM", stem: "写出你的解题思路。", answer: "合理即可", explanation: "检查步骤是否完整。",
    status: "PUBLISHED", isAutoGradable: false, subjectId, gradeBandId: bandId, gradeId,
  } });
  await prisma.question.create({ data: {
    id: scienceQuestionId, sourceId: scienceQuestionId, sourceFile: "integration.json", sourceType: "解答题", type: "WRITTEN_RESPONSE",
    difficulty: "MEDIUM", stem: "描述实验步骤。", answer: "合理即可", explanation: "先控制变量。",
    status: "PUBLISHED", isAutoGradable: false, subjectId: scienceSubjectId, gradeBandId: bandId, gradeId,
    tags: { create: { tagId: scienceTopicId } },
  } });
});

afterAll(async () => {
  await prisma.rateLimitBucket.deleteMany();
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: "integration-retention-" } },
  });
  await prisma.user.deleteMany({ where: { email: authJsEmail } });
  await prisma.user.deleteMany({ where: { email: expiredRegistrationEmail } });
  await prisma.user.deleteMany({ where: { id: { in: [
    authUserId, lifecycleUserId, socialPasswordUserId, sessionRevocationUserId, expiredRetentionUserId, activeRetentionUserId, deletionRaceUserId, sensitiveUserId, sensitiveMutationRaceUserId, providerUserId, providerMinimizationUserId, providerSocialUserId, providerRaceUserId, passwordResetUserId, socialRecoveryUserId, verifiedRecoveryUserId, ownershipRaceUserId, proofLockRaceUserId, providerLinkRaceUserId, emailChangeUserId, emailChangeConflictUserId, emailChangeIssuanceRaceUserId, consentUserId, shieldUserId, concurrentUserId, journeyUserId, profileUserId,
    studioOperatorId, studioLearnerId, studioReporterId, ...staleRegistrationUserIds,
  ] } } });
  await prisma.question.deleteMany({ where: { id: { in: [choiceId, writtenId, scienceQuestionId] } } });
  await prisma.badge.deleteMany({ where: { id: "integration-badge" } });
  await prisma.tag.deleteMany({ where: { id: { in: [mathTopicId, scienceTopicId, mathSkillId] } } });
  await prisma.tagDimension.deleteMany({ where: { id: { in: [topicDimensionId, skillDimensionId] } } });
  await prisma.grade.deleteMany({ where: { id: gradeId } });
  await prisma.gradeBand.deleteMany({ where: { id: bandId } });
  await prisma.subject.deleteMany({ where: { id: { in: [subjectId, scienceSubjectId] } } });
  await prisma.$disconnect();
});

describe("learner API journey", () => {
  it("rejects oversized custom JSON before route validation or mutation", async () => {
    const response = await registerAccount(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        ...headers,
        "content-length": "2",
      },
      body: "x".repeat(MAX_JSON_BODY_BYTES + 1),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
      details: { maxBytes: MAX_JSON_BODY_BYTES },
    });
  });

  it("atomically enforces shared fixed-window limits without storing raw identities", async () => {
    const key = "integration-shared-limit:198.51.100.90:private@example.com";
    const windowMs = 60_000;
    const now = Math.floor(Date.now() / windowMs) * windowMs + 1_000;
    const id = rateLimitBucketId(key, windowMs, now);

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => checkRateLimit(key, 4, windowMs, now)),
    );
    expect(responses.filter(({ allowed }) => allowed)).toHaveLength(4);
    expect(responses.filter(({ allowed }) => !allowed)).toHaveLength(8);
    expect(responses.every(({ retryAfter }) => retryAfter === 59)).toBe(true);

    const persisted = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { id } });
    expect(persisted).toMatchObject({ count: 12, windowStart: new Date(now - 1_000) });
    expect(persisted.id).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.id).not.toContain("private@example.com");

    await expect(checkRateLimit(key, 4, windowMs, now + windowMs)).resolves.toMatchObject({
      allowed: true,
      remaining: 3,
    });
  });

  it("cleans up expired shared buckets while preserving active windows", async () => {
    const now = Date.now();
    await prisma.rateLimitBucket.createMany({ data: [
      {
        id: "integration-expired-rate-limit",
        windowStart: new Date(now - 120_000),
        expiresAt: new Date(now - 60_000),
        count: 3,
      },
      {
        id: "integration-active-rate-limit",
        windowStart: new Date(now),
        expiresAt: new Date(now + 60_000),
        count: 1,
      },
    ] });

    await cleanupExpiredRateLimitBuckets(now);
    expect(await prisma.rateLimitBucket.findUnique({
      where: { id: "integration-expired-rate-limit" },
    })).toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({
      where: { id: "integration-active-rate-limit" },
    })).toBeTruthy();
  });

  it("removes expired security artifacts while preserving active proofs", async () => {
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 1);
    const activeUntil = new Date(now.getTime() + 60 * 60_000);
    await expect(cleanupExpiredSecurityArtifacts(new Date(Number.NaN))).rejects.toThrow(
      "Cleanup time must be valid.",
    );

    await prisma.user.create({ data: {
      id: expiredRetentionUserId,
      email: "expired-retention@example.com",
      sessions: { create: {
        sessionToken: "integration-retention-expired-session",
        expires: expiredAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "1".repeat(64),
        expiresAt: expiredAt,
      } },
      emailChangeTokens: { create: {
        newEmail: "expired-retention-new@example.com",
        tokenHash: "2".repeat(64),
        expiresAt: expiredAt,
      } },
      passwordResetTokens: { create: {
        tokenHash: "3".repeat(64),
        expiresAt: expiredAt,
      } },
    } });
    await prisma.user.create({ data: {
      id: activeRetentionUserId,
      email: "active-retention@example.com",
      sessions: { create: {
        sessionToken: "integration-retention-active-session",
        expires: activeUntil,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "4".repeat(64),
        expiresAt: activeUntil,
      } },
      emailChangeTokens: { create: {
        newEmail: "active-retention-new@example.com",
        tokenHash: "5".repeat(64),
        expiresAt: activeUntil,
      } },
      passwordResetTokens: { create: {
        tokenHash: "6".repeat(64),
        expiresAt: activeUntil,
      } },
    } });
    await prisma.verificationToken.createMany({ data: [
      {
        identifier: "integration-retention-expired",
        token: "expired-auth-token",
        expires: expiredAt,
      },
      {
        identifier: "integration-retention-active",
        token: "active-auth-token",
        expires: activeUntil,
      },
    ] });
    await prisma.rateLimitBucket.createMany({ data: [
      {
        id: "integration-retention-expired-bucket",
        windowStart: expiredAt,
        expiresAt: expiredAt,
        count: 2,
      },
      {
        id: "integration-retention-active-bucket",
        windowStart: now,
        expiresAt: activeUntil,
        count: 1,
      },
    ] });

    await expect(cleanupExpiredSecurityArtifacts(now)).resolves.toEqual({
      adapterSessions: 1,
      authVerificationTokens: 1,
      emailVerificationTokens: 1,
      emailChangeTokens: 1,
      passwordResetTokens: 1,
      rateLimitBuckets: 1,
      staleUnverifiedRegistrations: 0,
    });

    expect(await prisma.session.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { sessionToken: true },
    })).toEqual([{ sessionToken: "integration-retention-active-session" }]);
    expect(await prisma.verificationToken.findMany({
      where: { identifier: { startsWith: "integration-retention-" } },
      select: { identifier: true },
    })).toEqual([{ identifier: "integration-retention-active" }]);
    expect(await prisma.emailVerificationToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.emailChangeToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.passwordResetToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.rateLimitBucket.findMany({
      where: { id: { startsWith: "integration-retention-" } },
      select: { id: true },
    })).toEqual([{ id: "integration-retention-active-bucket" }]);
  });

  it("removes expired unused registrations in bounded batches without touching protected accounts", async () => {
    const now = new Date();
    const expiredEarlier = new Date(now.getTime() - 2 * 60 * 60_000);
    const expiredLater = new Date(now.getTime() - 60 * 60_000);
    const activeUntil = new Date(now.getTime() + 60 * 60_000);
    const baseRegistration = {
      passwordHash: "unused-registration-password-hash",
      registrationExpiresAt: expiredLater,
    } as const;

    await prisma.$transaction([
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[0],
        email: "stale-registration-a@example.com",
        ...baseRegistration,
        registrationExpiresAt: expiredEarlier,
        learner: { create: { knowledgeBandId: bandId } },
        consentRecords: { create: {
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          basis: "ADULT",
          method: "PASSWORD_REGISTRATION",
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[1],
        email: "stale-registration-b@example.com",
        ...baseRegistration,
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[2],
        email: "stale-registration-verification@example.com",
        ...baseRegistration,
        learner: { create: {} },
        emailVerificationTokens: { create: {
          tokenHash: "a".repeat(64),
          expiresAt: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[3],
        email: "stale-registration-recovery@example.com",
        ...baseRegistration,
        learner: { create: {} },
        passwordResetTokens: { create: {
          tokenHash: "b".repeat(64),
          expiresAt: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[4],
        email: "stale-registration-provider@example.com",
        ...baseRegistration,
        learner: { create: {} },
        accounts: { create: {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-stale-registration-provider",
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[5],
        email: "stale-registration-session@example.com",
        ...baseRegistration,
        learner: { create: {} },
        sessions: { create: {
          sessionToken: "integration-stale-registration-session",
          expires: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[6],
        email: "stale-registration-learning@example.com",
        ...baseRegistration,
        learner: { create: { xp: 10 } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[7],
        email: "stale-registration-future@example.com",
        ...baseRegistration,
        registrationExpiresAt: activeUntil,
        learner: { create: {} },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[8],
        email: "stale-registration-verified@example.com",
        ...baseRegistration,
        emailVerified: now,
        learner: { create: {} },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[9],
        email: "stale-registration-operator@example.com",
        ...baseRegistration,
        role: "CONTENT_EDITOR",
        learner: { create: {} },
      } }),
    ]);

    await expect(cleanupExpiredSecurityArtifacts(now, 0)).rejects.toThrow(
      "Stale-registration cleanup batch size must be between 1 and 1000.",
    );
    const first = await cleanupExpiredSecurityArtifacts(now, 1);
    const second = await cleanupExpiredSecurityArtifacts(now, 1);
    expect(first.staleUnverifiedRegistrations).toBe(1);
    expect(second.staleUnverifiedRegistrations).toBe(1);
    expect(await prisma.user.findMany({
      where: { id: { in: staleRegistrationUserIds.slice(0, 2) } },
      select: { id: true },
    })).toEqual([]);
    expect(await prisma.consentRecord.count({
      where: { userId: staleRegistrationUserIds[0] },
    })).toBe(0);
    expect(await prisma.learnerProfile.count({
      where: { userId: staleRegistrationUserIds[0] },
    })).toBe(0);

    const protectedIds = await prisma.user.findMany({
      where: { id: { in: staleRegistrationUserIds.slice(2) } },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    expect(protectedIds.map(({ id }) => id)).toEqual(
      [...staleRegistrationUserIds.slice(2)].sort(),
    );
  });

  it("enforces identity limits across addresses and address limits across identities", async () => {
    const resetRequest = (email: string, address: string) => new Request(
      "http://localhost/api/auth/password-reset",
      {
        method: "POST",
        headers: { ...headers, "x-forwarded-for": address },
        body: JSON.stringify({ email }),
      },
    );
    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(await requestPasswordReset(resetRequest(
        "rate-limited-missing@example.com",
        `198.51.100.${100 + index}`,
      )));
    }

    expect(responses.slice(0, 3).map(({ status }) => status)).toEqual([202, 202, 202]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await responses[3].json()).toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
    });

    const addressResponses = [];
    for (let index = 0; index < 21; index += 1) {
      addressResponses.push(await requestPasswordReset(resetRequest(
        `rate-limited-address-${index}@example.com`,
        "198.51.100.200",
      )));
    }
    expect(addressResponses.slice(0, 20).every(({ status }) => status === 202)).toBe(true);
    expect(addressResponses[20].status).toBe(429);
    expect(addressResponses[20].headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("caches strict public catalog responses and rejects a saturated shared bucket", async () => {
    const catalogHeaders = { "x-forwarded-for": "203.0.113.76" };
    const catalog = await getCatalog(new NextRequest("http://localhost/api/catalog", {
      headers: catalogHeaders,
    }));
    expect(catalog.status).toBe(200);
    expect(catalog.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    );
    expect(await catalog.json()).toMatchObject({
      subjects: expect.any(Array),
      gradeBands: expect.any(Array),
      tagDimensions: expect.any(Array),
    });

    const invalid = await getCatalog(new NextRequest("http://localhost/api/catalog?cacheBust=1", {
      headers: catalogHeaders,
    }));
    expect(invalid.status).toBe(400);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-31T12:00:30.000Z"));
    try {
      const key = addressRateLimitKey("catalog", "203.0.113.77");
      const windowMs = 60_000;
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      await prisma.rateLimitBucket.create({ data: {
        id: rateLimitBucketId(key, windowMs, now),
        windowStart: new Date(windowStart),
        expiresAt: new Date(windowStart + windowMs),
        count: 180,
      } });
      const limited = await getCatalog(new NextRequest("http://localhost/api/catalog", {
        headers: { "x-forwarded-for": "203.0.113.77" },
      }));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("30");
    } finally {
      vi.useRealTimers();
    }
  });

  it("verifies a registered email before signing in through the credentials callback", async () => {
    const password = "authjs-password-123";
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    async function credentialsCallback() {
      const csrfResponse = await authGet(new NextRequest("http://localhost/api/auth/csrf"));
      const csrf = await csrfResponse.json() as { csrfToken: string };
      const csrfCookie = responseCookie(csrfResponse, "authjs.csrf-token");
      expect(csrfCookie).toBeTruthy();
      return authPost(new NextRequest("http://localhost/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: csrfCookie!,
          "x-auth-return-redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email: authJsEmail,
          password,
          callbackUrl: "http://localhost/progress",
        }).toString(),
      }));
    }

    try {
      const registration = await registerAccount(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { ...headers, origin: "https://learn.example" },
        body: JSON.stringify({ email: authJsEmail, password, displayName: "Auth.js 学习者", knowledgeBand: "integration-middle", consentBasis: "ADULT", acceptedTerms: true }),
      }));
      expect(registration.status).toBe(201);
      expect(await registration.json()).toMatchObject({ created: true, verificationRequired: true });
      expect(await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).toMatchObject({
        emailVerified: null,
        registrationExpiresAt: expect.any(Date),
      });

      const blocked = await credentialsCallback();
      expect(responseCookie(blocked, AUTH_SESSION_COOKIE)).toBeNull();
      expect(await blocked.json()).toMatchObject({
        url: expect.stringContaining("code=email_not_verified"),
      });

      const unknown = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email: "missing-verification@example.com" },
      ));
      const resent = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email: authJsEmail.toUpperCase() },
      ));
      expect(unknown.status).toBe(202);
      expect(resent.status).toBe(202);
      expect(await unknown.json()).toEqual(await resent.clone().json());
      expect(emailFetch).toHaveBeenCalledTimes(2);

      const delivery = emailFetch.mock.calls[1]?.[1] as RequestInit | undefined;
      const emailBody = JSON.parse(String(delivery?.body)) as { text: string };
      const token = emailBody.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      expect(await prisma.emailVerificationToken.findUnique({
        where: { tokenHash: hashEmailVerificationToken(token!) },
      })).toMatchObject({ userId: expect.any(String) });

      const wrongPassword = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password: "not-the-registration-password" },
      ));
      expect(wrongPassword.status).toBe(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).emailVerified).toBeNull();
      expect(await prisma.emailVerificationToken.count({
        where: { tokenHash: hashEmailVerificationToken(token!) },
      })).toBe(1);

      const verified = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(verified.status).toBe(200);
      expect(await verified.json()).toEqual({ verified: true, providersDisconnected: 0 });
      expect(await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).toMatchObject({
        emailVerified: expect.any(Date),
        registrationExpiresAt: null,
        sessionVersion: 1,
      });
      expect(await prisma.emailVerificationToken.count({ where: { tokenHash: hashEmailVerificationToken(token!) } })).toBe(0);

      const replay = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(replay.status).toBe(400);

      const callback = await credentialsCallback();
      expect(callback.status).toBe(200);
      const sessionCookie = responseCookie(callback, AUTH_SESSION_COOKIE);
      expect(sessionCookie).toBeTruthy();
      const sessionUser = await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: sessionCookie! },
      }));
      expect(sessionUser).toMatchObject({ email: authJsEmail, displayName: "Auth.js 学习者", hasPassword: true, hasCurrentConsent: true });
      expect(await prisma.consentRecord.findFirst({ where: { userId: sessionUser!.id } })).toMatchObject({
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      expect(await prisma.learnerProfile.findUnique({
        where: { userId: sessionUser!.id },
        include: { knowledgeBand: true },
      })).toMatchObject({ knowledgeBand: { slug: "integration-middle" } });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("releases an expired unused email atomically when the mailbox owner registers again", async () => {
    const now = new Date();
    const originalUser = await prisma.user.create({ data: {
      email: expiredRegistrationEmail,
      passwordHash: await hashPassword("expired-registration-password"),
      registrationExpiresAt: new Date(now.getTime() - 1),
      learner: { create: { knowledgeBandId: bandId } },
      consentRecords: { create: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
      } },
    } });
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", emailFetch);

    try {
      const registration = await registerAccount(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { ...headers, origin: "https://learn.example" },
        body: JSON.stringify({
          email: expiredRegistrationEmail,
          password: "replacement-registration-password",
          displayName: "重新注册学习者",
          consentBasis: "GUARDIAN",
          acceptedTerms: true,
        }),
      }));
      expect(registration.status).toBe(201);
      expect(await registration.json()).toEqual({ created: true, verificationRequired: true });
      const replacement = await prisma.user.findUniqueOrThrow({
        where: { email: expiredRegistrationEmail },
        include: { learner: true, consentRecords: true },
      });
      expect(replacement.id).not.toBe(originalUser.id);
      expect(replacement).toMatchObject({
        emailVerified: null,
        registrationExpiresAt: expect.any(Date),
        learner: { displayName: "重新注册学习者" },
        consentRecords: [expect.objectContaining({
          basis: "GUARDIAN",
          method: "PASSWORD_REGISTRATION",
        })],
      });
      expect(replacement.registrationExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
      expect(emailFetch).toHaveBeenCalledOnce();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("updates a catalog-backed learner profile and rejects mismatched knowledge", async () => {
    await prisma.user.create({ data: {
      id: profileUserId,
      ...consentData,
      email: "profile@example.com",
      name: "旧昵称",
      learner: { create: { displayName: "旧昵称" } },
    } });
    const cookie = await authCookie(profileUserId);

    const initial = await getLearnerProfile(new Request("http://localhost/api/learner/profile", { headers: { cookie } }));
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({
      displayName: "旧昵称",
      knowledgeBand: null,
      gradeBands: expect.arrayContaining([expect.objectContaining({ slug: "integration-middle" })]),
    });

    const updated = await updateLearnerProfile(request("http://localhost/api/learner/profile", "PATCH", {
      displayName: "新昵称",
      knowledgeBand: "integration-middle",
      knowledgeGrade: "integration-grade-7",
    }, cookie));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      displayName: "新昵称",
      knowledgeBand: "integration-middle",
      knowledgeGrade: "integration-grade-7",
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: profileUserId } })).toMatchObject({ name: "新昵称" });
    expect(await prisma.learnerProfile.findUniqueOrThrow({
      where: { userId: profileUserId },
      include: { knowledgeBand: true, knowledgeGrade: true },
    })).toMatchObject({
      displayName: "新昵称",
      knowledgeBand: { slug: "integration-middle" },
      knowledgeGrade: { slug: "integration-grade-7" },
    });

    const invalid = await updateLearnerProfile(request("http://localhost/api/learner/profile", "PATCH", {
      displayName: "新昵称",
      knowledgeBand: null,
      knowledgeGrade: "integration-grade-7",
    }, cookie));
    expect(invalid.status).toBe(400);
  });

  it("gates persistent APIs until an adult or guardian accepts current legal versions", async () => {
    await prisma.user.create({ data: {
      id: consentUserId,
      email: "consent@example.com",
      emailVerified: new Date(),
    } });
    const cookie = await authCookie(consentUserId);
    expect(await getSessionUser(new Request("http://localhost/api/learner", { headers: { cookie } }))).toBeNull();
    expect(await getSessionUser(
      new Request("http://localhost/api/learner", { headers: { cookie } }),
      { allowMissingConsent: true },
    )).toMatchObject({ id: consentUserId, hasCurrentConsent: false });
    expect((await getLearner(new NextRequest("http://localhost/api/learner", { headers: { cookie } }))).status).toBe(401);
    const provisionalExport = await exportLearner(new NextRequest("http://localhost/api/learner/export", {
      headers: { cookie },
    }));
    expect(provisionalExport.status).toBe(200);
    expect(await provisionalExport.json()).toMatchObject({
      account: {
        email: "consent@example.com",
        currentConsent: { termsAcceptedAt: null, privacyAcceptedAt: null, basis: null },
        consentHistory: [],
      },
      learner: null,
    });
    const provisionalDelete = await deleteLearner(new NextRequest("http://localhost/api/learner", {
      method: "DELETE",
      headers: { ...headers, cookie },
    }));
    expect(provisionalDelete.status).toBe(200);
    expect(await provisionalDelete.json()).toEqual({ deleted: false });
    expect(await prisma.learnerProfile.findUnique({ where: { userId: consentUserId } })).toBeNull();

    const accepted = await acceptLegalConsent(request(
      "http://localhost/api/auth/consent",
      "POST",
      { acceptedTerms: true, consentBasis: "GUARDIAN" },
      cookie,
    ));
    expect(accepted.status).toBe(200);
    expect(await getSessionUser(new Request("http://localhost/api/learner", { headers: { cookie } }))).toMatchObject({
      id: consentUserId,
      hasCurrentConsent: true,
    });
    expect(await prisma.consentRecord.findFirst({ where: { userId: consentUserId } })).toMatchObject({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      basis: "GUARDIAN",
      method: "AUTHENTICATED_CONSENT",
    });
    expect(await prisma.learnerProfile.findUnique({ where: { userId: consentUserId } })).toBeTruthy();
  });

  it("resolves learning data only from a valid Auth.js session", async () => {
    await prisma.user.create({ data: {
      id: authUserId,
      ...consentData,
      email: "integration@example.com",
      passwordHash: "not-used-by-this-test",
      name: "测试探索者",
      learner: { create: { xp: 20, level: 1 } },
    } });

    const cookie = await authCookie(authUserId);
    const authenticatedRequest = new NextRequest("http://localhost/api/learner", {
      headers: { cookie },
    });
    expect(await getSessionUser(authenticatedRequest)).toMatchObject({ id: authUserId, email: "integration@example.com" });
    const response = await getLearner(authenticatedRequest);
    expect(await response.json()).toMatchObject({ xp: 20, level: 1 });

    expect((await getLearner(new NextRequest("http://localhost/api/learner"))).status).toBe(401);

    const authenticatedAttempt = await createAttempt(new NextRequest("http://localhost/api/attempts", {
      method: "POST",
      headers: { ...headers, cookie },
      body: JSON.stringify({
        questionId: choiceId,
        response: ["B"],
        timeZone: "Asia/Shanghai",
        clientAttemptId: "927160d2-bd5b-4348-9504-f0466beb3a80",
      }),
    }));
    expect(authenticatedAttempt.status).toBe(200);
    expect(await authenticatedAttempt.json()).toMatchObject({ totalXp: 30, isCorrect: true, persisted: true });
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: authUserId } })).toMatchObject({ xp: 30 });

    await prisma.user.update({ where: { id: authUserId }, data: { sessionVersion: { increment: 1 } } });
    expect(await getSessionUser(authenticatedRequest)).toBeNull();
  });

  it("uses a streak shield after exactly one missed calendar day", async () => {
    const today = calendarDay(new Date(), "Asia/Shanghai");
    await prisma.user.create({ data: {
      id: shieldUserId,
      ...consentData,
      email: "shield@example.com",
      learner: { create: {
        currentStreak: 5,
        bestStreak: 5,
        streakFreezes: 1,
        lastActiveOn: calendarDaysBefore(today, 2),
      } },
    } });
    const cookie = await authCookie(shieldUserId);

    const projectedHeader = await getLearner(new NextRequest(
      "http://localhost/api/learner?timeZone=Asia%2FShanghai",
      { headers: { cookie } },
    ));
    expect(await projectedHeader.json()).toMatchObject({ currentStreak: 5, streakFreezes: 1 });
    const projectedProgress = await getProgress(new NextRequest(
      "http://localhost/api/learner/progress?timeZone=Asia%2FShanghai",
      { headers: { cookie } },
    ));
    expect(await projectedProgress.json()).toMatchObject({ summary: { currentStreak: 5 } });

    const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
    }, cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentStreak: 6,
      streakFreezes: 0,
      streakFreezeUsed: true,
    });
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: shieldUserId } })).toMatchObject({
      currentStreak: 6,
      streakFreezes: 0,
      lastFreezeUsedOn: today,
      lastActiveOn: today,
    });
  });

  it("rotates account passwords, revokes sessions, and erases the full account", async () => {
    const oldPassword = "old-password-123";
    const newPassword = "new-password-456";
    const competingPassword = "competing-password-789";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: lifecycleUserId,
      ...consentData,
      email: "lifecycle@example.com",
      passwordHash: await hashPassword(oldPassword),
      learner: { create: { xp: 17 } },
      emailChangeTokens: { create: {
        newEmail: "lifecycle-pending@example.com",
        tokenHash: "a".repeat(64),
        expiresAt,
      } },
      emailVerificationTokens: { create: { tokenHash: "f".repeat(64), expiresAt } },
      passwordResetTokens: { create: { tokenHash: "9".repeat(64), expiresAt } },
      sessions: { create: { sessionToken: "integration-lifecycle-session", expires: expiresAt } },
    } });

    expect(await changeAccountPassword(lifecycleUserId, 0, "wrong-password", newPassword)).toBe("INVALID_PASSWORD");
    expect(await changeAccountPassword(lifecycleUserId, 0, oldPassword, oldPassword)).toBe("UNCHANGED");
    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);
    const cookie = await authCookie(lifecycleUserId);
    let winningPassword = newPassword;
    try {
      const passwordResponses = await Promise.all([
        updateCurrentAccount(request(
          "http://localhost/api/auth/account",
          "PATCH",
          { currentPassword: oldPassword, newPassword },
          cookie,
        )),
        updateCurrentAccount(request(
          "http://localhost/api/auth/account",
          "PATCH",
          { currentPassword: oldPassword, newPassword: competingPassword },
          cookie,
        )),
      ]);
      expect(passwordResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
      const successfulIndex = passwordResponses.findIndex(({ status }) => status === 200);
      winningPassword = successfulIndex === 0 ? newPassword : competingPassword;
      expect(await passwordResponses[successfulIndex]!.json()).toEqual({ changed: true });
      expect(await passwordResponses[successfulIndex === 0 ? 1 : 0]!.json()).toMatchObject({
        code: "CONFLICT",
      });
      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: ["lifecycle@example.com"],
        subject: "你的 EduLoop 密码已更新",
      });
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: lifecycleUserId } });
      expect(await verifyPassword(winningPassword, updated.passwordHash!)).toBe(true);
      expect(updated.sessionVersion).toBe(1);
      expect(await prisma.session.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie },
      }))).toBeNull();

      const currentCookie = await authCookie(lifecycleUserId, 1);
      const wrongDeletion = await deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: "wrong-password" },
        currentCookie,
      ));
      expect(wrongDeletion.status).toBe(401);
      const deleted = await deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: winningPassword },
        currentCookie,
      ));
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ deleted: true });
      expect(emailFetch).toHaveBeenCalledTimes(2);
      const deletionNotice = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { to: string[]; subject: string };
      expect(deletionNotice).toMatchObject({
        to: ["lifecycle@example.com"],
        subject: "你的 EduLoop 账号已删除",
      });
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: currentCookie },
      }))).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
    expect(await prisma.user.findUnique({ where: { id: lifecycleUserId } })).toBeNull();
    expect(await prisma.learnerProfile.findUnique({ where: { userId: lifecycleUserId } })).toBeNull();
  });

  it("requires mailbox verification when an untrusted social account sets a password", async () => {
    const email = "social-password@example.com";
    const password = "social-password-123";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: socialPasswordUserId,
      ...consentData,
      email,
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-social-password-microsoft",
      } },
      learner: { create: {} },
      sessions: { create: {
        sessionToken: "integration-social-password-session",
        expires: expiresAt,
      } },
    } });

    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    async function credentialsCallback() {
      const csrfResponse = await authGet(new NextRequest("http://localhost/api/auth/csrf"));
      const csrf = await csrfResponse.json() as { csrfToken: string };
      const csrfCookie = responseCookie(csrfResponse, "authjs.csrf-token");
      expect(csrfCookie).toBeTruthy();
      return authPost(new NextRequest("http://localhost/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: csrfCookie!,
          "x-auth-return-redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email,
          password,
          callbackUrl: "http://localhost/privacy",
        }).toString(),
      }));
    }

    try {
      const oldCookie = await authCookie(socialPasswordUserId);
      const response = await updateCurrentAccount(request(
        "http://localhost/api/auth/account",
        "PATCH",
        { newPassword: password },
        oldCookie,
      ));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        changed: true,
        verificationRequired: true,
        verificationScheduled: true,
      });
      expect(emailFetch).toHaveBeenCalledOnce();

      const delivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as {
        subject: string;
        text: string;
        to: string[];
      };
      expect(delivery).toMatchObject({
        subject: "验证你的 EduLoop 邮箱",
        to: [email],
      });
      const token = delivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      await prisma.emailChangeToken.create({ data: {
        userId: socialPasswordUserId,
        newEmail: "social-password-pending@example.com",
        tokenHash: "6".repeat(64),
        expiresAt,
      } });
      await prisma.passwordResetToken.create({ data: {
        userId: socialPasswordUserId,
        tokenHash: "7".repeat(64),
        expiresAt,
      } });

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: socialPasswordUserId } });
      expect(await verifyPassword(password, stored.passwordHash!)).toBe(true);
      expect(stored).toMatchObject({ emailVerified: null, sessionVersion: 1 });
      expect(await prisma.session.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      expect(await disconnectProviderAccount(socialPasswordUserId, 1, "microsoft-entra-id")).toEqual({
        status: "LAST_LOGIN_METHOD",
      });

      const blocked = await credentialsCallback();
      expect(responseCookie(blocked, AUTH_SESSION_COOKIE)).toBeNull();
      expect(await blocked.json()).toMatchObject({
        url: expect.stringContaining("code=email_not_verified"),
      });

      const wrongPassword = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password: "wrong-social-password" },
      ));
      expect(wrongPassword.status).toBe(401);
      expect(await prisma.account.count({ where: { userId: socialPasswordUserId } })).toBe(1);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialPasswordUserId } })).toBe(1);

      const verified = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(verified.status).toBe(200);
      expect(await verified.json()).toEqual({ verified: true, providersDisconnected: 1 });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: socialPasswordUserId } })).toMatchObject({
        emailVerified: expect.any(Date),
        sessionVersion: 2,
      });
      expect(await prisma.account.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await disconnectProviderAccount(socialPasswordUserId, 2, "microsoft-entra-id")).toEqual({
        status: "NOT_CONNECTED",
      });

      const signedIn = await credentialsCallback();
      expect(signedIn.status).toBe(200);
      expect(responseCookie(signedIn, AUTH_SESSION_COOKIE)).toBeTruthy();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("revokes every account session once after recent authentication", async () => {
    const email = "session-revocation@example.com";
    const expires = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: sessionRevocationUserId,
      email,
      emailVerified: new Date(),
      sessions: { create: [
        { sessionToken: "integration-session-revocation-a", expires },
        { sessionToken: "integration-session-revocation-b", expires },
      ] },
      emailVerificationTokens: { create: {
        tokenHash: "session-revocation-verification".padEnd(64, "v"),
        expiresAt: expires,
      } },
      emailChangeTokens: { create: {
        newEmail: "session-revocation-pending@example.com",
        tokenHash: "session-revocation-email-change".padEnd(64, "c"),
        expiresAt: expires,
      } },
      passwordResetTokens: { create: {
        tokenHash: "session-revocation-password-reset".padEnd(64, "r"),
        expiresAt: expires,
      } },
    } });

    const staleCookie = await authCookie(
      sessionRevocationUserId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const bucketsBeforeStaleRequest = await prisma.rateLimitBucket.count();
    const stale = await revokeCurrentSessions(new Request("http://localhost/api/auth/sessions", {
      method: "DELETE",
      headers: { ...headers, cookie: staleCookie },
    }));
    expect(stale.status).toBe(401);
    expect(await stale.json()).toEqual({
      error: "退出所有设备前请重新登录，以确认这是你的账号。",
      code: "UNAUTHORIZED",
    });
    expect(await prisma.user.findUniqueOrThrow({
      where: { id: sessionRevocationUserId },
      select: { sessionVersion: true },
    })).toEqual({ sessionVersion: 0 });
    expect(await prisma.session.count({ where: { userId: sessionRevocationUserId } })).toBe(2);
    expect(await prisma.emailVerificationToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.emailChangeToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.rateLimitBucket.count()).toBe(bucketsBeforeStaleRequest);

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const oldCookies = await Promise.all([
        authCookie(sessionRevocationUserId, 0, issuedAt),
        authCookie(sessionRevocationUserId, 0, issuedAt - 1),
      ]);
      for (const cookie of oldCookies) {
        await expect(getSessionUser(new Request("http://localhost/api/learner", {
          headers: { cookie },
        }), { allowMissingConsent: true })).resolves.toMatchObject({
          id: sessionRevocationUserId,
          sessionVersion: 0,
          hasCurrentConsent: false,
        });
      }

      const responses = await Promise.all(oldCookies.map((cookie) => revokeCurrentSessions(
        new Request("http://localhost/api/auth/sessions", {
          method: "DELETE",
          headers: { ...headers, cookie },
        }),
      )));
      expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
      expect(responses.filter(({ status }) => status === 401 || status === 409)).toHaveLength(1);
      const successful = responses.find(({ status }) => status === 200)!;
      expect(await successful.json()).toEqual({ revoked: true });

      expect(await prisma.user.findUniqueOrThrow({
        where: { id: sessionRevocationUserId },
        select: { sessionVersion: true },
      })).toEqual({ sessionVersion: 1 });
      expect(await prisma.session.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      for (const cookie of oldCookies) {
        await expect(getSessionUser(new Request("http://localhost/api/learner", {
          headers: { cookie },
        }), { allowMissingConsent: true })).resolves.toBeNull();
      }

      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as {
        to: string[];
        subject: string;
      };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop 登录会话已全部退出",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("cannot leave an email-change proof after account-wide session revocation", async () => {
    const newEmail = "email-change-issuance-race-new@example.com";
    await prisma.user.create({ data: {
      id: emailChangeIssuanceRaceUserId,
      ...consentData,
      email: "email-change-issuance-race-old@example.com",
      emailVerified: new Date(),
    } });

    const issued = await issueEmailChangeToken(emailChangeIssuanceRaceUserId, newEmail, 0);
    expect(issued.status).toBe("ISSUED");
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(1);

    await expect(revokeAccountSessions(emailChangeIssuanceRaceUserId, 0)).resolves.toBe("REVOKED");
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(0);

    await expect(issueEmailChangeToken(
      emailChangeIssuanceRaceUserId,
      newEmail,
      0,
    )).resolves.toEqual({ status: "SECURITY_CONFLICT" });
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(0);
  });

  it("rejects sensitive mutations whose authenticated session is revoked in flight", async () => {
    const password = "sensitive-mutation-race-password";
    await prisma.user.create({ data: {
      id: sensitiveMutationRaceUserId,
      ...consentData,
      email: "sensitive-mutation-race@example.com",
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      role: "CONTENT_EDITOR",
      learner: { create: {} },
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "sensitive-mutation-race-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "sensitive-mutation-race-facebook" },
      ] },
    } });
    const learner = await prisma.learnerProfile.findUniqueOrThrow({
      where: { userId: sensitiveMutationRaceUserId },
    });
    await prisma.questionReport.create({ data: {
      id: sensitiveMutationRaceReportId,
      learnerId: learner.id,
      questionId: choiceId,
      category: "UNCLEAR",
      detail: "A revoked operator request must not change content.",
    } });

    const passwordChange = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      0,
      async () => updateCurrentAccount(request(
        "http://localhost/api/auth/account",
        "PATCH",
        { currentPassword: password, newPassword: "stale-session-password" },
        await authCookie(sensitiveMutationRaceUserId, 0),
      )),
    );
    expect(passwordChange.status).toBe(409);
    expect(await passwordChange.json()).toMatchObject({ code: "CONFLICT" });
    let secured = await prisma.user.findUniqueOrThrow({ where: { id: sensitiveMutationRaceUserId } });
    expect(secured.sessionVersion).toBe(1);
    expect(await verifyPassword(password, secured.passwordHash!)).toBe(true);

    const providerDisconnect = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      1,
      async () => disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        await authCookie(sensitiveMutationRaceUserId, 1),
      )),
    );
    expect(providerDisconnect.status).toBe(409);
    expect(await prisma.account.count({ where: { userId: sensitiveMutationRaceUserId } })).toBe(2);

    const learningDeletion = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      2,
      async () => deleteLearner(new NextRequest("http://localhost/api/learner", {
        method: "DELETE",
        headers: {
          ...headers,
          cookie: await authCookie(sensitiveMutationRaceUserId, 2),
        },
      })),
    );
    expect(learningDeletion.status).toBe(409);
    expect(await prisma.learnerProfile.findUnique({
      where: { userId: sensitiveMutationRaceUserId },
    })).toBeTruthy();

    const accountDeletion = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      3,
      async () => deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: password },
        await authCookie(sensitiveMutationRaceUserId, 3),
      )),
    );
    expect(accountDeletion.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: sensitiveMutationRaceUserId } })).toBeTruthy();

    const studioTransition = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      4,
      async () => updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH",
        headers: {
          ...headers,
          cookie: await authCookie(sensitiveMutationRaceUserId, 4),
        },
        body: JSON.stringify({
          reportId: sensitiveMutationRaceReportId,
          action: "QUARANTINE",
          note: "This transition must lose to session revocation.",
        }),
      })),
    );
    expect(studioTransition.status).toBe(409);
    expect(await studioTransition.json()).toMatchObject({ code: "CONFLICT" });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: choiceId } })).toMatchObject({
      status: "PUBLISHED",
    });
    expect(await prisma.questionReport.findUniqueOrThrow({
      where: { id: sensitiveMutationRaceReportId },
    })).toMatchObject({ status: "OPEN" });
    expect(await prisma.contentReviewAction.count({
      where: { reportId: sensitiveMutationRaceReportId },
    })).toBe(0);

    secured = await prisma.user.findUniqueOrThrow({ where: { id: sensitiveMutationRaceUserId } });
    expect(secured.sessionVersion).toBe(5);
    expect(await verifyPassword(password, secured.passwordHash!)).toBe(true);
    expect(await prisma.account.count({ where: { userId: sensitiveMutationRaceUserId } })).toBe(2);
  });

  it("serializes account erasure against a concurrent password rotation", async () => {
    const oldPassword = "deletion-race-old-password";
    const newPassword = "deletion-race-new-password";
    await prisma.user.create({ data: {
      id: deletionRaceUserId,
      ...consentData,
      email: "deletion-race@example.com",
      passwordHash: await hashPassword(oldPassword),
      learner: { create: { xp: 23 } },
    } });

    const [passwordOutcome, deletionOutcome] = await Promise.all([
      changeAccountPassword(deletionRaceUserId, 0, oldPassword, newPassword),
      deleteAccount(deletionRaceUserId, 0, oldPassword),
    ]);
    expect([
      passwordOutcome === "UPDATED",
      deletionOutcome === "DELETED",
    ].filter(Boolean)).toHaveLength(1);

    if (passwordOutcome === "UPDATED") {
      expect(deletionOutcome).toBe("CONFLICT");
      expect(await prisma.learnerProfile.findUnique({ where: { userId: deletionRaceUserId } })).toBeTruthy();
      expect(await deleteAccount(deletionRaceUserId, 1, newPassword)).toBe("DELETED");
    } else {
      expect(passwordOutcome).toBe("CONFLICT");
      expect(deletionOutcome).toBe("DELETED");
    }
    expect(await prisma.user.findUnique({ where: { id: deletionRaceUserId } })).toBeNull();
    expect(await prisma.learnerProfile.findUnique({ where: { userId: deletionRaceUserId } })).toBeNull();
  });

  it("disconnects a provider only after recent authentication and revokes stored credentials", async () => {
    const email = "provider-disconnect@example.com";
    const password = "provider-disconnect-password-123";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: providerUserId,
      ...consentData,
      email,
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      accounts: { create: [
        {
          type: "oauth",
          provider: "google",
          providerAccountId: "integration-google-account",
          access_token: "stored-google-access-token",
          refresh_token: "stored-google-refresh-token",
        },
        {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-microsoft-account",
          access_token: "stored-microsoft-access-token",
        },
      ] },
      sessions: { create: {
        sessionToken: "integration-provider-adapter-session",
        expires: expiresAt,
      } },
      emailVerificationTokens: { create: { tokenHash: "c".repeat(64), expiresAt } },
      emailChangeTokens: { create: {
        newEmail: "provider-pending@example.com",
        tokenHash: "d".repeat(64),
        expiresAt,
      } },
      passwordResetTokens: { create: { tokenHash: "e".repeat(64), expiresAt } },
    } });

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const staleCookie = await authCookie(
        providerUserId,
        0,
        Math.floor(Date.now() / 1000) - 11 * 60,
      );
      const stale = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        staleCookie,
      ));
      expect(stale.status).toBe(401);

      const cookie = await authCookie(providerUserId);
      const invalid = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "github" },
        cookie,
      ));
      expect(invalid.status).toBe(400);
      const absent = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "facebook" },
        cookie,
      ));
      expect(absent.status).toBe(404);

      const disconnected = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        cookie,
      ));
      expect(disconnected.status).toBe(200);
      expect(await disconnected.json()).toEqual({ disconnected: true, provider: "google" });
      expect(await prisma.account.findMany({
        where: { userId: providerUserId },
        select: { provider: true, access_token: true, refresh_token: true },
      })).toEqual([{
        provider: "microsoft-entra-id",
        access_token: "stored-microsoft-access-token",
        refresh_token: null,
      }]);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: providerUserId } })).toMatchObject({
        sessionVersion: 1,
      });
      expect(await prisma.session.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie },
      }))).toBeNull();

      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop Google 登录连接已移除",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("persists provider identity without OAuth or OIDC bearer credentials", async () => {
    await prisma.user.create({ data: {
      id: providerMinimizationUserId,
      ...consentData,
      email: "provider-minimization@example.com",
      emailVerified: new Date(),
    } });
    const adapter = credentialMinimizingAdapter(PrismaAdapter(prisma));

    await adapter.linkAccount?.({
      userId: providerMinimizationUserId,
      type: "oidc",
      provider: "integration-oidc",
      providerAccountId: "integration-provider-identity",
      access_token: "integration-access-secret",
      refresh_token: "integration-refresh-secret",
      id_token: "integration-identity-secret",
      session_state: "integration-provider-session-secret",
      expires_at: 1_800_000_000,
      token_type: "bearer",
      scope: "openid email profile",
    });

    expect(await prisma.account.findUniqueOrThrow({
      where: { provider_providerAccountId: {
        provider: "integration-oidc",
        providerAccountId: "integration-provider-identity",
      } },
    })).toEqual({
      userId: providerMinimizationUserId,
      type: "oidc",
      provider: "integration-oidc",
      providerAccountId: "integration-provider-identity",
      access_token: null,
      refresh_token: null,
      id_token: null,
      session_state: null,
      expires_at: null,
      token_type: null,
      scope: null,
    });
  });

  it("never removes the final login method, including under concurrent disconnects", async () => {
    await prisma.user.create({ data: {
      id: providerSocialUserId,
      email: "provider-social-only@example.com",
      emailVerified: new Date(),
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "integration-social-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "integration-social-facebook" },
      ] },
    } });
    expect(await disconnectProviderAccount(providerSocialUserId, 0, "google")).toMatchObject({
      status: "DISCONNECTED",
    });
    expect(await disconnectProviderAccount(providerSocialUserId, 1, "facebook")).toEqual({
      status: "LAST_LOGIN_METHOD",
    });
    expect(await prisma.account.findMany({
      where: { userId: providerSocialUserId },
      select: { provider: true },
    })).toEqual([{ provider: "facebook" }]);

    await prisma.user.create({ data: {
      id: providerRaceUserId,
      email: "provider-race@example.com",
      emailVerified: new Date(),
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "integration-race-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "integration-race-facebook" },
      ] },
    } });
    const outcomes = await Promise.all([
      disconnectProviderAccount(providerRaceUserId, 0, "google"),
      disconnectProviderAccount(providerRaceUserId, 0, "facebook"),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual(["CONFLICT", "DISCONNECTED"]);
    expect(await prisma.account.count({ where: { userId: providerRaceUserId } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: providerRaceUserId } })).toMatchObject({
      sessionVersion: 1,
    });
  });

  it("recovers a password with a single-use emailed token and revokes old sessions", async () => {
    const email = "password-reset@example.com";
    const oldPassword = "old-reset-password-123";
    const newPassword = "new-reset-password-456";
    const registrationExpiresAt = new Date(Date.now() + 5 * 60_000);
    await prisma.user.create({ data: {
      id: passwordResetUserId,
      ...consentData,
      email,
      passwordHash: await hashPassword(oldPassword),
      registrationExpiresAt,
      learner: { create: {} },
      sessions: { create: {
        sessionToken: "integration-password-reset-session",
        expires: new Date(Date.now() + 60 * 60_000),
      } },
      emailVerificationTokens: { create: {
        tokenHash: "8".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });
    const oldCookie = await authCookie(passwordResetUserId);
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const unknown = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email: "missing@example.com" },
      ));
      const requested = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email: `  ${email.toUpperCase()}  ` },
      ));
      expect(unknown.status).toBe(202);
      expect(requested.status).toBe(202);
      expect(await unknown.json()).toEqual(await requested.clone().json());
      expect(emailFetch).toHaveBeenCalledOnce();

      const delivery = emailFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      const emailBody = JSON.parse(String(delivery?.body)) as { text: string };
      const token = emailBody.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      const issuedReset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashPasswordResetToken(token!) },
      });
      expect(issuedReset).toMatchObject({ userId: passwordResetUserId });
      expect(issuedReset!.expiresAt.getTime()).toBeLessThanOrEqual(registrationExpiresAt.getTime());
      await prisma.emailChangeToken.create({ data: {
        userId: passwordResetUserId,
        newEmail: "password-reset-pending@example.com",
        tokenHash: "b".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });

      const unchanged = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: oldPassword },
      ));
      expect(unchanged.status).toBe(400);
      expect(await prisma.passwordResetToken.count({ where: { userId: passwordResetUserId } })).toBe(1);

      const completed = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword },
      ));
      expect(completed.status).toBe(200);
      expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 0 });
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: passwordResetUserId } });
      expect(await verifyPassword(newPassword, updated.passwordHash!)).toBe(true);
      expect(updated.sessionVersion).toBe(1);
      expect(updated.emailVerified).toBeInstanceOf(Date);
      expect(updated.registrationExpiresAt).toBeNull();
      expect(await prisma.session.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      expect(emailFetch).toHaveBeenCalledTimes(2);
      const notice = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop 密码已更新",
      });

      const replay = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: "another-password-789" },
      ));
      expect(replay.status).toBe(400);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("transfers an unverified social account to the proven mailbox owner", async () => {
    const email = "social-recovery@example.com";
    const nextPassword = "social-recovery-password-456";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: socialRecoveryUserId,
      ...consentData,
      email,
      accounts: { create: [
        {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-social-recovery-microsoft",
        },
        {
          type: "oauth",
          provider: "facebook",
          providerAccountId: "integration-social-recovery-facebook",
        },
      ] },
      sessions: { create: {
        sessionToken: "integration-social-recovery-session",
        expires: expiresAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "9".repeat(64),
        expiresAt,
      } },
    } });
    const staleCookie = await authCookie(socialRecoveryUserId);
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const genericVerification = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email },
      ));
      expect(genericVerification.status).toBe(202);
      expect(emailFetch).not.toHaveBeenCalled();
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialRecoveryUserId } })).toBe(1);

      const requested = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email },
      ));
      expect(requested.status).toBe(202);
      expect(emailFetch).toHaveBeenCalledOnce();
      const delivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { text: string };
      const token = delivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();

      const completed = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: nextPassword },
      ));
      expect(completed.status).toBe(200);
      expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 2 });
      const secured = await prisma.user.findUniqueOrThrow({ where: { id: socialRecoveryUserId } });
      expect(secured).toMatchObject({ emailVerified: expect.any(Date), sessionVersion: 1 });
      expect(await verifyPassword(nextPassword, secured.passwordHash!)).toBe(true);
      expect(await prisma.account.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: staleCookie },
      }))).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("preserves trusted providers when a verified account resets its password", async () => {
    const token = "verified-recovery-token-".padEnd(43, "v");
    const verificationToken = "verified-recovery-verification".padEnd(43, "e");
    const oldPassword = "verified-recovery-old-password";
    const newPassword = "verified-recovery-new-password";
    await prisma.user.create({ data: {
      id: verifiedRecoveryUserId,
      ...consentData,
      email: "verified-recovery@example.com",
      emailVerified: new Date(),
      passwordHash: await hashPassword(oldPassword),
      accounts: { create: {
        type: "oauth",
        provider: "google",
        providerAccountId: "integration-verified-recovery-google",
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const completed = await completePasswordReset(request(
      "http://localhost/api/auth/password-reset",
      "PATCH",
      { token, newPassword },
    ));
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 0 });
    expect(await prisma.account.count({ where: { userId: verifiedRecoveryUserId } })).toBe(1);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: verifiedRecoveryUserId } });
    expect(updated.sessionVersion).toBe(1);
    expect(await verifyPassword(newPassword, updated.passwordHash!)).toBe(true);

    await prisma.emailVerificationToken.create({ data: {
      userId: verifiedRecoveryUserId,
      tokenHash: hashEmailVerificationToken(verificationToken),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    } });
    const verifiedAgain = await completeEmailVerification(request(
      "http://localhost/api/auth/email-verification",
      "PATCH",
      { token: verificationToken, password: newPassword },
    ));
    expect(verifiedAgain.status).toBe(200);
    expect(await verifiedAgain.json()).toEqual({ verified: true, providersDisconnected: 0 });
    expect(await prisma.account.count({ where: { userId: verifiedRecoveryUserId } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: verifiedRecoveryUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 2,
    });
  });

  it("serializes competing mailbox proofs without retaining an untrusted provider", async () => {
    const verificationToken = "ownership-verification-token".padEnd(43, "e");
    const resetToken = "ownership-password-reset-token".padEnd(43, "r");
    const currentPassword = "ownership-race-current-password";
    const resetPassword = "ownership-race-reset-password";
    await prisma.user.create({ data: {
      id: ownershipRaceUserId,
      ...consentData,
      email: "ownership-race@example.com",
      passwordHash: await hashPassword(currentPassword),
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-ownership-race-microsoft",
      } },
      emailVerificationTokens: { create: {
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const outcomes = await Promise.all([
      completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token: verificationToken, password: currentPassword },
      )),
      completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token: resetToken, newPassword: resetPassword },
      )),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(outcomes.every(({ status }) => [200, 400, 409].includes(status))).toBe(true);
    expect(await prisma.account.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ownershipRaceUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 1,
    });
  });

  it("uses one lock order for verification and login-email confirmation", async () => {
    const verificationToken = "proof-lock-verification-token".padEnd(43, "v");
    const emailChangeToken = "proof-lock-email-change-token".padEnd(43, "c");
    const password = "proof-lock-current-password";
    const oldEmail = "proof-lock-old@example.com";
    const newEmail = "proof-lock-new@example.com";
    await prisma.user.create({ data: {
      id: proofLockRaceUserId,
      ...consentData,
      email: oldEmail,
      passwordHash: await hashPassword(password),
      emailVerificationTokens: { create: {
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
      emailChangeTokens: { create: {
        newEmail,
        tokenHash: hashEmailChangeToken(emailChangeToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const outcomes = await Promise.all([
      completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token: verificationToken, password },
      )),
      completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token: emailChangeToken },
      )),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(outcomes.every(({ status }) => [200, 400, 409].includes(status))).toBe(true);
    expect(await prisma.emailVerificationToken.count({ where: { userId: proofLockRaceUserId } })).toBe(0);
    expect(await prisma.emailChangeToken.count({ where: { userId: proofLockRaceUserId } })).toBe(0);
    const secured = await prisma.user.findUniqueOrThrow({ where: { id: proofLockRaceUserId } });
    expect([oldEmail, newEmail]).toContain(secured.email);
    expect(secured).toMatchObject({ emailVerified: expect.any(Date), sessionVersion: 1 });
  });

  it("cannot restore an untrusted provider after mailbox recovery wins", async () => {
    const resetToken = "provider-link-race-reset-token".padEnd(43, "r");
    const nextPassword = "provider-link-race-password";
    await prisma.user.create({ data: {
      id: providerLinkRaceUserId,
      ...consentData,
      email: "provider-link-race@example.com",
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-provider-link-race-microsoft",
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });
    const pendingLink = {
      userId: providerLinkRaceUserId,
      type: "oauth" as const,
      provider: "facebook",
      providerAccountId: "integration-provider-link-race-facebook",
    };

    const [recovery, link] = await Promise.all([
      completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token: resetToken, newPassword: nextPassword },
      )),
      linkProviderAccountSafely(pendingLink, 0).then(
        () => "LINKED" as const,
        () => "REJECTED" as const,
      ),
    ]);
    expect(recovery.status).toBe(200);
    expect(["LINKED", "REJECTED"]).toContain(link);
    expect(await prisma.account.count({ where: { userId: providerLinkRaceUserId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: providerLinkRaceUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 1,
    });
    await expect(linkProviderAccountSafely(pendingLink, 0)).rejects.toThrow();
    expect(await prisma.account.count({ where: { userId: providerLinkRaceUserId } })).toBe(0);
  });

  it("verifies a new login email, handles address races, and revokes old sessions", async () => {
    const oldEmail = "email-change-old@example.com";
    const newEmail = "email-change-new@example.com";
    const password = "email-change-password-123";
    await prisma.user.create({ data: {
      id: emailChangeUserId,
      ...consentData,
      email: oldEmail,
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      learner: { create: {} },
    } });
    const oldCookie = await authCookie(emailChangeUserId);
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const wrongPassword = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail, currentPassword: "wrong-password" },
        oldCookie,
      ));
      expect(wrongPassword.status).toBe(401);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);

      const requested = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail: `  ${newEmail.toUpperCase()}  `, currentPassword: password },
        oldCookie,
      ));
      expect(requested.status).toBe(202);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: emailChangeUserId } })).email).toBe(oldEmail);
      const firstDelivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; text: string };
      expect(firstDelivery.to).toEqual([newEmail]);
      const firstToken = firstDelivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(firstToken).toBeTruthy();
      expect(await prisma.emailChangeToken.findUnique({
        where: { tokenHash: hashEmailChangeToken(firstToken!) },
      })).toMatchObject({ userId: emailChangeUserId, newEmail });

      await prisma.user.create({ data: {
        id: emailChangeConflictUserId,
        email: newEmail,
        emailVerified: new Date(),
      } });
      const conflicted = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token: firstToken },
      ));
      expect(conflicted.status).toBe(409);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);
      await prisma.user.delete({ where: { id: emailChangeConflictUserId } });

      const retried = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail, currentPassword: password },
        oldCookie,
      ));
      expect(retried.status).toBe(202);
      const retryDelivery = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { text: string };
      const token = retryDelivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();

      const completed = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token },
      ));
      expect(completed.status).toBe(200);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: emailChangeUserId } });
      expect(updated).toMatchObject({ email: newEmail, sessionVersion: 1 });
      expect(updated.emailVerified).toBeInstanceOf(Date);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      const notice = JSON.parse(String(emailFetch.mock.calls[2]?.[1]?.body)) as { to: string[]; text: string };
      expect(notice.to).toEqual([oldEmail]);
      expect(notice.text).toContain(newEmail);

      const replay = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token },
      ));
      expect(replay.status).toBe(400);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("requires recent reauthentication for sensitive social-only account actions", async () => {
    const email = "sensitive-social@example.com";
    await prisma.user.create({ data: {
      id: sensitiveUserId,
      ...consentData,
      email,
      learner: { create: {} },
    } });
    const staleCookie = await authCookie(sensitiveUserId, 0, Math.floor(Date.now() / 1000) - 11 * 60);
    const stalePasswordChange = await updateCurrentAccount(request(
      "http://localhost/api/auth/account",
      "PATCH",
      { newPassword: "new-social-password" },
      staleCookie,
    ));
    expect(stalePasswordChange.status).toBe(401);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: sensitiveUserId } })).toMatchObject({ passwordHash: null });

    const staleEmailChange = await requestEmailChange(request(
      "http://localhost/api/auth/email-change",
      "POST",
      { newEmail: "sensitive-social-new@example.com" },
      staleCookie,
    ));
    expect(staleEmailChange.status).toBe(401);
    expect(await prisma.emailChangeToken.count({ where: { userId: sensitiveUserId } })).toBe(0);

    const staleDeletion = await deleteCurrentAccount(request(
      "http://localhost/api/auth/account",
      "DELETE",
      { emailConfirmation: email },
      staleCookie,
    ));
    expect(staleDeletion.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: sensitiveUserId } })).toBeTruthy();

    const recentCookie = await authCookie(sensitiveUserId);
    const deletion = await deleteCurrentAccount(request(
      "http://localhost/api/auth/account",
      "DELETE",
      { emailConfirmation: email },
      recentCookie,
    ));
    expect(deletion.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: sensitiveUserId } })).toBeNull();
  });

  it("returns grades and dimension-aware tags for cascading practice filters", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/catalog?gradeBand=integration-middle&subject=integration-math"));
    expect(response.status).toBe(200);
    const catalog = await response.json() as {
      subjects: Array<{ slug: string; name: string }>;
      gradeBands: Array<{ slug: string; name: string }>;
      grades: Array<{ slug: string; name: string }>;
      topics: Array<{ slug: string; label: string }>;
      tagDimensions: Array<{ key: string; label: string; tags: Array<{ slug: string; label: string }> }>;
    };
    expect(catalog.gradeBands).toContainEqual({ slug: "integration-middle", name: "测试初中" });
    expect(catalog.grades).toEqual([{ slug: "integration-grade-7", name: "测试七年级" }]);
    expect(catalog.subjects).toEqual(expect.arrayContaining([
      { slug: "integration-math", name: "测试数学" },
      { slug: "integration-science", name: "测试科学" },
    ]));
    expect(catalog.topics).toEqual([{ slug: "integration-arithmetic", label: "测试运算" }]);
    expect(catalog.tagDimensions).toContainEqual({
      key: "TOPIC",
      label: "知识主题",
      tags: [{ slug: "integration-arithmetic", label: "测试运算" }],
    });
    expect(catalog.tagDimensions).toContainEqual({
      key: "SKILL",
      label: "能力维度",
      tags: [{ slug: "integration-quantitative", label: "测试计算推理" }],
    });

    const filtered = await nextQuestion(new NextRequest(
      "http://localhost/api/questions/next?subject=integration-math&tags=SKILL%3Aintegration-quantitative",
    ));
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toMatchObject({ id: choiceId });
  });

  it("rejects malformed and unbounded question filters", async () => {
    const unsafeSlug = await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=..%2Fmath", {
      headers: { "x-request-id": "integration-invalid-filters" },
    }));
    expect(unsafeSlug.status).toBe(400);
    expect(await unsafeSlug.json()).toEqual({ error: "Invalid question filters", code: "INVALID_REQUEST" });
    expect(unsafeSlug.headers.get("x-request-id")).toBe("integration-invalid-filters");

    const tooManyExcluded = Array.from({ length: 21 }, (_, index) => `question_${index}`).join(",");
    const oversized = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?exclude=${tooManyExcluded}`));
    expect(oversized.status).toBe(400);
  });

  it("reuses a small filtered pool after recent exclusions exhaust it", async () => {
    const response = await nextQuestion(new NextRequest(
      `http://localhost/api/questions/next?subject=integration-math&autoGradable=true&exclude=${choiceId}`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: choiceId });
  });

  it("loads a targeted published question without exposing its answer", async () => {
    const response = await nextQuestion(new NextRequest(
      `http://localhost/api/questions/next?questionId=${writtenId}&subject=integration-math`,
    ));

    expect(response.status).toBe(200);
    const question = await response.json() as { id: string; answer?: unknown; explanation?: unknown };
    expect(question).toMatchObject({ id: writtenId });
    expect(question).not.toHaveProperty("answer");
    expect(question).not.toHaveProperty("explanation");
  });

  it("grades a guest attempt without creating any learning record", async () => {
    const learnersBefore = await prisma.learnerProfile.count();
    const attemptsBefore = await prisma.practiceAttempt.count();
    const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      attemptId: null,
      isCorrect: true,
      answer: "B",
      earnedXp: 0,
      persisted: false,
    });
    expect(await prisma.learnerProfile.count()).toBe(learnersBefore);
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("rejects empty guest answers without disclosing solutions or writing data", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    for (const responseValue of ["   ", [], [""]]) {
      const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
        questionId: choiceId,
        response: responseValue,
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("answer");
    }
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("requires the response shape and labels shown by the question", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    const invalidInputs = [
      { questionId: choiceId, response: "B" },
      { questionId: choiceId, response: ["Z"] },
      { questionId: writtenId, response: ["A"] },
    ];
    for (const input of invalidInputs) {
      const response = await createAttempt(request("http://localhost/api/attempts", "POST", input));
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("answer");
    }
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("rejects cross-origin mutations before parsing or writing data", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    const response = await createAttempt(new Request("http://localhost/api/attempts", {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: "not-json",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("records concurrent authenticated attempts without losing progress or duplicating badges", async () => {
    await prisma.user.create({ data: {
      id: concurrentUserId,
      ...consentData,
      email: "concurrent@example.com",
      learner: { create: { xp: 100, level: 1 } },
    } });
    const cookie = await authCookie(concurrentUserId);
    const attempts = [
      "b3496bea-4c66-4e2d-a4e5-6496e6126966",
      "ba6839b3-b85a-43f8-95d8-7020a0defaba",
    ].map((clientAttemptId) => createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
      clientAttemptId,
    }, cookie)));

    const responses = await Promise.all(attempts);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: concurrentUserId } });
    const activity = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate: calendarDay(new Date(), "Asia/Shanghai") } },
    });
    expect(learner).toMatchObject({ xp: 120, level: 2, currentStreak: 1, bestStreak: 1 });
    expect(await prisma.practiceAttempt.count({ where: { learnerId: learner.id } })).toBe(2);
    expect(activity).toMatchObject({ attempts: 2, correct: 2, earnedXp: 20 });
    expect(await prisma.learnerBadge.count({
      where: { learnerId: learner.id, badge: { slug: "first-spark" } },
    })).toBe(1);
  });

  it("creates a session, grades a miss, schedules review, saves, reports, and exposes progress", async () => {
    const accountActionExpiry = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: journeyUserId,
      ...consentData,
      email: "journey@example.com",
      emailVerified: new Date(),
      passwordHash: "export-secret-password-hash",
      learner: { create: {} },
      accounts: { create: {
        type: "oauth",
        provider: "google",
        providerAccountId: "journey-google-account",
        access_token: "export-secret-access-token",
        refresh_token: "export-secret-refresh-token",
        id_token: "export-secret-id-token",
      } },
      consentRecords: { create: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
        acceptedAt: consentData.termsAcceptedAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "1a".repeat(32),
        expiresAt: accountActionExpiry,
      } },
      emailChangeTokens: { create: {
        newEmail: "journey-pending@example.com",
        tokenHash: "2b".repeat(32),
        expiresAt: accountActionExpiry,
      } },
      passwordResetTokens: { create: {
        tokenHash: "3c".repeat(32),
        expiresAt: accountActionExpiry,
      } },
      sessions: { create: {
        sessionToken: "export-secret-session-token",
        expires: accountActionExpiry,
      } },
    } });
    const cookie = await authCookie(journeyUserId);
    expect((await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: {} }))).status).toBe(401);
    const sessionResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" } }, cookie));
    expect(sessionResponse.status).toBe(201);
    let session = await sessionResponse.json() as { id: string };
    const resumedResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" } }, cookie));
    expect(resumedResponse.status).toBe(200);
    expect(await resumedResponse.json()).toMatchObject({ id: session.id, resumed: true, completedCount: 0 });

    const restartedResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" }, restart: true }, cookie));
    expect(restartedResponse.status).toBe(201);
    const restarted = await restartedResponse.json() as { id: string; resumed: boolean };
    expect(restarted).toMatchObject({ resumed: false });
    expect(restarted.id).not.toBe(session.id);
    expect(await prisma.practiceSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: "ABANDONED" });
    session = restarted;

    const concurrentRestarts = await Promise.all(Array.from({ length: 3 }, (_, index) => createSession(request(
      "http://localhost/api/sessions",
      "POST",
      { questionGoal: 10, filters: { subject: `integration-math-${index}` }, restart: true },
      cookie,
    ))));
    expect(concurrentRestarts.every((response) => response.ok || response.status === 409)).toBe(true);
    const sessionLearner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    expect(await prisma.practiceSession.count({ where: { learnerId: sessionLearner.id, status: "ACTIVE" } })).toBe(1);
    session = await prisma.practiceSession.findFirstOrThrow({
      where: { learnerId: sessionLearner.id, status: "ACTIVE" },
      select: { id: true },
    });

    const questionResponse = await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&autoGradable=true", { headers: { cookie } }));
    expect(questionResponse.status).toBe(200);
    const question = await questionResponse.json() as { id: string; hasHint: boolean; correctAnswer?: unknown; explanation?: unknown };
    expect(question).toMatchObject({ id: choiceId, hasHint: true });
    expect(question).not.toHaveProperty("correctAnswer");
    expect(question).not.toHaveProperty("explanation");

    const hintResponse = await getQuestionHint(new NextRequest(`http://localhost/api/questions/hint?questionId=${choiceId}`, { headers }));
    expect(hintResponse.status).toBe(200);
    const hint = await hintResponse.json() as { hint: string };
    expect(hint.hint).toContain("逐项排除");
    expect(hint.hint).not.toContain("1 + 1 = 2");

    const attemptInput = { questionId: choiceId, response: ["A"], sessionId: session.id, timeZone: "Asia/Shanghai", clientAttemptId: "4dd94422-4c24-4f39-a5fc-35f494d31ea2" };
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput, cookie));
    expect(attemptResponse.status).toBe(200);
    const attempt = await attemptResponse.json() as { isCorrect: boolean; session: { completedCount: number } };
    expect(attempt).toMatchObject({ isCorrect: false, session: { completedCount: 1 } });
    const replayResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput, cookie));
    expect(await replayResponse.json()).toMatchObject({ replayed: true, totalXp: 2, session: { completedCount: 1 } });
    expect(await prisma.practiceAttempt.count({ where: { clientAttemptId: attemptInput.clientAttemptId } })).toBe(1);

    expect((await saveQuestion(request("http://localhost/api/review", "POST", { questionId: choiceId, saved: true }, cookie))).status).toBe(200);
    const review = await (await getReview(new NextRequest("http://localhost/api/review", { headers: { cookie } }))).json() as {
      dueCount: number;
      savedCount: number;
      reviews: Array<{ id: string; isSaved: boolean }>;
      saved: Array<{ id: string; isInReview: boolean; reviewIsDue: boolean }>;
    };
    expect(review).toMatchObject({
      dueCount: 1,
      savedCount: 1,
      reviews: [expect.objectContaining({ id: choiceId, isSaved: true })],
      saved: [expect.objectContaining({ id: choiceId, isInReview: true, reviewIsDue: true })],
    });
    await prisma.question.update({ where: { id: choiceId }, data: { status: "NEEDS_REVIEW" } });
    try {
      const hidden = await (await getReview(new NextRequest("http://localhost/api/review", { headers: { cookie } }))).json() as {
        dueCount: number; activeCount: number; savedCount: number; reviews: unknown[]; saved: unknown[];
      };
      expect(hidden).toMatchObject({ dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] });
    } finally {
      await prisma.question.update({ where: { id: choiceId }, data: { status: "PUBLISHED" } });
    }
    const adaptiveQuestion = await (await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&mode=review", { headers: { cookie } }))).json() as { id: string; recommendationReason: string };
    expect(adaptiveQuestion).toMatchObject({ id: choiceId, recommendationReason: "复习一题到期的薄弱知识" });

    expect((await createReport(request("http://localhost/api/reports", "POST", { questionId: choiceId, category: "UNCLEAR" }, cookie))).status).toBe(201);
    const progress = await (await getProgress(new NextRequest("http://localhost/api/learner/progress?timeZone=Asia%2FShanghai", { headers: { cookie } }))).json() as { summary: { totalAttempts: number; xp: number }; recentMistakes: unknown[] };
    expect(progress.summary).toMatchObject({ totalAttempts: 1, xp: 2 });
    expect(progress.recentMistakes).toHaveLength(1);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    const futureDueAt = new Date(Date.now() + 86_400_000);
    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: futureDueAt } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 0, consecutiveCorrect: 0, dueAt: futureDueAt });

    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: new Date(Date.now() - 1_000) } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 1, consecutiveCorrect: 1 });

    const updatedProgress = await (await getProgress(new NextRequest("http://localhost/api/learner/progress?timeZone=Asia%2FShanghai", { headers: { cookie } }))).json() as { weakTopics: Array<{ slug: string; subject: string }> };
    expect(updatedProgress.weakTopics).toContainEqual(expect.objectContaining({ slug: "integration-arithmetic", subject: "integration-math" }));
    const topicAdaptive = await (await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&mode=adaptive", { headers: { cookie } }))).json() as { id: string; recommendationReason: string };
    expect(topicAdaptive).toMatchObject({
      id: choiceId,
      recommendationReason: "结合最近正确率和答题用时，重点巩固测试运算",
    });

    const dismissed = await dismissReview(request("http://localhost/api/review", "PATCH", {
      questionId: choiceId,
      action: "DISMISS",
    }, cookie));
    expect(dismissed.status).toBe(200);
    expect(await prisma.reviewItem.findUniqueOrThrow({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } },
    })).toMatchObject({ status: "DISMISSED" });

    await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["A"],
      timeZone: "Asia/Shanghai",
    }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } },
    })).toMatchObject({ status: "ACTIVE", lastResult: false });

    const health = await getHealth(new Request("http://localhost/api/health", { headers }));
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();
    expect(await health.json()).toMatchObject({
      status: "ok",
      database: "ready",
      schema: { status: "ready", requiredMigration: REQUIRED_DATABASE_MIGRATION },
      catalog: { subjects: expect.any(Number), questions: expect.any(Number) },
    });
  });

  it("protects the content report queue and records operator review actions", async () => {
    const reporterUser = await prisma.user.create({ data: {
      id: studioReporterId,
      ...consentData,
      email: "studio-reporter@example.com",
      learner: { create: {} },
    } });
    const reporter = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: reporterUser.id } });
    const reporterCookie = await authCookie(studioReporterId);
    await prisma.questionReport.create({ data: {
      id: studioReportId,
      learnerId: reporter.id,
      questionId: choiceId,
      category: "WRONG_ANSWER",
      detail: "测试报告详情",
    } });
    const missedAttemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["A"],
      timeZone: "Asia/Shanghai",
    }, reporterCookie));
    const missedAttempt = await missedAttemptResponse.json() as { attemptId: string; isCorrect: boolean };
    expect(missedAttempt.isCorrect).toBe(false);
    expect((await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }))).status).toBe(401);
    const explanationView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }, reporterCookie));
    expect(await explanationView.json()).toMatchObject({ recorded: true });
    const replayedView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }, reporterCookie));
    expect(await replayedView.json()).toMatchObject({ recorded: false });
    await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
    }, reporterCookie));
    await prisma.user.createMany({ data: [
      { ...consentData, id: studioOperatorId, email: "studio-operator@example.com", passwordHash: "unused", role: "CONTENT_EDITOR" },
      { ...consentData, id: studioLearnerId, email: "studio-learner@example.com", passwordHash: "unused", role: "LEARNER" },
    ] });
    const operatorCookie = await authCookie(studioOperatorId);
    const staleOperatorCookie = await authCookie(
      studioOperatorId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const learnerCookie = await authCookie(studioLearnerId);

    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports"))).status).toBe(401);
    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports", {
      headers: { cookie: learnerCookie },
    }))).status).toBe(403);

    const staleOperatorHeaders = { ...headers, cookie: staleOperatorCookie };
    const staleQueue = await getStudioReports(new NextRequest(
      "http://localhost/api/studio/reports?status=OPEN",
      { headers: staleOperatorHeaders },
    ));
    expect(staleQueue.status).toBe(401);
    expect(await staleQueue.json()).toEqual({
      error: "查看答案、学习指标或执行审核操作前，请重新登录验证内容审核账号。",
      code: "UNAUTHORIZED",
    });
    expect((await getStudioMetrics(new Request("http://localhost/api/studio/metrics", {
      headers: staleOperatorHeaders,
    }))).status).toBe(401);
    expect((await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
      method: "PATCH",
      headers: staleOperatorHeaders,
      body: JSON.stringify({
        reportId: studioReportId,
        action: "QUARANTINE",
        note: "过期会话不得改变题目状态",
      }),
    }))).status).toBe(401);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: choiceId } })).toMatchObject({
      status: "PUBLISHED",
    });
    expect(await prisma.contentReviewAction.count({ where: { reportId: studioReportId } })).toBe(0);

    const operatorHeaders = { ...headers, cookie: operatorCookie };
    const queueResponse = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=OPEN", { headers: operatorHeaders }));
    expect(queueResponse.status).toBe(200);
    const queue = await queueResponse.json() as { reports: Array<Record<string, unknown>>; counts: { open: number } };
    expect(queue.reports).toContainEqual(expect.objectContaining({ id: studioReportId, detail: "测试报告详情" }));
    expect(JSON.stringify(queue)).not.toContain(studioReporterId);
    expect(JSON.stringify(queue.reports.find(({ id }) => id === studioReportId))).not.toContain("learnerId");

    const metricsResponse = await getStudioMetrics(new Request("http://localhost/api/studio/metrics", { headers: operatorHeaders }));
    expect(metricsResponse.status).toBe(200);
    const metrics = await metricsResponse.json() as {
      explanations: { eligibleMisses: number; viewed: number; viewRate: number };
      repeatPractice: { learnerTopicPairs: number };
    };
    expect(metrics.explanations).toMatchObject({ eligibleMisses: expect.any(Number), viewed: expect.any(Number), viewRate: expect.any(Number) });
    expect(metrics.explanations.eligibleMisses).toBeGreaterThanOrEqual(1);
    expect(metrics.explanations.viewed).toBeGreaterThanOrEqual(1);
    expect(metrics.repeatPractice.learnerTopicPairs).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(metrics)).not.toContain("learnerId");

    const invalidResolution = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
      method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "RESOLVE" }),
    }));
    expect(invalidResolution.status).toBe(400);

    try {
      const quarantine = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "QUARANTINE", note: "等待核对原始答案" }),
      }));
      expect(quarantine.status).toBe(200);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: choiceId } })).toMatchObject({ status: "NEEDS_REVIEW" });
      expect((await nextQuestion(new NextRequest(`http://localhost/api/questions/next?questionId=${choiceId}`))).status).toBe(404);

      const resolved = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "RESOLVE", note: "已依据源文件核对并登记修复" }),
      }));
      expect(resolved.status).toBe(200);
      expect(await resolved.json()).toMatchObject({ report: { id: studioReportId, status: "RESOLVED" } });

      const resolvedQueue = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=RESOLVED", { headers: operatorHeaders }));
      const resolvedBody = await resolvedQueue.json() as { reports: Array<{ id: string; reviewActions: Array<{ action: string; actor: { email: string } | null }> }> };
      const reviewed = resolvedBody.reports.find(({ id }) => id === studioReportId);
      expect(reviewed?.reviewActions.map(({ action }) => action)).toEqual(["RESOLVE", "QUARANTINE"]);
      expect(reviewed?.reviewActions[0].actor?.email).toBe("studio-operator@example.com");

      expect((await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "REOPEN", note: "需要补充复核" }),
      }))).status).toBe(200);
      expect(await prisma.questionReport.findUniqueOrThrow({ where: { id: studioReportId } })).toMatchObject({ status: "OPEN", resolvedAt: null });

      const operatorExportResponse = await exportLearner(new NextRequest("http://localhost/api/learner/export", {
        headers: operatorHeaders,
      }));
      expect(operatorExportResponse.status).toBe(200);
      const operatorExport = await operatorExportResponse.json() as {
        account: {
          email: string;
          contentReviewActions: Array<{ action: string; note: string; report: { question: { sourceId: string } } }>;
        };
        learner: null;
      };
      expect(operatorExport.account.email).toBe("studio-operator@example.com");
      expect(operatorExport.account.contentReviewActions).toHaveLength(3);
      expect(operatorExport.account.contentReviewActions).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "QUARANTINE", note: "等待核对原始答案" }),
        expect.objectContaining({ action: "RESOLVE", note: "已依据源文件核对并登记修复" }),
        expect.objectContaining({ action: "REOPEN", note: "需要补充复核" }),
      ]));
      expect(operatorExport.account.contentReviewActions[0]?.report.question.sourceId).toBe(choiceId);
      expect(operatorExport.learner).toBeNull();
      expect(JSON.stringify(operatorExport)).not.toContain(studioReporterId);
    } finally {
      await prisma.question.update({ where: { id: choiceId }, data: { status: "PUBLISHED" } });
    }
  });

  it("requires explicit self-assessment, protects account export, and supports data deletion", async () => {
    const cookie = await authCookie(journeyUserId);
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: writtenId, response: "测试思路", timeZone: "Asia/Shanghai" }, cookie));
    const attempt = await attemptResponse.json() as { attemptId: string; isCorrect: boolean | null };
    expect(attempt.isCorrect).toBeNull();

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    const staleCookie = await authCookie(
      journeyUserId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const storedBeforeStaleExport = await prisma.user.findUniqueOrThrow({
      where: { id: journeyUserId },
      select: {
        updatedAt: true,
        learner: { select: { id: true, updatedAt: true } },
      },
    });
    const rateLimitBucketsBeforeStaleExport = await prisma.rateLimitBucket.count();
    const staleExportResponse = await exportLearner(new NextRequest(
      "http://localhost/api/learner/export",
      { headers: { ...headers, cookie: staleCookie } },
    ));
    expect(staleExportResponse.status).toBe(401);
    expect(await staleExportResponse.json()).toEqual({
      error: "导出账号数据前请重新登录，以确认这是你的账号。",
      code: "UNAUTHORIZED",
    });
    const staleDeleteResponse = await deleteLearner(new NextRequest(
      "http://localhost/api/learner",
      { method: "DELETE", headers: { ...headers, cookie: staleCookie } },
    ));
    expect(staleDeleteResponse.status).toBe(401);
    expect(await staleDeleteResponse.json()).toEqual({
      error: "删除学习数据前请重新登录，以确认这是你的账号。",
      code: "UNAUTHORIZED",
    });
    expect(await prisma.user.findUniqueOrThrow({
      where: { id: journeyUserId },
      select: {
        updatedAt: true,
        learner: { select: { id: true, updatedAt: true } },
      },
    })).toEqual(storedBeforeStaleExport);
    expect(await prisma.rateLimitBucket.count()).toBe(rateLimitBucketsBeforeStaleExport);

    const activityDate = calendarDay(new Date(), "Asia/Shanghai");
    const before = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    const assessmentInput = { attemptId: attempt.attemptId, isCorrect: true, timeZone: "Asia/Shanghai" };
    const assessmentResponses = await Promise.all([
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput, cookie)),
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput, cookie)),
    ]);
    expect(assessmentResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await assessmentResponses[0].json()).toMatchObject(
      assessmentResponses[0].status === 200 ? { isCorrect: true } : { error: "Attempt already assessed" },
    );
    const after = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    expect(after.correct).toBe(before.correct + 1);

    await prisma.practiceAttempt.createMany({
      data: Array.from({ length: 251 }, (_, index) => ({
        id: `integration-export-attempt-${String(index).padStart(3, "0")}`,
        learnerId: learner.id,
        questionId: choiceId,
        response: "[\"B\"]",
        isCorrect: true,
        earnedXp: 10,
      })),
    });

    const exportResponse = await exportLearner(new NextRequest("http://localhost/api/learner/export", { headers: { ...headers, cookie } }));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-disposition")).toContain("eduloop-account-data-");
    const exported = await exportResponse.json() as {
      format: string;
      version: number;
      account: {
        email: string;
        hasPassword: boolean;
        linkedProviders: Array<{ provider: string; providerAccountId: string }>;
        consentHistory: Array<{ basis: string; method: string }>;
        pendingAccountActions: {
          emailVerifications: unknown[];
          emailChanges: Array<{ newEmail: string }>;
          passwordResets: unknown[];
        };
        sessionRecords: Array<{ expires: string }>;
        contentReviewActions: unknown[];
      };
      learner: { attempts: unknown[]; id?: string };
    };
    expect(exported).toMatchObject({
      format: "EduLoop account export",
      version: 2,
      account: {
        email: "journey@example.com",
        hasPassword: true,
        linkedProviders: [{ provider: "google", providerAccountId: "journey-google-account" }],
        consentHistory: [{ basis: "ADULT", method: "PASSWORD_REGISTRATION" }],
        pendingAccountActions: {
          emailVerifications: [expect.any(Object)],
          emailChanges: [{ newEmail: "journey-pending@example.com" }],
          passwordResets: [expect.any(Object)],
        },
        sessionRecords: [{ expires: expect.any(String) }],
        contentReviewActions: [],
      },
    });
    expect(exported.learner.attempts.length).toBeGreaterThanOrEqual(252);
    expect(exported.learner).not.toHaveProperty("id");
    const serializedExport = JSON.stringify(exported);
    expect(serializedExport).not.toContain("export-secret-password-hash");
    expect(serializedExport).not.toContain("export-secret-access-token");
    expect(serializedExport).not.toContain("export-secret-refresh-token");
    expect(serializedExport).not.toContain("export-secret-id-token");
    expect(serializedExport).not.toContain("export-secret-session-token");
    expect(serializedExport).not.toContain("tokenHash");
    expect(serializedExport).not.toContain("sessionVersion");

    const deleteResponse = await deleteLearner(new NextRequest("http://localhost/api/learner", { method: "DELETE", headers: { ...headers, cookie } }));
    expect(await deleteResponse.json()).toEqual({ deleted: true });
    expect(await prisma.learnerProfile.findUnique({ where: { userId: journeyUserId } })).toBeNull();
  });
});
