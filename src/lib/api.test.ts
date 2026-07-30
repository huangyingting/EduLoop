import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, apiHandler } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("API contract", () => {
  it("returns stable machine-readable errors", async () => {
    const response = apiError("Invalid filters", 400, "INVALID_REQUEST", { field: "subject" });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Invalid filters",
      code: "INVALID_REQUEST",
      details: { field: "subject" },
    });
  });

  it("propagates valid request IDs and records server timing", async () => {
    const handler = apiHandler("GET /api/test", async () => Response.json({ ok: true }));
    const response = await handler(new Request("http://localhost/api/test", {
      headers: { "x-request-id": "edge-request-42" },
    }));
    expect(response.headers.get("x-request-id")).toBe("edge-request-42");
    expect(response.headers.get("server-timing")).toMatch(/^app;dur=\d+\.\d$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("preserves an explicit cache policy", async () => {
    const handler = apiHandler("GET /api/test", async () => Response.json({ ok: true }, {
      headers: { "Cache-Control": "public, max-age=60" },
    }));
    const response = await handler(new Request("http://localhost/api/test"));
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("contains unexpected errors and logs their correlation ID", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = apiHandler("POST /api/test", async () => {
      throw new Error("database password leaked here");
    });
    const response = await handler(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-request-id": "incident-7" },
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"requestId":"incident-7"'));
  });
});
