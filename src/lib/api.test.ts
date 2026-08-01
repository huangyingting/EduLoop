import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, apiHandler, MAX_JSON_BODY_BYTES, readJsonBody } from "./api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

  it("emits privacy-safe production completion telemetry", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const handler = apiHandler("POST /api/attempts", async () => Response.json({
      response: "sensitive learner answer",
    }, { status: 202 }));
    await handler(new Request("https://learn.example/api/attempts", {
      method: "POST",
      headers: { "x-request-id": "telemetry-9" },
    }));

    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(log.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "info",
      event: "api_request_completed",
      route: "POST /api/attempts",
      requestId: "telemetry-9",
      method: "POST",
      status: 202,
    });
    expect(entry.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(entry)).not.toContain("sensitive learner answer");
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"errorType":"Error"'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("database password leaked here"));
  });

  it("returns a retryable service response when the database pool is exhausted", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = apiHandler("POST /api/test", async () => {
      throw Object.assign(new Error("pool details contain a private database host"), { code: "P2024" });
    });

    const response = await handler(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-request-id": "pool-overload-1" },
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Service unavailable",
      code: "SERVICE_UNAVAILABLE",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"errorCode":"P2024"'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("private database host"));
  });

  it("parses bounded JSON and preserves invalid-body validation behavior", async () => {
    await expect(readJsonBody(new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ answer: 42 }),
    }))).resolves.toEqual({ ok: true, value: { answer: 42 } });
    await expect(readJsonBody(new Request("http://localhost/api/test", {
      method: "POST",
      body: "{not-json",
    }))).resolves.toEqual({ ok: true, value: null });
  });

  it("rejects declared and streamed JSON bodies beyond the byte limit", async () => {
    const declared = await readJsonBody(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
      body: "{}",
    }));
    expect(declared.ok).toBe(false);
    if (!declared.ok) {
      expect(declared.response.status).toBe(413);
      expect(await declared.response.json()).toEqual({
        error: "Request body too large",
        code: "PAYLOAD_TOO_LARGE",
        details: { maxBytes: MAX_JSON_BODY_BYTES },
      });
    }

    const streamed = await readJsonBody(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "2" },
      body: "x".repeat(MAX_JSON_BODY_BYTES + 1),
    }));
    expect(streamed.ok).toBe(false);
    if (!streamed.ok) expect(streamed.response.status).toBe(413);
  });
});
