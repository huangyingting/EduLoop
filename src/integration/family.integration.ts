import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { POST as selectLearner } from "@/app/api/family/active/route";
import { DELETE as removeChild, GET as getFamily, POST as addChild } from "@/app/api/family/route";
import { DELETE as deleteLearningData } from "@/app/api/learner/route";
import { GET as exportAccount } from "@/app/api/learner/export/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { ACTIVE_LEARNER_COOKIE } from "@/lib/family";
import { prisma } from "@/lib/prisma";
import {
  authCookie,
  createCatalogFixture,
  createChoiceQuestion,
  createConsentingUser,
  integrationHeaders,
  jsonRequest,
  type CatalogFixture,
} from "./fixtures";

const prefix = "family-flow";
const guardianId = `${prefix}-guardian`;
const otherId = `${prefix}-other`;
let catalog: CatalogFixture;
let questionId = "";

function getRequest(url: string, cookie: string) {
  return new NextRequest(url, { headers: { ...integrationHeaders, cookie } });
}

async function withChild(cookie: string, childId: string) {
  return `${cookie}; ${ACTIVE_LEARNER_COOKIE}=${childId}`;
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  questionId = (await createChoiceQuestion(catalog, `${prefix}-question`)).id;
  await createConsentingUser(guardianId);
  await createConsentingUser(otherId);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [guardianId, otherId] } } });
  await catalog.cleanup();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("guardian-managed child profiles", () => {
  let childId = "";

  it("creates a child profile only with a guardian attestation and records that consent", async () => {
    const cookie = await authCookie(guardianId);
    const missing = await addChild(jsonRequest("http://localhost/api/family", "POST", { displayName: "小明", knowledgeBand: null }, cookie));
    expect(missing.status).toBe(400);
    const created = await addChild(jsonRequest("http://localhost/api/family", "POST", { displayName: "小明", knowledgeBand: null, guardianAttestation: true }, cookie));
    expect(created.status).toBe(201);
    childId = (await created.json()).id;
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { id: childId } })).toMatchObject({ userId: null, guardianUserId: guardianId });
    expect(await prisma.consentRecord.findFirstOrThrow({ where: { userId: guardianId, subjectLearnerId: childId } }))
      .toMatchObject({ basis: "GUARDIAN", method: "CHILD_PROFILE" });
    const family = await (await getFamily(getRequest("http://localhost/api/family", cookie))).json();
    expect(family.children).toEqual([expect.objectContaining({ id: childId, displayName: "小明", xp: 0 })]);
  });

  it("enforces a single owner per profile in the database", async () => {
    await expect(prisma.learnerProfile.create({ data: { userId: otherId, guardianUserId: guardianId } })).rejects.toThrow();
  });

  it("records practice for the selected child and keeps it away from other accounts", async () => {
    const cookie = await authCookie(guardianId);
    const selected = await selectLearner(jsonRequest("http://localhost/api/family/active", "POST", { learnerId: childId }, cookie));
    expect(selected.headers.get("set-cookie")).toContain(`${ACTIVE_LEARNER_COOKIE}=${childId}`);

    const asChild = await withChild(cookie, childId);
    const attempt = await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
      questionId, response: ["B"], clientAttemptId: crypto.randomUUID(),
    }, asChild));
    expect(attempt.status).toBe(200);
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { id: childId } })).toMatchObject({ totalAttempts: 1 });
    expect(await prisma.learnerProfile.findUnique({ where: { userId: guardianId } })).toMatchObject({ totalAttempts: 0 });
    const progress = await (await getProgress(getRequest("http://localhost/api/learner/progress", asChild))).json();
    expect(progress.summary.totalAttempts).toBe(1);

    const otherCookie = await authCookie(otherId);
    expect((await selectLearner(jsonRequest("http://localhost/api/family/active", "POST", { learnerId: childId }, otherCookie))).status).toBe(404);
    // A forged selection cookie is ignored: the other account sees only itself.
    const forged = await (await getProgress(getRequest("http://localhost/api/learner/progress", await withChild(otherCookie, childId)))).json();
    expect(forged.summary.totalAttempts).toBe(0);
    expect((await removeChild(jsonRequest("http://localhost/api/family", "DELETE", { learnerId: childId }, otherCookie))).status).toBe(404);
  });

  it("includes child profiles in the account export", async () => {
    const cookie = await authCookie(guardianId);
    const response = await exportAccount(getRequest("http://localhost/api/learner/export", cookie));
    const exported = JSON.parse(await response.text());
    expect(exported.childLearners).toEqual([expect.objectContaining({ displayName: "小明", totalAttempts: 1, attempts: [expect.objectContaining({ isCorrect: true })] })]);
  });

  it("removes child profiles with recent login only, and with learning-data erasure", async () => {
    const stale = await authCookie(guardianId, 0, Math.floor(Date.now() / 1000) - 3600);
    expect((await removeChild(jsonRequest("http://localhost/api/family", "DELETE", { learnerId: childId }, stale))).status).toBe(401);

    const cookie = await authCookie(guardianId);
    const second = await (await addChild(jsonRequest("http://localhost/api/family", "POST", { displayName: "小红", knowledgeBand: null, guardianAttestation: true }, cookie))).json();
    expect((await removeChild(jsonRequest("http://localhost/api/family", "DELETE", { learnerId: second.id }, cookie))).status).toBe(200);
    expect(await prisma.learnerProfile.findUnique({ where: { id: second.id } })).toBeNull();

    const erased = await deleteLearningData(new NextRequest("http://localhost/api/learner", { method: "DELETE", headers: { ...integrationHeaders, cookie } }));
    expect(await erased.json()).toEqual({ deleted: true });
    expect(await prisma.learnerProfile.count({ where: { guardianUserId: guardianId } })).toBe(0);
    expect(await prisma.practiceAttempt.count({ where: { learnerId: childId } })).toBe(0);
  });
});
