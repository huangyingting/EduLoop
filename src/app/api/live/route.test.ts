import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  throw new Error("The liveness route initialized the database client.");
});

import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("process liveness", () => {
  it("reports the exact safe release without checking dependencies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "release-2026.08.01_abc123");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await GET(new Request("https://learn.example/api/live", {
      headers: { "x-request-id": "liveness-probe-1" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("liveness-probe-1");
    expect(response.headers.get("server-timing")).toMatch(/^app;dur=\d+\.\d$/);
    expect(await response.json()).toMatchObject({
      status: "alive",
      version: "release-2026.08.01_abc123",
    });
  });

  it("stays live when configuration is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_VERSION", "development");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await GET(new Request("https://learn.example/api/live"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "alive",
      version: "unavailable",
    });
  });
});
