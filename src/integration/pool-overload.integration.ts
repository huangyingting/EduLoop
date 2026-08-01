import { PrismaClient } from "@prisma/client";
import { afterEach, expect, it, vi } from "vitest";
import { apiHandler } from "@/lib/api";

const postgresIt = process.env.EDULOOP_DATABASE_PROVIDER === "postgresql" ? it : it.skip;

afterEach(() => {
  vi.restoreAllMocks();
});

postgresIt("returns a redacted 503 when the real PostgreSQL pool is exhausted", async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set("connection_limit", "1");
  databaseUrl.searchParams.set("pool_timeout", "1");
  databaseUrl.searchParams.set("connect_timeout", "5");
  const saturated = new PrismaClient({ datasourceUrl: databaseUrl.toString(), log: [] });
  let markConnectionHeld!: () => void;
  let releaseConnection!: () => void;
  const connectionHeld = new Promise<void>((resolve) => {
    markConnectionHeld = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseConnection = resolve;
  });
  const holdingTransaction = saturated.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT 1`;
    markConnectionHeld();
    await release;
  }, { timeout: 5_000 });
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    await Promise.race([
      connectionHeld,
      holdingTransaction.then(() => {
        throw new Error("Holding transaction ended before reserving the pool connection.");
      }),
    ]);
    const handler = apiHandler("GET /api/pool-overload-test", async () => {
      await saturated.$queryRaw`SELECT 1`;
      return Response.json({ ok: true });
    });
    const response = await handler(new Request("http://localhost/api/pool-overload-test", {
      headers: { "x-request-id": "pool-overload-integration" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service unavailable",
      code: "SERVICE_UNAVAILABLE",
    });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('"errorCode":"P2024"'));
    expect(errorLog).not.toHaveBeenCalledWith(expect.stringContaining(databaseUrl.password));
  } finally {
    releaseConnection();
    try {
      await holdingTransaction;
    } finally {
      await saturated.$disconnect();
    }
  }
});
