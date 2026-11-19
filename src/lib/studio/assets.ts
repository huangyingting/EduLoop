import { createHash } from "node:crypto";

// Uploaded diagrams are raster images only. SVG is rejected: it can carry
// script, and the image optimizer has a history of SVG-related advisories.
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;

const SIGNATURES: Array<{ contentType: string; matches: (bytes: Uint8Array) => boolean }> = [
  { contentType: "image/png", matches: (bytes) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  { contentType: "image/jpeg", matches: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  {
    contentType: "image/webp",
    matches: (bytes) => bytes.length > 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
];

// The declared type is ignored; only the file's own signature counts.
export function detectImageType(bytes: Uint8Array) {
  return SIGNATURES.find(({ matches }) => matches(bytes))?.contentType ?? null;
}

export function assetDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const ASSET_ROLE_PATTERN = /^(?:STEM|OPTION_[A-E])$/;

// Served from our own origin, so lock the response down: no scripts, no
// embedding context, no MIME sniffing.
export function assetResponseHeaders(contentType: string, bytes: number) {
  return {
    "Content-Type": contentType,
    "Content-Length": String(bytes),
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
