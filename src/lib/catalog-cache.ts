import { prisma } from "@/lib/prisma";
import { FULL_CATALOG_SCOPE } from "@/lib/catalog-import";

// Catalog-derived views (home stats, filter options, knowledge stages) change
// only when an import or a content-review transition runs. Each process caches
// them per live catalog release for a few minutes; a new release changes the
// key immediately, and review transitions clear this process's copy.

const VERSION_TTL_MS = 30_000;
const ENTRY_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 256;

type Entry = { version: string; expiresAt: number; value: Promise<unknown> };

const entries = new Map<string, Entry>();
let version: { value: string; expiresAt: number } | null = null;

async function catalogVersion(now: number) {
  if (version && version.expiresAt > now) return version.value;
  const release = await prisma.catalogRelease.findFirst({
    where: { scope: FULL_CATALOG_SCOPE },
    orderBy: { completedAt: "desc" },
    select: { manifestHash: true },
  });
  version = { value: release?.manifestHash ?? "unreleased", expiresAt: now + VERSION_TTL_MS };
  return version.value;
}

export async function cachedCatalogValue<T>(key: string, loader: () => Promise<T>, now = Date.now()): Promise<T> {
  const currentVersion = await catalogVersion(now);
  const cached = entries.get(key);
  if (cached && cached.version === currentVersion && cached.expiresAt > now) return cached.value as Promise<T>;

  const value = loader();
  entries.set(key, { version: currentVersion, expiresAt: now + ENTRY_TTL_MS, value });
  // Do not keep a failed load; the next request retries the database.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return value;
}

export function invalidateCatalogCache() {
  entries.clear();
  version = null;
}
