import { normalizeEmail } from "../src/lib/auth-validation";
import { prisma } from "../src/lib/prisma";
import { isContentOperator, USER_ROLES, type UserRole } from "../src/lib/user-roles";

const [rawEmail, rawRole] = process.argv.slice(2);

async function main() {
  if (!rawEmail && !rawRole) {
    const operators = await prisma.user.findMany({
      where: { role: { in: ["CONTENT_EDITOR", "ADMIN"] } },
      orderBy: { email: "asc" },
      select: { email: true, displayName: true, role: true, updatedAt: true },
    });
    console.table(operators);
    return;
  }
  const role = rawRole as UserRole;
  if (!rawEmail || !USER_ROLES.includes(role)) {
    throw new Error(`Usage: npm run users:role -- <email> <${USER_ROLES.join("|")}>`);
  }
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No registered user found for ${email}.`);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role },
    select: { email: true, displayName: true, role: true },
  });
  console.log(`${updated.email} now has role ${updated.role}.`);
  if (isContentOperator({ role })) {
    console.log("The content review workspace is available at /studio on the user's next request.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
