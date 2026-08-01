import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { applicationAuthSecret } from "@/lib/auth-secret";
import { inspectDatabaseReadiness } from "@/lib/database-readiness";
import { errorLogMetadata } from "@/lib/logging";
import { applicationRelease } from "@/lib/release";

export const dynamic = "force-dynamic";

async function getHealth() {
  const startedAt = Date.now();
  const release = applicationRelease();
  const configurationReady = Boolean(release && applicationAuthSecret());
  const version = release ?? "unavailable";
  try {
    const readiness = await inspectDatabaseReadiness();
    const metadata = {
      database: readiness.database,
      schema: readiness.schema,
      catalog: readiness.catalog,
      version,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
    if (!readiness.ready || !configurationReady) {
      return NextResponse.json({
        status: configurationReady ? readiness.status : "unavailable",
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
      version,
      timestamp: new Date().toISOString(),
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export const GET = apiHandler("GET /api/health", getHealth);
