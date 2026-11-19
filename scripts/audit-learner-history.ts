import { PrismaClient } from "@prisma/client";
import { auditLearnerHistory } from "../src/lib/learner-history-audit";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

// Read-only, aggregate-only check for learner history that was deleted beneath
// its XP and daily-activity totals. It never prints learner identifiers.
const prisma = new PrismaClient();
const timing = startOperatorCommand();

void auditLearnerHistory(prisma)
  .then((audit) => {
    const completed = finishOperatorCommand(timing);
    const intact = audit.learnersMissingAttempts === 0 && audit.learnersWithXpGap === 0;
    console.info(JSON.stringify({
      level: intact ? "info" : "warn",
      event: "learner_history_audit_completed",
      intact,
      ...audit,
      ...completed,
    }));
    if (!intact) process.exitCode = 2;
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry("learner_history_audit", error, timing)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
