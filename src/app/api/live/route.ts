import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { applicationRelease } from "@/lib/release";

export const dynamic = "force-dynamic";

async function getLiveness() {
  return NextResponse.json({
    status: "alive",
    version: applicationRelease() ?? "unavailable",
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = apiHandler("GET /api/live", getLiveness);
