import { prisma } from "../src/lib/prisma";

const [command = "list", identifier] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const options = new Map(process.argv.slice(2).filter((argument) => argument.startsWith("--")).map((argument) => {
  const [key, value = "true"] = argument.slice(2).split("=", 2);
  return [key, value];
}));

function safeText(value: string | null | undefined, length = 90) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, length);
}

function requireIdentifier() {
  if (!identifier || identifier.length < 8) throw new Error(`Usage: npm run reports:review -- ${command} <report-id>`);
  return identifier;
}

function reviewNote(fallback: string) {
  return safeText(options.get("note") ?? fallback, 500);
}

async function listReports() {
  const status = options.get("status") === "RESOLVED" ? "RESOLVED" : "OPEN";
  const requestedLimit = Number(options.get("limit") ?? 25);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 25;
  const reports = await prisma.questionReport.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { question: { select: { stem: true, status: true, subject: { select: { name: true } }, grade: { select: { name: true } } } } },
  });
  console.table(reports.map((report) => ({
    id: report.id,
    created: report.createdAt.toISOString().slice(0, 10),
    category: report.category,
    question: report.questionId,
    state: report.question.status,
    subject: report.question.subject.name,
    grade: report.question.grade.name,
    detail: safeText(report.detail, 50),
    stem: safeText(report.question.stem),
  })));
  console.log(`${reports.length} ${status.toLowerCase()} report(s) shown. Use --limit=100 or --status=RESOLVED to change the queue.`);
}

async function showReport() {
  const report = await prisma.questionReport.findUnique({
    where: { id: requireIdentifier() },
    include: {
      question: { include: { subject: true, grade: true, options: { orderBy: { sortOrder: "asc" } } } },
      reviewActions: { orderBy: { createdAt: "desc" }, include: { actor: { select: { email: true } } } },
    },
  });
  if (!report) throw new Error("Report not found.");
  console.log(JSON.stringify({
    id: report.id,
    status: report.status,
    category: report.category,
    detail: safeText(report.detail, 1000),
    createdAt: report.createdAt,
    reviewActions: report.reviewActions.map((action) => ({
      action: action.action,
      note: action.note,
      actor: action.actor?.email ?? "trusted CLI",
      createdAt: action.createdAt,
    })),
    question: {
      id: report.question.id,
      status: report.question.status,
      subject: report.question.subject.name,
      grade: report.question.grade.name,
      stem: report.question.stem,
      options: report.question.options.map((option) => ({ label: option.label, content: option.content })),
      answer: report.question.answer,
      explanation: report.question.explanation,
      sourceFile: report.question.sourceFile,
      sourceId: report.question.sourceId,
    },
  }, null, 2));
}

async function resolveReport() {
  const reportId = requireIdentifier();
  const result = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.questionReport.updateMany({
      where: { id: reportId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (!updated.count) return false;
    await transaction.contentReviewAction.create({
      data: { reportId, action: "RESOLVE", note: reviewNote("Resolved from the trusted operator CLI") },
    });
    return true;
  });
  if (!result) throw new Error("Open report not found.");
  console.log(`Resolved report ${identifier}.`);
}

async function quarantineQuestion() {
  const reportId = requireIdentifier();
  const report = await prisma.questionReport.findUnique({ where: { id: reportId }, select: { questionId: true, status: true } });
  if (!report) throw new Error("Report not found.");
  if (report.status !== "OPEN") throw new Error("Only an open report can quarantine a question.");
  const changed = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.question.updateMany({ where: { id: report.questionId, status: "PUBLISHED" }, data: { status: "NEEDS_REVIEW" } });
    if (!updated.count) return false;
    await transaction.contentReviewAction.create({
      data: { reportId, action: "QUARANTINE", note: reviewNote("Quarantined from the trusted operator CLI") },
    });
    return true;
  });
  if (!changed) throw new Error("Question is already quarantined or unavailable.");
  console.log(`Question ${report.questionId} is quarantined. The report remains open until the content fix is verified.`);
}

const commands: Record<string, () => Promise<void>> = {
  list: listReports,
  show: showReport,
  resolve: resolveReport,
  quarantine: quarantineQuestion,
};

async function main() {
  try {
    const run = commands[command];
    if (!run) throw new Error("Unknown command. Use list, show, quarantine, or resolve.");
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
