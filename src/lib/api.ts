import { NextResponse } from "next/server";
import { checkRateLimit, clientAddress } from "./rate-limit";

export function enforceRateLimit(request: Request, scope: string, identity: string, limit: number, windowMs = 60_000) {
  const result = checkRateLimit(`${scope}:${clientAddress(request)}:${identity}`, limit, windowMs);
  if (result.allowed) return null;
  return NextResponse.json({ error: "Too many requests" }, {
    status: 429,
    headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
  });
}
