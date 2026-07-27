type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let operations = 0;

export function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  operations += 1;
  if (operations % 250 === 0) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, bucket);
    return { allowed: true, remaining: limit - 1, retryAfter: Math.ceil(windowMs / 1000) };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    remaining: Math.max(limit - current.count, 0),
    retryAfter: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  };
}
