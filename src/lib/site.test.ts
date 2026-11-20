import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";
import { publicOrigin } from "./site";

describe("public site surface", () => {
  it("lets visitors open only the landing page, practice, and the share image", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/practice")).toBe(true);
    expect(isPublicPath("/practice/anything")).toBe(true);
    expect(isPublicPath("/opengraph-image")).toBe(true);
    expect(isPublicPath("/progress")).toBe(false);
    expect(isPublicPath("/studio")).toBe(false);
    expect(isPublicPath("/practiced")).toBe(false);
  });

  it("derives the canonical origin from AUTH_URL", () => {
    expect(publicOrigin({ AUTH_URL: "https://learn.example/some/path" })).toBe("https://learn.example");
    expect(publicOrigin({ AUTH_URL: "not a url" })).toBe("http://localhost:3000");
    expect(publicOrigin({})).toBe("http://localhost:3000");
  });
});
