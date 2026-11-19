import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest, apiUrl, describeApiError, loginRedirectPath } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, ...init });
}

describe("api client", () => {
  it("serializes non-empty query values only", () => {
    expect(apiUrl("/api/progress", { timeZone: "Asia/Shanghai", empty: "", missing: undefined, page: 2 }))
      .toBe("/api/progress?timeZone=Asia%2FShanghai&page=2");
    expect(apiUrl("/api/review")).toBe("/api/review");
  });

  it("sends JSON bodies and returns typed payloads", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ saved: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiRequest<{ saved: boolean }>("/api/review", { method: "POST", body: { saved: true } }))
      .resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/review", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{\"saved\":true}",
      cache: "no-store",
    }));
  });

  it("maps API errors to typed kinds with retry hints", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
      { error: "Too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "12" } },
    )));
    const error = await apiRequest("/api/attempts").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ kind: "rate-limited", code: "RATE_LIMITED", retryAfterSeconds: 12, status: 429 });
    expect(describeApiError(error, "fallback")).toContain("12 秒");
  });

  it("reports network failures and keeps feature-specific fallbacks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    const error = await apiRequest("/api/review").catch((cause: unknown) => cause);
    expect(error).toMatchObject({ kind: "network", status: 0 });
    expect(describeApiError(new ApiClientError({ status: 409, code: "CONFLICT", message: "x" }), "收藏失败"))
      .toBe("收藏失败");
    expect(describeApiError(new Error("other"), "fallback")).toBe("fallback");
  });

  it("builds login redirects that return to the current page", () => {
    expect(loginRedirectPath("/review?tab=saved")).toBe("/login?next=%2Freview%3Ftab%3Dsaved");
  });
});
