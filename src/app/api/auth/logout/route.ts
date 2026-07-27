import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  await destroySession(request);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
