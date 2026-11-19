import { Prisma } from "@prisma/client";
import { cachedCatalogValue } from "@/lib/catalog-cache";
import { CONTEST_RULES, contestScore, type ContestSlot } from "@/lib/contest-papers";
import type { ContestListPayload, ContestResultView, ContestSessionView } from "@/lib/contracts/contests";
import { ASSET_REVIEW_STATUS, CONTEST_SESSION_STATUS, QUESTION_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { findAttemptQuestion, recordLearnerAttempt } from "./attempts";
import { correctLabelsFor, gradeResponse } from "./grading";

// Late saves and submissions are accepted briefly after the deadline to absorb
// network delay; anything later is graded with what was already saved.
const DEADLINE_GRACE_MS = 30_000;

type Level = ContestSlot["level"];

function paperView(paper: { key: string; contest: string; year: number; level: string; durationMinutes: number }) {
  return { key: paper.key, contest: paper.contest, year: paper.year, level: paper.level, durationMinutes: paper.durationMinutes };
}

async function paperCatalog() {
  return cachedCatalogValue("contest-papers", async () => {
    const papers = await prisma.contestPaper.findMany({
      orderBy: [{ level: "asc" }, { year: "desc" }, { key: "asc" }],
      include: { slots: { select: { question: { select: { status: true } } } } },
    });
    return papers.map((paper) => ({
      key: paper.key,
      year: paper.year,
      contest: paper.contest,
      level: paper.level,
      questionCount: paper.questionCount,
      durationMinutes: paper.durationMinutes,
      // A paper is offered only when every problem is present and served.
      available: paper.slots.length === paper.questionCount
        && paper.slots.every(({ question }) => question.status === QUESTION_STATUS.PUBLISHED),
    }));
  });
}

export async function listContestPapers(learnerId: string | null, level?: Level): Promise<ContestListPayload> {
  const papers = (await paperCatalog()).filter((paper) => !level || paper.level === level);
  const [results, active] = learnerId ? await Promise.all([
    prisma.contestSession.groupBy({
      by: ["paperKey"],
      where: { learnerId, status: CONTEST_SESSION_STATUS.SUBMITTED },
      _max: { score: true },
      _count: { _all: true },
    }),
    prisma.contestSession.findUnique({ where: { activeKey: learnerId }, select: { id: true, paperKey: true, deadlineAt: true } }),
  ]) : [[], null];
  const resultByPaper = new Map(results.map((result) => [result.paperKey, result]));
  return {
    papers: papers.map((paper) => ({
      ...paper,
      bestScore: resultByPaper.get(paper.key)?._max.score ?? null,
      attempts: resultByPaper.get(paper.key)?._count._all ?? 0,
    })),
    activeSession: active ? { id: active.id, paperKey: active.paperKey, deadlineAt: active.deadlineAt.toISOString() } : null,
  };
}

async function contestQuestions(paperKey: string) {
  const slots = await prisma.contestPaperSlot.findMany({
    where: { paperKey },
    orderBy: { problemNumber: "asc" },
    select: {
      problemNumber: true,
      question: {
        select: {
          id: true,
          stem: true,
          options: { orderBy: { sortOrder: "asc" }, select: { label: true, content: true } },
          assets: { where: { reviewStatus: ASSET_REVIEW_STATUS.APPROVED }, select: { role: true, path: true, altText: true } },
        },
      },
    },
  });
  return slots.map(({ problemNumber, question }) => {
    const assets = new Map(question.assets.map((asset) => [asset.role, asset]));
    const stemAsset = assets.get("STEM");
    return {
      number: problemNumber,
      questionId: question.id,
      stem: question.stem,
      stemAsset: stemAsset ? { path: stemAsset.path, altText: stemAsset.altText } : null,
      options: question.options.map(({ label, content }) => {
        const asset = assets.get(`OPTION_${label}`);
        return { label, content, asset: asset ? { path: asset.path, altText: asset.altText } : null };
      }),
    };
  });
}

function parseAnswers(answersJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(answersJson) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

async function sessionView(session: {
  id: string; paperKey: string; startedAt: Date; deadlineAt: Date; answersJson: string;
  paper: { key: string; contest: string; year: number; level: string; durationMinutes: number };
}): Promise<ContestSessionView> {
  return {
    status: CONTEST_SESSION_STATUS.ACTIVE,
    id: session.id,
    paper: paperView(session.paper),
    startedAt: session.startedAt.toISOString(),
    deadlineAt: session.deadlineAt.toISOString(),
    answers: parseAnswers(session.answersJson),
    questions: await contestQuestions(session.paperKey),
  };
}

export type StartContestOutcome =
  | { status: "STARTED" | "RESUMED"; view: ContestSessionView }
  | { status: "UNAVAILABLE" }
  | { status: "OTHER_ACTIVE"; sessionId: string; paperKey: string };

export async function startContest(learnerId: string, paperKey: string, now = new Date()): Promise<StartContestOutcome> {
  const paper = (await paperCatalog()).find((candidate) => candidate.key === paperKey);
  if (!paper?.available) return { status: "UNAVAILABLE" };

  const active = await prisma.contestSession.findUnique({ where: { activeKey: learnerId }, include: { paper: true } });
  if (active) {
    if (active.deadlineAt.getTime() + DEADLINE_GRACE_MS < now.getTime()) {
      // An expired paper is graded with whatever was saved before starting anew.
      await submitContest(learnerId, active.id, now);
    } else if (active.paperKey === paperKey) {
      return { status: "RESUMED", view: await sessionView(active) };
    } else {
      return { status: "OTHER_ACTIVE", sessionId: active.id, paperKey: active.paperKey };
    }
  }

  try {
    const session = await prisma.contestSession.create({
      data: {
        learnerId,
        paperKey,
        activeKey: learnerId,
        deadlineAt: new Date(now.getTime() + paper.durationMinutes * 60_000),
      },
      include: { paper: true },
    });
    return { status: "STARTED", view: await sessionView(session) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const winner = await prisma.contestSession.findUnique({ where: { activeKey: learnerId }, include: { paper: true } });
    if (winner?.paperKey === paperKey) return { status: "RESUMED", view: await sessionView(winner) };
    if (winner) return { status: "OTHER_ACTIVE", sessionId: winner.id, paperKey: winner.paperKey };
    throw error;
  }
}

export async function saveContestAnswers(
  learnerId: string,
  sessionId: string,
  changes: Record<string, string | null>,
  now = new Date(),
) {
  const session = await prisma.contestSession.findFirst({ where: { id: sessionId, learnerId } });
  if (!session) return { status: "NOT_FOUND" as const };
  if (session.status !== CONTEST_SESSION_STATUS.ACTIVE) return { status: "CLOSED" as const };
  if (session.deadlineAt.getTime() + DEADLINE_GRACE_MS < now.getTime()) return { status: "EXPIRED" as const };
  const answers = parseAnswers(session.answersJson);
  for (const [number, label] of Object.entries(changes)) {
    if (label) answers[number] = label;
    else delete answers[number];
  }
  const saved = await prisma.contestSession.updateMany({
    where: { id: sessionId, learnerId, status: CONTEST_SESSION_STATUS.ACTIVE, answersJson: session.answersJson },
    data: { answersJson: JSON.stringify(answers) },
  });
  // A concurrent save changed the row first; the caller simply retries.
  return saved.count ? { status: "SAVED" as const, answers } : { status: "CONFLICT" as const };
}

export async function submitContest(learnerId: string, sessionId: string, now = new Date()) {
  // Claim the session (ACTIVE or an interrupted SUBMITTING) so two submissions
  // cannot both grade it; recording attempts below is idempotent on retry.
  const claimed = await prisma.contestSession.updateMany({
    where: { id: sessionId, learnerId, status: { in: [CONTEST_SESSION_STATUS.ACTIVE, CONTEST_SESSION_STATUS.SUBMITTING] } },
    data: { status: CONTEST_SESSION_STATUS.SUBMITTING },
  });
  const session = await prisma.contestSession.findFirst({ where: { id: sessionId, learnerId }, include: { paper: true } });
  if (!session) return { status: "NOT_FOUND" as const };
  if (!claimed.count) {
    return session.status === CONTEST_SESSION_STATUS.SUBMITTED
      ? { status: "GRADED" as const, result: await contestResult(learnerId, sessionId) }
      : { status: "CLOSED" as const };
  }

  const answers = parseAnswers(session.answersJson);
  const learner = await prisma.learnerProfile.findUnique({ where: { id: learnerId }, select: { timeZone: true } });
  const slots = await prisma.contestPaperSlot.findMany({ where: { paperKey: session.paperKey }, orderBy: { problemNumber: "asc" } });
  const results: Array<boolean | null> = [];
  for (const slot of slots) {
    const response = answers[String(slot.problemNumber)];
    const question = response ? await findAttemptQuestion(slot.questionId) : null;
    const grading = question ? gradeResponse(question, [response]) : null;
    if (!question || !grading?.ok) {
      results.push(null);
      continue;
    }
    const recorded = await recordLearnerAttempt({
      learnerId,
      storedTimeZone: learner?.timeZone,
      question,
      grading,
      contestSessionId: session.id,
      input: { questionId: question.id, response: [response], clientAttemptId: `contest-${session.id}-${slot.problemNumber}` },
      now,
    });
    results.push(recorded.status === "RECORDED" ? recorded.result.isCorrect : null);
  }

  const score = contestScore(session.paper.level as Level, results);
  await prisma.contestSession.updateMany({
    where: { id: session.id, status: CONTEST_SESSION_STATUS.SUBMITTING },
    data: {
      status: CONTEST_SESSION_STATUS.SUBMITTED,
      activeKey: null,
      submittedAt: now,
      score: score.score,
      correctCount: score.correct,
      blankCount: score.blank,
      wrongCount: score.wrong,
    },
  });
  return { status: "GRADED" as const, result: await contestResult(learnerId, sessionId) };
}

export async function contestResult(learnerId: string, sessionId: string): Promise<ContestResultView | null> {
  const session = await prisma.contestSession.findFirst({
    where: { id: sessionId, learnerId, status: CONTEST_SESSION_STATUS.SUBMITTED },
    include: { paper: true },
  });
  if (!session) return null;
  const answers = parseAnswers(session.answersJson);
  const slots = await prisma.contestPaperSlot.findMany({
    where: { paperKey: session.paperKey },
    orderBy: { problemNumber: "asc" },
    select: {
      problemNumber: true,
      question: {
        select: {
          id: true, stem: true, answer: true, explanation: true, correctAnswer: true,
          tags: { where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } }, select: { tag: { select: { label: true } } } },
        },
      },
    },
  });
  const topics = new Map<string, { label: string; correct: number; total: number }>();
  const problems = slots.map(({ problemNumber, question }) => {
    const response = answers[String(problemNumber)] ?? null;
    const correctLabels = correctLabelsFor(question);
    const isCorrect = response ? correctLabels.includes(response) && correctLabels.length === 1 : null;
    const labels = question.tags.map(({ tag }) => tag.label);
    for (const label of labels) {
      const topic = topics.get(label) ?? { label, correct: 0, total: 0 };
      topic.total += 1;
      topic.correct += isCorrect ? 1 : 0;
      topics.set(label, topic);
    }
    return { number: problemNumber, questionId: question.id, stem: question.stem, response, correctLabels, isCorrect, answer: question.answer, explanation: question.explanation, topics: labels };
  });
  const rules = CONTEST_RULES[session.paper.level as Level];
  return {
    status: CONTEST_SESSION_STATUS.SUBMITTED,
    id: session.id,
    paper: paperView(session.paper),
    submittedAt: (session.submittedAt ?? session.startedAt).toISOString(),
    score: session.score ?? 0,
    maxScore: session.paper.questionCount * rules.correctPoints,
    correct: session.correctCount ?? 0,
    blank: session.blankCount ?? 0,
    wrong: session.wrongCount ?? 0,
    problems,
    topics: [...topics.values()].sort((left, right) => left.correct / left.total - right.correct / right.total || right.total - left.total),
  };
}

export async function activeContestView(learnerId: string, sessionId: string) {
  const session = await prisma.contestSession.findFirst({
    where: { id: sessionId, learnerId, status: CONTEST_SESSION_STATUS.ACTIVE },
    include: { paper: true },
  });
  return session ? sessionView(session) : null;
}
