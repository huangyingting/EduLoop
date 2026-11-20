import { describe, expect, it, vi } from "vitest";
import { questionAssetKey, questionAssetOrigin, questionAssetResponse } from "./question-asset-store";

describe("question asset store", () => {
  it("accepts only bare HTTPS origins", () => {
    expect(questionAssetOrigin({})).toBeNull();
    expect(questionAssetOrigin({ QUESTION_ASSET_ORIGIN: "https://assets.example/content/" })).toBe("https://assets.example/content");
    expect(questionAssetOrigin({ QUESTION_ASSET_ORIGIN: "http://assets.example" })).toBeNull();
    expect(questionAssetOrigin({ QUESTION_ASSET_ORIGIN: "https://assets.example/?sig=secret" })).toBeNull();
  });

  it("maps safe image paths and rejects traversal or other file types", () => {
    expect(questionAssetKey(["source", "amc", `${"a".repeat(64)}.png`])).toEqual({ path: `question-assets/source/amc/${"a".repeat(64)}.png`, contentType: "image/png" });
    expect(questionAssetKey(["..", "secret.png"])).toBeNull();
    expect(questionAssetKey(["source", "amc", "manifest.json"])).toBeNull();
    expect(questionAssetKey([])).toBeNull();
  });

  it("streams the stored image with a fixed content type and cache policy", async () => {
    const fetcher = vi.fn(async () => new Response("<svg/>", { status: 200, headers: { "content-type": "text/html" } }));
    const response = await questionAssetResponse("https://assets.example", ["generated", "zh-CN", "q1", "stem.svg"], fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://assets.example/question-assets/generated/zh-CN/q1/stem.svg", expect.anything());
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(await response.text()).toBe("<svg/>");
  });

  it("maps upstream failures without leaking upstream bodies", async () => {
    expect((await questionAssetResponse("https://assets.example", ["a.png"], async () => new Response("gone", { status: 404 }))).status).toBe(404);
    const failed = await questionAssetResponse("https://assets.example", ["a.png"], async () => new Response("secret detail", { status: 500 }));
    expect(failed.status).toBe(502);
    expect(await failed.text()).toBe("Asset store unavailable");
    expect((await questionAssetResponse("https://assets.example", ["a.png"], async () => { throw new Error("down"); })).status).toBe(502);
  });
});
