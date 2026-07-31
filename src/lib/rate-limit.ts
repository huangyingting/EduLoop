import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { cleanupExpiredSecurityArtifacts } from "./retention";

const CLEANUP_INTERVAL = 250;
let operations = 0;

type ProxyEnvironment = {
  NODE_ENV?: string;
  TRUSTED_PROXY_HOPS?: string;
};

function trustedProxyHops(environment: ProxyEnvironment) {
  const configured = environment.TRUSTED_PROXY_HOPS?.trim();
  if (!configured) return environment.NODE_ENV === "production" ? 1 : null;
  const hops = Number(configured);
  return Number.isInteger(hops) && hops >= 1 && hops <= 10
    ? hops
    : environment.NODE_ENV === "production" ? 1 : null;
}

export function clientAddress(
  request: Request,
  environment: ProxyEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
  },
) {
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean) ?? [];
  if (forwarded.length) {
    const proxyHops = trustedProxyHops(environment);
    if (proxyHops) return forwarded[Math.max(0, forwarded.length - proxyHops)];
    return forwarded[0];
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function rateLimitBucketId(key: string, windowMs: number, now: number) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return createHash("sha256")
    .update(`${windowMs}\0${windowStart}\0${key}`)
    .digest("hex");
}

export function addressRateLimitKey(scope: string, address: string) {
  return `${scope}:address:${address}`;
}

export function identityRateLimitKey(scope: string, identity: string) {
  return `${scope}:identity:${identity}`;
}

export async function cleanupExpiredRateLimitBuckets(now = Date.now()) {
  return prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lte: new Date(now) } },
  });
}

export async function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Rate-limit limit must be a positive integer.");
  if (!Number.isInteger(windowMs) || windowMs < 1) throw new RangeError("Rate-limit window must be a positive integer.");
  if (!Number.isFinite(now)) throw new RangeError("Rate-limit time must be finite.");

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const expiresAt = windowStart + windowMs;
  const id = rateLimitBucketId(key, windowMs, now);
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { id },
    create: {
      id,
      windowStart: new Date(windowStart),
      expiresAt: new Date(expiresAt),
      count: 1,
    },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  operations += 1;
  if (operations % CLEANUP_INTERVAL === 0) {
    await cleanupExpiredSecurityArtifacts(new Date(now));
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(limit - bucket.count, 0),
    retryAfter: Math.max(Math.ceil((expiresAt - now) / 1000), 1),
  };
}
