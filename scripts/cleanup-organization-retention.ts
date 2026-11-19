import { cleanupOrganizationRetention } from "../src/lib/organizations";
import { finishOperatorCommand, operatorCommandFailureEntry, startOperatorCommand } from "../src/lib/operator-command";
import { prisma } from "../src/lib/prisma";

// Scheduled daily: applies each organization's retention period. Repeated
// runs continue in batches until nothing is due.
const commandTiming = startOperatorCommand();

cleanupOrganizationRetention(commandTiming.startedAt)
  .finally(() => prisma.$disconnect())
  .then((deleted) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({ level: "info", event: "organization_retention_completed", startedAt: completed.startedAt, completedAt: completed.finishedAt, durationMs: completed.durationMs, deleted }));
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry("organization_retention", error, commandTiming)));
    process.exitCode = 1;
  });
