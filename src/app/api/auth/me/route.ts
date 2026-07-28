import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCurrentUser(request: Request) {
  const user = await getSessionUser(request);
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = apiHandler("GET /api/auth/me", getCurrentUser);
