import { USER_ROLE } from "@/lib/domain-constants";
import { normalizeEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

// Institutional sign-in: an account joins an organization only through a
// provider claim the institution controls. Google Workspace accounts carry a
// verified `hd` (hosted domain) claim; Microsoft Entra accounts carry the
// tenant ID (`tid`). Email addresses alone never place anyone in an
// organization, and an account already in one is never moved.

type ProviderProfile = Record<string, unknown> | null | undefined;

export const ORGANIZATION_RETENTION_BATCH_SIZE = 200;
const DAY_MS = 24 * 60 * 60_000;

export function institutionalClaim(provider: string | null | undefined, profile: ProviderProfile, accountEmail: string | null | undefined) {
  if (provider === "google") {
    if (profile?.email_verified !== true || typeof profile.hd !== "string" || typeof accountEmail !== "string") return null;
    const domain = profile.hd.trim().toLowerCase();
    const emailDomain = normalizeEmail(accountEmail).split("@")[1];
    return domain && emailDomain === domain ? { kind: "domain" as const, value: domain } : null;
  }
  if (provider === "microsoft-entra-id") {
    const tenant = typeof profile?.tid === "string" ? profile.tid.trim().toLowerCase() : "";
    return /^[0-9a-f-]{36}$/.test(tenant) ? { kind: "tenant" as const, value: tenant } : null;
  }
  return null;
}

export async function assignOrganizationOnSignIn(userId: string, provider: string | null | undefined, profile: ProviderProfile, accountEmail: string | null | undefined) {
  const claim = institutionalClaim(provider, profile, accountEmail);
  if (!claim) return null;
  const organization = claim.kind === "domain"
    ? (await prisma.organizationDomain.findUnique({ where: { domain: claim.value }, select: { organizationId: true } }))?.organizationId
    : (await prisma.organization.findUnique({ where: { entraTenantId: claim.value }, select: { id: true } }))?.id;
  if (!organization) return null;
  const updated = await prisma.user.updateMany({ where: { id: userId, organizationId: null }, data: { organizationId: organization } });
  return updated.count ? organization : null;
}

function calendarDayBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

// Deletes learner accounts in organizations with a retention period once they
// have been inactive that long. Staff accounts (teachers, editors, admins) and
// accounts that manage child profiles are kept for manual review. Deletion
// cascades exactly like self-service account deletion.
export async function cleanupOrganizationRetention(now = new Date(), batchSize = ORGANIZATION_RETENTION_BATCH_SIZE) {
  const organizations = await prisma.organization.findMany({ where: { retentionDays: { not: null } }, select: { id: true, slug: true, retentionDays: true } });
  const deleted: Record<string, number> = {};
  for (const organization of organizations) {
    const days = organization.retentionDays!;
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const cutoffDay = calendarDayBefore(now, days);
    const candidates = await prisma.user.findMany({
      where: {
        organizationId: organization.id,
        role: USER_ROLE.LEARNER,
        createdAt: { lt: cutoff },
        updatedAt: { lt: cutoff },
        managedLearners: { none: {} },
        OR: [
          { learner: null },
          { learner: { OR: [{ lastActiveOn: null }, { lastActiveOn: { lt: cutoffDay } }], updatedAt: { lt: cutoff } } },
        ],
      },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true },
    });
    const removed = candidates.length
      ? await prisma.user.deleteMany({ where: { id: { in: candidates.map(({ id }) => id) }, organizationId: organization.id, role: USER_ROLE.LEARNER } })
      : { count: 0 };
    deleted[organization.slug] = removed.count;
  }
  return deleted;
}
