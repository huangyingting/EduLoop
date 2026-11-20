import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as acceptLegalConsent } from "@/app/api/auth/consent/route";
import { DELETE as deleteLearner, GET as getLearner } from "@/app/api/learner/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as exportLearner } from "@/app/api/learner/export/route";
import { GET as getLearnerProfile, PATCH as updateLearnerProfile } from "@/app/api/learner/profile/route";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { calendarDay, calendarDaysBefore } from "@/lib/dates";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { choiceId, headers, authUserId, consentUserId, shieldUserId, profileUserId, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("learner profile, consent, and sessions", () => {
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
});
