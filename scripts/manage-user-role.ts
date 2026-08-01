import { normalizeEmail } from "../src/lib/auth-validation";
import {
  OperatorCommandRejection,
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";
import { prisma } from "../src/lib/prisma";
import { isContentOperator, USER_ROLES, type UserRole } from "../src/lib/user-roles";

const [rawEmail, rawRole] = process.argv.slice(2);
const commandTiming = startOperatorCommand();

async function main() {
  if (!rawEmail && !rawRole) {
    const operators = await prisma.user.findMany({
      where: { role: { in: ["CONTENT_EDITOR", "ADMIN"] } },
      orderBy: { email: "asc" },
      select: { email: true, name: true, role: true, updatedAt: true },
    });
    console.table(operators);
    return { action: "list" as const, operators: operators.length };
  }
  const role = rawRole as UserRole;
  if (!rawEmail || !USER_ROLES.includes(role)) {
    throw new OperatorCommandRejection("INVALID_ROLE_ARGUMENTS");
  }
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new OperatorCommandRejection("USER_NOT_FOUND");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    select: { role: true },
  });
  return {
    action: "update" as const,
    role: updated.role,
    studioAccess: isContentOperator({ role }),
  };
}

main()
  .finally(() => prisma.$disconnect())
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "user_role_command_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry(
      "user_role_command",
      error,
      commandTiming,
    );
    const output = JSON.stringify(entry);
    if (entry.level === "warn") console.warn(output);
    else console.error(output);
    process.exitCode = 1;
  });
