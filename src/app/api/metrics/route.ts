import { timingSafeEqual } from "node:crypto";
import { renderMetrics } from "@/lib/observability/metrics";
import { applicationRelease } from "@/lib/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request, token: string) {
  const provided = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Prometheus scrape endpoint for this replica. It does not exist unless
// METRICS_TOKEN is configured, and it always requires that bearer token.
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN?.trim();
  if (!token) return new Response("Not found", { status: 404 });
  if (!authorized(request, token)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  return new Response(renderMetrics(applicationRelease() ?? "unavailable"), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
  });
}
