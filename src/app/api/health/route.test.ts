import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inspectDatabaseReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/lib/database-readiness", () => ({ inspectDatabaseReadiness }));

import { GET } from "./route";

const ready = {
  ready: true,
  status: "ok",
  database: "ready",
  schema: { status: "ready", requiredMigration: "release-migration" },
  catalog: { subjects: 5, questions: 16_537 },
};
const productionAuthSecret = "SSzYj-celXpbS2EtZa-O5peWz2GgexyAlnLELc5J5n8";

describe("health release readiness", () => {
  beforeEach(() => {
    inspectDatabaseReadiness.mockResolvedValue(ready);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fails readiness closed when production has no valid release identity", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "private/release value");
    vi.stubEnv("AUTH_SECRET", productionAuthSecret);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://learn.example/api/health"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      database: "ready",
      schema: { status: "ready" },
      version: "unavailable",
    });
  });

  it("reports ready only with the exact safe production release", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "release-2026.08.01_abc123");
    vi.stubEnv("AUTH_SECRET", productionAuthSecret);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await GET(new Request("https://learn.example/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      database: "ready",
      version: "release-2026.08.01_abc123",
    });
  });

  it("fails readiness closed when the production auth secret is unsafe", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "release-2026.08.01_abc123");
    vi.stubEnv("AUTH_SECRET", "replace-with-at-least-32-random-characters");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("https://learn.example/api/health"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      database: "ready",
      version: "release-2026.08.01_abc123",
    });
  });
});
