import { encode } from "next-auth/jwt";
import { AUTH_SECRET_VALUE, AUTH_SESSION_COOKIE } from "@/lib/auth";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";

// Shared helpers for integration suites. Each suite owns uniquely named
// fixtures and removes them in afterAll, because files share one database.

export const integrationHeaders = { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" };

export const currentConsent = {
  termsAcceptedAt: new Date("2026-07-31T00:00:00.000Z"),
  termsVersion: TERMS_VERSION,
  privacyAcceptedAt: new Date("2026-07-31T00:00:00.000Z"),
  privacyVersion: PRIVACY_VERSION,
  consentBasis: "ADULT",
} as const;

export function jsonRequest(url: string, method: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { ...integrationHeaders, ...headers, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function authCookie(userId: string, sessionVersion = 0, issuedAt?: number) {
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

export type CatalogFixture = {
  subjectId: string;
  gradeBandId: string;
  gradeId: string;
  topicDimensionId: string;
  cleanup: () => Promise<void>;
};

// Creates an isolated subject/grade/topic-dimension set. Questions created with
// these IDs are removed by cleanup together with the catalog rows.
export async function createCatalogFixture(prefix: string): Promise<CatalogFixture> {
  const subject = await prisma.subject.create({ data: { slug: `${prefix}-subject`, name: `${prefix} 学科`, icon: "∑", color: "#6c5ce7" } });
  const band = await prisma.gradeBand.create({ data: { slug: `${prefix}-band`, name: `${prefix} 学段` } });
  const grade = await prisma.grade.create({ data: { slug: `${prefix}-grade`, name: `${prefix} 年级`, sortOrder: 7, gradeBandId: band.id } });
  const existingTopic = await prisma.tagDimension.findUnique({ where: { key: "TOPIC" } });
  const topic = existingTopic ?? await prisma.tagDimension.create({ data: { key: "TOPIC", label: "知识主题" } });
  return {
    subjectId: subject.id,
    gradeBandId: band.id,
    gradeId: grade.id,
    topicDimensionId: topic.id,
    async cleanup() {
      await prisma.question.deleteMany({ where: { subjectId: subject.id } });
      await prisma.tag.deleteMany({ where: { slug: { startsWith: `${prefix}-` } } });
      if (!existingTopic) await prisma.tagDimension.deleteMany({ where: { id: topic.id, tags: { none: {} } } });
      await prisma.grade.deleteMany({ where: { id: grade.id } });
      await prisma.gradeBand.deleteMany({ where: { id: band.id } });
      await prisma.subject.deleteMany({ where: { id: subject.id } });
    },
  };
}

export async function createChoiceQuestion(
  catalog: CatalogFixture,
  id: string,
  overrides: { difficulty?: string; correct?: string; randomKey?: number; tagIds?: string[] } = {},
) {
  return prisma.question.create({ data: {
    id, sourceId: id, sourceFile: "integration.json", sourceType: "单选题", type: "SINGLE_CHOICE",
    difficulty: overrides.difficulty ?? "EASY", stem: `${id}：1 + 1 等于？`, answer: overrides.correct ?? "B",
    correctAnswer: JSON.stringify([overrides.correct ?? "B"]), explanation: "1 + 1 = 2。",
    status: "PUBLISHED", isAutoGradable: true, optionSplit: true,
    randomKey: overrides.randomKey ?? Math.random(),
    subjectId: catalog.subjectId, gradeBandId: catalog.gradeBandId, gradeId: catalog.gradeId,
    options: { create: [{ label: "A", content: "1", sortOrder: 0 }, { label: "B", content: "2", sortOrder: 1 }] },
    ...(overrides.tagIds?.length ? { tags: { create: overrides.tagIds.map((tagId) => ({ tagId })) } } : {}),
  } });
}

export async function createConsentingUser(id: string, withLearner = true) {
  return prisma.user.create({ data: {
    id,
    email: `${id}@example.com`,
    emailVerified: new Date(),
    ...currentConsent,
    ...(withLearner ? { learner: { create: {} } } : {}),
  } });
}
