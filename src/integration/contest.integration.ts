import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listContests } from "@/app/api/contests/route";
import { GET as getContestSession, PATCH as saveContestAnswers } from "@/app/api/contests/session/route";
import { POST as startContest } from "@/app/api/contests/start/route";
import { POST as submitContest } from "@/app/api/contests/submit/route";
import { invalidateCatalogCache } from "@/lib/catalog-cache";
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

const prefix = "contest-flow";
const userId = `${prefix}-learner`;
const paperKey = "2099-amc-10a";
const otherPaperKey = "2099-amc-10b";
let catalog: CatalogFixture;

function getRequest(url: string, cookie: string) {
  return new NextRequest(url, { headers: { ...integrationHeaders, cookie } });
}

async function createPaper(key: string, correctAnswers: string[]) {
  await prisma.contestPaper.create({ data: {
    key, year: 2099, contest: key.endsWith("a") ? "AMC 10A" : "AMC 10B", level: "AMC-10",
    questionCount: correctAnswers.length, durationMinutes: 75,
  } });
  for (const [index, correct] of correctAnswers.entries()) {
    const id = `${prefix}-${key}-${index + 1}`;
    await createChoiceQuestion(catalog, id, { correct });
    await prisma.contestPaperSlot.create({ data: { paperKey: key, problemNumber: index + 1, questionId: id } });
  }
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  await createPaper(paperKey, ["B", "B", "B"]);
  await createPaper(otherPaperKey, ["A", "B"]);
  await createConsentingUser(userId);
  invalidateCatalogCache();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.contestPaper.deleteMany({ where: { key: { in: [paperKey, otherPaperKey] } } });
  await catalog.cleanup();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("AMC contest mode", () => {
  let sessionId = "";

  it("lists complete papers and starts one timed session without revealing answers", async () => {
    const cookie = await authCookie(userId);
    const list = await (await listContests(getRequest("http://localhost/api/contests?level=AMC-10", cookie))).json();
    expect(list.papers).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: paperKey, available: true, bestScore: null, attempts: 0, durationMinutes: 75 }),
    ]));
    expect(list.activeSession).toBeNull();

    const started = await startContest(jsonRequest("http://localhost/api/contests/start", "POST", { paperKey }, cookie));
    expect(started.status).toBe(201);
    const view = await started.json();
    sessionId = view.id;
    expect(view.questions.map(({ number }: { number: number }) => number)).toEqual([1, 2, 3]);
    expect(JSON.stringify(view)).not.toMatch(/correctAnswer|"answer"|explanation/);
    expect(new Date(view.deadlineAt).getTime() - new Date(view.startedAt).getTime()).toBeGreaterThan(74 * 60_000);

    const resumed = await startContest(jsonRequest("http://localhost/api/contests/start", "POST", { paperKey }, cookie));
    expect(resumed.status).toBe(200);
    expect((await resumed.json()).id).toBe(sessionId);
    const other = await startContest(jsonRequest("http://localhost/api/contests/start", "POST", { paperKey: otherPaperKey }, cookie));
    expect(other.status).toBe(409);
    expect((await other.json()).details).toEqual({ sessionId, paperKey });
  });

  it("autosaves answers, scores with AMC rules, and records each answered problem once", async () => {
    const cookie = await authCookie(userId);
    const saved = await saveContestAnswers(jsonRequest("http://localhost/api/contests/session", "PATCH", {
      sessionId, answers: { 1: "B", 2: "A", 3: "C" },
    }, cookie));
    expect(await saved.json()).toEqual({ answers: { 1: "B", 2: "A", 3: "C" } });
    await saveContestAnswers(jsonRequest("http://localhost/api/contests/session", "PATCH", { sessionId, answers: { 3: null } }, cookie));

    const submitted = await submitContest(jsonRequest("http://localhost/api/contests/submit", "POST", { sessionId }, cookie));
    expect(submitted.status).toBe(200);
    const result = await submitted.json();
    expect(result).toMatchObject({ status: "SUBMITTED", score: 7.5, maxScore: 18, correct: 1, wrong: 1, blank: 1 });
    expect(result.problems.map(({ isCorrect }: { isCorrect: boolean | null }) => isCorrect)).toEqual([true, false, null]);
    expect(result.problems[1]).toMatchObject({ response: "A", correctLabels: ["B"] });

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } });
    expect(await prisma.practiceAttempt.count({ where: { contestSessionId: sessionId } })).toBe(2);
    expect(await prisma.reviewItem.count({ where: { learnerId: learner.id, questionId: `${prefix}-${paperKey}-2` } })).toBe(1);

    const again = await submitContest(jsonRequest("http://localhost/api/contests/submit", "POST", { sessionId }, cookie));
    expect((await again.json()).score).toBe(7.5);
    expect(await prisma.practiceAttempt.count({ where: { contestSessionId: sessionId } })).toBe(2);

    const view = await getContestSession(getRequest(`http://localhost/api/contests/session?id=${sessionId}`, cookie));
    expect(await view.json()).toMatchObject({ status: "SUBMITTED", score: 7.5 });
    const list = await (await listContests(getRequest("http://localhost/api/contests?level=AMC-10", cookie))).json();
    expect(list.papers.find(({ key }: { key: string }) => key === paperKey)).toMatchObject({ bestScore: 7.5, attempts: 1 });
    expect(list.activeSession).toBeNull();
  });

  it("closes answers after the deadline and grades an expired paper before starting another", async () => {
    const cookie = await authCookie(userId);
    const started = await (await startContest(jsonRequest("http://localhost/api/contests/start", "POST", { paperKey: otherPaperKey }, cookie))).json();
    await saveContestAnswers(jsonRequest("http://localhost/api/contests/session", "PATCH", { sessionId: started.id, answers: { 1: "A" } }, cookie));
    await prisma.contestSession.update({ where: { id: started.id }, data: { deadlineAt: new Date(Date.now() - 5 * 60_000) } });

    const late = await saveContestAnswers(jsonRequest("http://localhost/api/contests/session", "PATCH", { sessionId: started.id, answers: { 2: "B" } }, cookie));
    expect(late.status).toBe(409);

    const next = await startContest(jsonRequest("http://localhost/api/contests/start", "POST", { paperKey }, cookie));
    expect(next.status).toBe(201);
    expect(await prisma.contestSession.findUniqueOrThrow({ where: { id: started.id } }))
      .toMatchObject({ status: "SUBMITTED", score: 7.5, correctCount: 1, blankCount: 1, activeKey: null });
  });
});
