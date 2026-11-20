import { finishOperatorCommand, operatorCommandFailureEntry, startOperatorCommand } from "../src/lib/operator-command";
import { reconcileLearnerHistory } from "../src/lib/practice/history-removal";
import { prisma } from "../src/lib/prisma";

// Rebuilds every learner's XP, attempt total, daily activity, session totals,
// and subject and topic statistics from the attempts that still exist, so no
// counter refers to deleted questions or history. Idempotent; the deployment
// runs it after each seed.
const BATCH_SIZE = 100;
const commandTiming = startOperatorCommand();

async function main() {
  let cursor: string | undefined;
  let learners = 0;
  while (true) {
    const batch = await prisma.learnerProfile.findMany({
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true },
    });
    if (!batch.length) break;
    cursor = batch.at(-1)!.id;
    for (const { id } of batch) await prisma.$transaction((transaction) => reconcileLearnerHistory(transaction, [id]));
    learners += batch.length;
  }
  return { learners };
}

main()
  .finally(() => prisma.$disconnect())
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({ level: "info", event: "learner_reconciliation_completed", startedAt: completed.startedAt, completedAt: completed.finishedAt, durationMs: completed.durationMs, ...result }));
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry("learner_reconciliation", error, commandTiming)));
    process.exitCode = 1;
  });
