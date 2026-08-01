import { prisma } from "../src/lib/prisma";
import { transitionContentReport } from "../src/lib/content-review";
import {
  OperatorCommandRejection,
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const [command = "list", identifier] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const commandTiming = startOperatorCommand();
const options = new Map(process.argv.slice(2).filter((argument) => argument.startsWith("--")).map((argument) => {
  const [key, value = "true"] = argument.slice(2).split("=", 2);
  return [key, value];
}));

function safeText(value: string | null | undefined, length = 90) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, length);
}

function requireIdentifier() {
  if (!identifier || identifier.length < 8) {
    throw new OperatorCommandRejection("INVALID_REPORT_ARGUMENTS");
  }
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
  return { action: "list" as const, status, shown: reports.length, limit };
}

async function showReport() {
  const report = await prisma.questionReport.findUnique({
    where: { id: requireIdentifier() },
    include: {
      question: { include: { subject: true, grade: true, options: { orderBy: { sortOrder: "asc" } } } },
      reviewActions: { orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true } } } },
    },
  });
  if (!report) throw new OperatorCommandRejection("REPORT_NOT_FOUND");
  console.log(JSON.stringify({
    id: report.id,
    status: report.status,
    category: report.category,
    detail: safeText(report.detail, 1000),
    createdAt: report.createdAt,
    reviewActions: report.reviewActions.map((action) => ({
      action: action.action,
      note: action.note,
      actor: action.actor ? "authenticated operator" : "trusted CLI",
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
  return { action: "show" as const };
}

async function resolveReport() {
  const reportId = requireIdentifier();
  const result = await transitionContentReport({
    reportId,
    action: "RESOLVE",
    note: reviewNote("Resolved from the trusted operator CLI"),
  });
  if (result.status !== "UPDATED") {
    throw new OperatorCommandRejection("REPORT_STATE_CONFLICT");
  }
  console.log(`Resolved report ${identifier}.`);
  return { action: "resolve" as const };
}

async function quarantineQuestion() {
  const reportId = requireIdentifier();
  const result = await transitionContentReport({
    reportId,
    action: "QUARANTINE",
    note: reviewNote("Quarantined from the trusted operator CLI"),
  });
  if (result.status !== "UPDATED") {
    throw new OperatorCommandRejection("REPORT_STATE_CONFLICT");
  }
  console.log(`Question ${result.questionId} is quarantined. The report remains open until the content fix is verified.`);
  return { action: "quarantine" as const };
}

type ReportCommandResult =
  | Awaited<ReturnType<typeof listReports>>
  | Awaited<ReturnType<typeof showReport>>
  | Awaited<ReturnType<typeof resolveReport>>
  | Awaited<ReturnType<typeof quarantineQuestion>>;

const commands: Record<string, () => Promise<ReportCommandResult>> = {
  list: listReports,
  show: showReport,
  resolve: resolveReport,
  quarantine: quarantineQuestion,
};

async function main() {
  const run = commands[command];
  if (!run) throw new OperatorCommandRejection("UNKNOWN_REPORT_COMMAND");
  return run();
}

void main()
  .finally(() => prisma.$disconnect())
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "content_report_command_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry(
      "content_report_command",
      error,
      commandTiming,
    );
    const output = JSON.stringify(entry);
    if (entry.level === "warn") console.warn(output);
    else console.error(output);
    process.exitCode = 1;
  });
