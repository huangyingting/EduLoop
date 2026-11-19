import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { DIFFICULTY, QUESTION_STATUS } from "../src/lib/domain-constants";
import { findAttemptQuestion, recordLearnerAttempt } from "../src/lib/practice/attempts";
import { gradeResponse } from "../src/lib/practice/grading";
import { selectNextQuestion } from "../src/lib/practice/selection";
import type { QuestionFilters } from "../src/lib/question-filters";

// Measures the database work behind the two hottest learner paths against a
// seeded catalog and fails when p95 latency exceeds the configured budget.
// It creates one temporary learner and removes it (and its history) afterwards.

const iterations = Number(process.env.PERF_ITERATIONS ?? 150);
const selectionBudgetMs = Number(process.env.PERF_BUDGET_SELECTION_P95_MS ?? 120);
const attemptBudgetMs = Number(process.env.PERF_BUDGET_ATTEMPT_P95_MS ?? 150);
const userId = `perf-benchmark-${randomUUID()}`;

function percentile(samples: number[], fraction: number) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summary(samples: number[]) {
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.5).toFixed(1)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...samples).toFixed(1)),
  };
}

function filters(overrides: Partial<QuestionFilters>): QuestionFilters {
  return { mode: "standard", excluded: [], tagFilters: [], ...overrides };
}

async function timed<T>(samples: number[], action: () => Promise<T>) {
  const startedAt = performance.now();
  const result = await action();
  samples.push(performance.now() - startedAt);
  return result;
}

async function main() {
  const published = await prisma.question.count({ where: { status: QUESTION_STATUS.PUBLISHED } });
  if (published < 100) throw new Error("perf:check needs a seeded catalog (run npm run db:seed first).");
  const [subjects, bands, topics] = await Promise.all([
    prisma.subject.findMany({ select: { slug: true } }),
    prisma.gradeBand.findMany({ select: { slug: true } }),
    prisma.tag.findMany({ where: { dimension: { key: "TOPIC" } }, select: { slug: true }, take: 20 }),
  ]);
  const scenarios: QuestionFilters[] = [
    filters({}),
    ...subjects.map(({ slug }) => filters({ subject: slug })),
    ...bands.map(({ slug }) => filters({ gradeBand: slug, difficulty: DIFFICULTY.MEDIUM })),
    ...topics.map(({ slug }) => filters({ tagFilters: [{ dimension: "TOPIC", slug }] })),
    filters({ mode: "adaptive" }),
  ];

  const learner = (await prisma.user.create({
    data: { id: userId, email: `${userId}@example.invalid`, learner: { create: {} } },
    select: { learner: { select: { id: true } } },
  })).learner!;

  const selection: number[] = [];
  const attempts: number[] = [];
  const recent: string[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const scenario = { ...scenarios[index % scenarios.length], excluded: recent.slice(-8) };
    const question = await timed(selection, () => selectNextQuestion(scenario, index % 2 ? learner.id : null));
    if (!question) continue;
    recent.push(question.id);
    const gradable = await findAttemptQuestion(question.id);
    if (!gradable) continue;
    const response = gradable.options.length ? [gradable.options[0].label] : "benchmark response";
    const grading = gradeResponse(gradable, response);
    if (!grading.ok) continue;
    await timed(attempts, () => recordLearnerAttempt({
      learnerId: learner.id,
      question: gradable,
      grading,
      input: { questionId: gradable.id, response, clientAttemptId: randomUUID(), secondsSpent: 20 },
    }));
  }

  const report = { selection: summary(selection), attempts: summary(attempts), budgets: { selectionBudgetMs, attemptBudgetMs } };
  const withinBudget = report.selection.p95Ms <= selectionBudgetMs && report.attempts.p95Ms <= attemptBudgetMs;
  console.info(JSON.stringify({ level: withinBudget ? "info" : "error", event: "practice_performance_check", withinBudget, ...report }));
  if (!withinBudget) process.exitCode = 1;
}

void main()
  .catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "practice_performance_check_failed", message: String(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });
