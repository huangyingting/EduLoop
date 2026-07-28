import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getHealth() {
  const startedAt = Date.now();
  try {
    const [subjects, questions] = await Promise.all([
      prisma.subject.count(),
      prisma.question.count(),
    ]);
    if (!subjects || !questions) {
      return NextResponse.json({
        status: "initializing",
        database: "ready",
        catalog: { subjects, questions },
        timestamp: new Date().toISOString(),
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      status: "ok",
      database: "ready",
      catalog: { subjects, questions },
      version: process.env.APP_VERSION || process.env.npm_package_version || "development",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "health_check_failed", message: error instanceof Error ? error.message : "Unknown database error" }));
    return NextResponse.json({ status: "unavailable", database: "unavailable", timestamp: new Date().toISOString() }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = apiHandler("GET /api/health", getHealth);
