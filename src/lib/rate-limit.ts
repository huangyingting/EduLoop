import { createHash } from "node:crypto";
import { prisma } from "./prisma";

const CLEANUP_INTERVAL = 250;
let operations = 0;

export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

export function rateLimitBucketId(key: string, windowMs: number, now: number) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return createHash("sha256")
    .update(`${windowMs}\0${windowStart}\0${key}`)
    .digest("hex");
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
  if (operations % CLEANUP_INTERVAL === 0) await cleanupExpiredRateLimitBuckets(now);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(limit - bucket.count, 0),
    retryAfter: Math.max(Math.ceil((expiresAt - now) / 1000), 1),
  };
}
