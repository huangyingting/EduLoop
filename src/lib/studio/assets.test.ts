import { describe, expect, it } from "vitest";
import { requiresSecondApprover } from "./revisions";
import { assetResponseHeaders, detectImageType } from "./assets";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

describe("studio asset uploads", () => {
  it("accepts only raster images by their own signature", () => {
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(webp)).toBe("image/webp");
    expect(detectImageType(svg)).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it("serves uploads sandboxed, unsniffable, and immutable", () => {
    expect(assetResponseHeaders("image/png", 10)).toMatchObject({
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  it("requires a second approver only when configured", () => {
    expect(requiresSecondApprover({ CONTENT_REQUIRE_SECOND_APPROVER: "true" })).toBe(true);
    expect(requiresSecondApprover({ CONTENT_REQUIRE_SECOND_APPROVER: "false" })).toBe(false);
    expect(requiresSecondApprover({})).toBe(false);
  });
});
