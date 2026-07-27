import { PrismaClient } from "@prisma/client";
import { DIFFICULTY_AUDIT_VERSION } from "../src/lib/difficulty";

const prisma = new PrismaClient();
const showAll = process.argv.includes("--all");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const requestedLimit = limitArgument ? Number(limitArgument.split("=")[1]) : 20;
const sampleLimit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(0, requestedLimit)) : 20;

async function main() {
  const questions = await prisma.question.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      sourceDifficulty: true,
      difficulty: true,
      difficultyScore: true,
      difficultyConfidence: true,
      difficultyReason: true,
      difficultyAuditVersion: true,
      subject: { select: { name: true } },
      grade: { select: { name: true } },
      type: true,
      stem: true,
    },
  });
  const pending = questions.filter((question) => question.difficultyAuditVersion !== DIFFICULTY_AUDIT_VERSION
    || question.difficultyReason === "Pending difficulty audit"
    || !["EASY", "MEDIUM", "HARD"].includes(question.difficulty));
  if (pending.length) throw new Error(`${pending.length} questions do not have a complete version ${DIFFICULTY_AUDIT_VERSION} difficulty audit.`);

  const adjusted = questions.filter((question) => question.sourceDifficulty !== question.difficulty);
  const countBy = (key: (question: typeof questions[number]) => string) => Object.fromEntries(
    [...questions.reduce((counts, question) => {
      const value = key(question);
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())].sort(([left], [right]) => left.localeCompare(right)),
  );
  console.log(JSON.stringify({
    auditVersion: DIFFICULTY_AUDIT_VERSION,
    total: questions.length,
    audited: questions.length - pending.length,
    adjusted: adjusted.length,
    retained: questions.length - adjusted.length,
    sourceDistribution: countBy((question) => question.sourceDifficulty),
    finalDistribution: countBy((question) => question.difficulty),
    transitions: countBy((question) => `${question.sourceDifficulty}->${question.difficulty}`),
    bySubject: countBy((question) => `${question.subject.name}:${question.difficulty}`),
  }, null, 2));

  if (showAll) {
    console.log(JSON.stringify(questions, null, 2));
  } else if (sampleLimit) {
    console.table(adjusted.slice(0, sampleLimit).map((question) => ({
      id: question.id,
      subject: question.subject.name,
      grade: question.grade.name,
      type: question.type,
      change: `${question.sourceDifficulty}->${question.difficulty}`,
      score: question.difficultyScore,
      confidence: question.difficultyConfidence,
      stem: question.stem.replace(/[\u0000-\u001f]/g, " ").slice(0, 70),
    })));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
