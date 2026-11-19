import { afterEach, describe, expect, it, vi } from "vitest";
import { translatorFor } from "@/i18n/messages";
import { ApiClientError, apiRequest, apiUrl, describeApiError, loginRedirectPath } from "./api-client";

const zh = translatorFor("zh-CN");
const english = translatorFor("en");

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
    expect(describeApiError(error, "fallback", zh)).toContain("12 秒");
    expect(describeApiError(error, "fallback", english)).toContain("12 seconds");
  });

  it("reports network failures and keeps feature-specific fallbacks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    const error = await apiRequest("/api/review").catch((cause: unknown) => cause);
    expect(error).toMatchObject({ kind: "network", status: 0 });
    expect(describeApiError(new ApiClientError({ status: 409, code: "CONFLICT", message: "x" }), "收藏失败", zh))
      .toBe("收藏失败");
    expect(describeApiError(new Error("other"), "fallback", zh)).toBe("fallback");
    expect(describeApiError(new ApiClientError({ status: 503, code: "SERVICE_UNAVAILABLE", message: "x" }), "成长记录加载失败", zh))
      .toBe("成长记录加载失败");
  });

  it("prefers the server's localized reason over the generic sign-in message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(
      { error: "Sign in again to confirm this is your account before exporting account data.", code: "UNAUTHORIZED", messageKey: "reauthExport" },
      { status: 401 },
    )));
    const error = await apiRequest("/api/learner/export").catch((cause: unknown) => cause);
    expect(error).toMatchObject({ messageKey: "reauthExport" });
    expect(describeApiError(error, "fallback", zh)).toBe("导出账号数据前请重新登录，以确认这是你的账号。");
    expect(describeApiError(error, "fallback", english)).toMatch(/^Sign in again/);
    const unknownKey = new ApiClientError({ status: 401, code: "UNAUTHORIZED", message: "x" });
    expect(describeApiError(unknownKey, "fallback", english)).toBe("Your sign-in has expired. Please sign in again.");
  });

  it("builds login redirects that return to the current page", () => {
    expect(loginRedirectPath("/review?tab=saved")).toBe("/login?next=%2Freview%3Ftab%3Dsaved");
  });
});
