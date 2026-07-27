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
    include: { question: { include: { subject: true, grade: true, options: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!report) throw new Error("Report not found.");
  console.log(JSON.stringify({
    id: report.id,
    status: report.status,
    category: report.category,
    detail: safeText(report.detail, 1000),
    createdAt: report.createdAt,
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
  const result = await prisma.questionReport.updateMany({
    where: { id: requireIdentifier(), status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  if (!result.count) throw new Error("Open report not found.");
  console.log(`Resolved report ${identifier}.`);
}

async function quarantineQuestion() {
  const report = await prisma.questionReport.findUnique({ where: { id: requireIdentifier() }, select: { questionId: true } });
  if (!report) throw new Error("Report not found.");
  await prisma.question.update({ where: { id: report.questionId }, data: { status: "NEEDS_REVIEW" } });
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
