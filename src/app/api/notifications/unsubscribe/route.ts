import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { unsubscribe } from "@/lib/notifications/dispatch";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe";

// One-click unsubscribe (RFC 8058). Mail clients POST here from outside the
// site, so the signed, type-scoped token in the link is the only credential.
async function postUnsubscribe(request: NextRequest) {
  const limited = await enforceRateLimit(request, "notification-unsubscribe", { addressLimit: 30 });
  if (limited) return limited;
  let token = request.nextUrl.searchParams.get("token");
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    const body = await readJsonBody(request);
    if (body.ok && body.value && typeof body.value === "object") token = String((body.value as { token?: unknown }).token ?? "");
  }
  const verified = verifyUnsubscribeToken(token);
  if (!verified) return apiError("This unsubscribe link is invalid or has expired.", 400, "INVALID_REQUEST");
  await unsubscribe(verified.userId, verified.type);
  return NextResponse.json({ unsubscribed: true, type: verified.type });
}

export const POST = apiHandler("POST /api/notifications/unsubscribe", postUnsubscribe);
