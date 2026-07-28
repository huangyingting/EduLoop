import { NextResponse } from "next/server";
import { apiError, apiHandler } from "@/lib/api";
import { destroySession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";

export const runtime = "nodejs";

async function postLogout(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError("Invalid request origin.", 403, "FORBIDDEN");
  }
  await destroySession(request);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/logout", postLogout);
