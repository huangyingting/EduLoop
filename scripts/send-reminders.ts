import { prisma } from "../src/lib/prisma";
import { dispatchReminders } from "../src/lib/notifications/dispatch";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";
import { emailConfiguration } from "../src/lib/email";

// Run hourly (cron or a systemd timer). Each learner receives at most one
// message per type and period inside their chosen local hour, so repeated or
// overlapping runs are safe.
const timing = startOperatorCommand();

void (async () => {
  if (!emailConfiguration()) {
    console.info(JSON.stringify({ level: "info", event: "learning_reminder_dispatch_skipped", reason: "EMAIL_NOT_CONFIGURED" }));
    return;
  }
  const summary = await dispatchReminders();
  console.info(JSON.stringify({ level: summary.failed ? "warn" : "info", event: "learning_reminder_dispatch_completed", ...summary, ...finishOperatorCommand(timing) }));
})()
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry("learning_reminder_dispatch", error, timing)));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
