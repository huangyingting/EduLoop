import { normalizeEmail } from "../src/lib/auth-validation";
import {
  OperatorCommandRejection,
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";
import { prisma } from "../src/lib/prisma";

// Operator command for institutions: create an organization, attach its
// Google Workspace domains or Microsoft Entra tenant, set its retention period,
// and place an existing account in it (for example a teacher who signs in
// with a password).

const [command, ...args] = process.argv.slice(2);
const commandTiming = startOperatorCommand();
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function reject(): never {
  throw new OperatorCommandRejection("INVALID_ORGANIZATION_ARGUMENTS");
}

async function organization(slug: string | undefined) {
  if (!slug || !SLUG.test(slug)) reject();
  const found = await prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!found) throw new OperatorCommandRejection("ORGANIZATION_NOT_FOUND");
  return found;
}

async function main() {
  switch (command) {
    case "list": {
      const organizations = await prisma.organization.findMany({
        orderBy: { slug: "asc" },
        select: { slug: true, name: true, entraTenantId: true, retentionDays: true, domains: { select: { domain: true } }, _count: { select: { users: true, classrooms: true } } },
      });
      console.table(organizations.map(({ domains, _count, ...rest }) => ({ ...rest, domains: domains.map(({ domain }) => domain).join(", "), users: _count.users, classes: _count.classrooms })));
      return { action: "list", organizations: organizations.length };
    }
    case "create": {
      const [slug, ...nameParts] = args;
      const name = nameParts.join(" ").trim();
      if (!slug || !SLUG.test(slug) || !name || name.length > 120) reject();
      await prisma.organization.create({ data: { slug, name } });
      return { action: "create", slug };
    }
    case "add-domain": {
      const target = await organization(args[0]);
      const domain = args[1]?.trim().toLowerCase();
      if (!domain || !DOMAIN.test(domain)) reject();
      await prisma.organizationDomain.upsert({ where: { domain }, create: { domain, organizationId: target.id }, update: { organizationId: target.id } });
      return { action: "add-domain", slug: target.slug, domain };
    }
    case "set-tenant": {
      const target = await organization(args[0]);
      const tenant = args[1]?.trim().toLowerCase();
      if (!tenant || (tenant !== "none" && !TENANT.test(tenant))) reject();
      await prisma.organization.update({ where: { id: target.id }, data: { entraTenantId: tenant === "none" ? null : tenant } });
      return { action: "set-tenant", slug: target.slug };
    }
    case "set-retention": {
      const target = await organization(args[0]);
      const value = args[1]?.trim();
      const days = value === "none" ? null : Number(value);
      if (days !== null && (!Number.isInteger(days) || days < 30 || days > 3650)) reject();
      await prisma.organization.update({ where: { id: target.id }, data: { retentionDays: days } });
      return { action: "set-retention", slug: target.slug, retentionDays: days };
    }
    case "add-member": {
      const target = await organization(args[0]);
      if (!args[1]) reject();
      const updated = await prisma.user.updateMany({ where: { email: normalizeEmail(args[1]) }, data: { organizationId: target.id } });
      if (!updated.count) throw new OperatorCommandRejection("USER_NOT_FOUND");
      return { action: "add-member", slug: target.slug };
    }
    default:
      reject();
  }
}

main()
  .finally(() => prisma.$disconnect())
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({ level: "info", event: "organization_command_completed", startedAt: completed.startedAt, completedAt: completed.finishedAt, durationMs: completed.durationMs, ...result }));
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry("organization_command", error, commandTiming);
    const output = JSON.stringify(entry);
    if (entry.level === "warn") console.warn(output);
    else console.error(output);
    process.exitCode = 1;
  });
