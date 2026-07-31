import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { inspectDatabaseReadiness } from "@/lib/database-readiness";
import { errorLogMetadata } from "@/lib/logging";

export const dynamic = "force-dynamic";

async function getHealth() {
  const startedAt = Date.now();
  try {
    const readiness = await inspectDatabaseReadiness();
    const metadata = {
      database: readiness.database,
      schema: readiness.schema,
      catalog: readiness.catalog,
      version: process.env.APP_VERSION || process.env.npm_package_version || "development",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
    if (!readiness.ready) {
      return NextResponse.json({
        status: readiness.status,
        ...metadata,
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      status: "ok",
      ...metadata,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "health_check_failed",
      ...errorLogMetadata(error),
    }));
    return NextResponse.json({
      status: "unavailable",
      database: "unavailable",
      schema: { status: "unknown" },
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = apiHandler("GET /api/health", getHealth);
