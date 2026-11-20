// Shared fixtures for the API integration suites (api-*.integration.ts).
import { afterAll, beforeAll, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { revokeAccountSessions } from "@/lib/account";
import { currentConsent, integrationHeaders } from "./fixtures";

export { authCookie } from "./fixtures";

export const subjectId = "integration-subject";
export const bandId = "integration-band";
export const gradeId = "integration-grade";
export const choiceId = "integration-choice-question";
export const writtenId = "integration-written-question";
export const studioQuestionId = "integration-studio-question";
export const scienceSubjectId = "integration-science-subject";
export const scienceQuestionId = "integration-science-question";
export const topicDimensionId = "integration-topic-dimension";
export const skillDimensionId = "integration-skill-dimension";
export const mathTopicId = "integration-math-topic";
export const scienceTopicId = "integration-science-topic";
export const mathSkillId = "integration-math-skill";
export const headers = integrationHeaders;
export const authUserId = "integration-auth-user";
export const lifecycleUserId = "integration-lifecycle-user";
export const socialPasswordUserId = "integration-social-password-user";
export const sessionRevocationUserId = "integration-session-revocation-user";
export const expiredRetentionUserId = "integration-expired-retention-user";
export const activeRetentionUserId = "integration-active-retention-user";
export const staleRegistrationUserIds = [
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
export const deletionRaceUserId = "integration-deletion-race-user";
export const reportErasureUserIds = [
  "integration-report-erasure-learning-user",
  "integration-report-erasure-account-user",
] as const;
export const reportErasureQuestionIds = [
  "integration-report-erasure-learning-question",
  "integration-report-erasure-account-question",
] as const;
export const reportErasureReportIds = [
  "integration-report-erasure-learning-report",
  "integration-report-erasure-account-report",
] as const;
export const sensitiveUserId = "integration-sensitive-user";
export const providerUserId = "integration-provider-user";
export const providerMinimizationUserId = "integration-provider-minimization-user";
export const providerSocialUserId = "integration-provider-social-user";
export const providerRaceUserId = "integration-provider-race-user";
export const passwordResetUserId = "integration-password-reset-user";
export const socialRecoveryUserId = "integration-social-recovery-user";
export const verifiedRecoveryUserId = "integration-verified-recovery-user";
export const ownershipRaceUserId = "integration-ownership-race-user";
export const proofLockRaceUserId = "integration-proof-lock-race-user";
export const providerLinkRaceUserId = "integration-provider-link-race-user";
export const providerLoginSnapshotUserId = "integration-provider-login-snapshot-user";
export const emailChangeUserId = "integration-email-change-user";
export const emailChangeConflictUserId = "integration-email-change-conflict-user";
export const emailChangeIssuanceRaceUserId = "integration-email-change-issuance-race-user";
export const deliveryVerificationUserId = "integration-delivery-verification-user";
export const deliveryResetUserId = "integration-delivery-reset-user";
export const deliveryChangeUserId = "integration-delivery-change-user";
export const passwordUpgradeRaceUserId = "integration-password-upgrade-race-user";
export const staleCredentialsLoginUserId = "integration-stale-credentials-login-user";
export const sensitiveMutationRaceUserId = "integration-sensitive-mutation-race-user";
export const sensitiveMutationRaceReportId = "integration-sensitive-mutation-race-report";
export const consentUserId = "integration-consent-user";
export const authJsEmail = "authjs-flow@example.com";
export const expiredRegistrationEmail = "expired-registration-retry@example.com";
export const shieldUserId = "integration-shield-user";
export const concurrentUserId = "integration-concurrent-user";
export const journeyUserId = "integration-journey-user";
export const profileUserId = "integration-profile-user";
export const studioOperatorId = "integration-studio-operator";
export const studioLearnerId = "integration-studio-learner";
export const studioReporterId = "integration-studio-reporter";
export const studioReportId = "integration-studio-report";
export const studioRaceOperatorId = "integration-studio-race-operator";
export const studioRaceReporterId = "integration-studio-race-reporter";
export const studioRaceReportIds = ["integration-studio-race-report-a", "integration-studio-race-report-b"] as const;
export const journeyAccountActionDeliveredAt = new Date("2026-07-31T01:00:00.000Z");
export const consentData = currentConsent;

export function request(url: string, method: string, body: unknown, cookie?: string) {
  return new Request(url, { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

export function responseCookie(response: Response, name: string) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${name.replace(".", "\\.")}=([^;,]+)`));
  return match ? `${name}=${match[1]}` : null;
}


export async function revokeAfterNextUserLookup<T>(
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

// Every split API suite creates the same catalog rows and removes them, with
// every user these suites create, when the file finishes.
export function registerApiFixtures() {
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
    await prisma.badge.create({ data: { id: "integration-badge", slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1, rule: "{\"type\":\"TOTAL_ATTEMPTS\",\"threshold\":1}" } });
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
      authUserId, lifecycleUserId, socialPasswordUserId, sessionRevocationUserId, expiredRetentionUserId, activeRetentionUserId, deletionRaceUserId, ...reportErasureUserIds, sensitiveUserId, sensitiveMutationRaceUserId, providerUserId, providerMinimizationUserId, providerSocialUserId, providerRaceUserId, passwordResetUserId, socialRecoveryUserId, verifiedRecoveryUserId, ownershipRaceUserId, proofLockRaceUserId, providerLinkRaceUserId, providerLoginSnapshotUserId, emailChangeUserId, emailChangeConflictUserId, emailChangeIssuanceRaceUserId, deliveryVerificationUserId, deliveryResetUserId, deliveryChangeUserId, passwordUpgradeRaceUserId, staleCredentialsLoginUserId, consentUserId, shieldUserId, concurrentUserId, journeyUserId, profileUserId,
      studioOperatorId, studioLearnerId, studioReporterId, studioRaceOperatorId, studioRaceReporterId,
      ...staleRegistrationUserIds,
    ] } } });
    await prisma.question.deleteMany({ where: { id: { in: [choiceId, writtenId, studioQuestionId, scienceQuestionId, ...reportErasureQuestionIds] } } });
    await prisma.badge.deleteMany({ where: { id: "integration-badge" } });
    await prisma.tag.deleteMany({ where: { id: { in: [mathTopicId, scienceTopicId, mathSkillId] } } });
    await prisma.tagDimension.deleteMany({ where: { id: { in: [topicDimensionId, skillDimensionId] } } });
    await prisma.grade.deleteMany({ where: { id: gradeId } });
    await prisma.gradeBand.deleteMany({ where: { id: bandId } });
    await prisma.subject.deleteMany({ where: { id: { in: [subjectId, scienceSubjectId] } } });
    await prisma.$disconnect();
  });
}
