const CONTENT_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

// The object-storage origin holding a copy of public/question-assets, for
// example https://eduloopassets.blob.core.windows.net/content. Only HTTPS
// origins without a query or fragment are accepted.
export function questionAssetOrigin(environment: { QUESTION_ASSET_ORIGIN?: string } = { QUESTION_ASSET_ORIGIN: process.env.QUESTION_ASSET_ORIGIN }) {
  const value = environment.QUESTION_ASSET_ORIGIN?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash || url.username || url.password) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function questionAssetKey(segments: string[]) {
  if (!segments.length || segments.length > 4 || !segments.every((segment) => SEGMENT.test(segment) && !segment.includes(".."))) return null;
  const extension = segments.at(-1)!.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  return contentType ? { path: `question-assets/${segments.join("/")}`, contentType } : null;
}

export async function questionAssetResponse(origin: string, segments: string[], fetcher: Fetcher = fetch) {
  const key = questionAssetKey(segments);
  if (!key) return new Response("Not found", { status: 404 });
  let upstream: Response;
  try {
    upstream = await fetcher(`${origin}/${key.path}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    return new Response("Asset store unavailable", { status: 502 });
  }
  if (upstream.status === 404) return new Response("Not found", { status: 404 });
  const length = Number(upstream.headers.get("content-length"));
  if (!upstream.ok || !upstream.body || (Number.isFinite(length) && length > MAX_ASSET_BYTES)) {
    return new Response("Asset store unavailable", { status: 502 });
  }
  // Source figures are addressed by their SHA-256, so they never change.
  const immutable = key.path.startsWith("question-assets/source/");
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": key.contentType,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      ...(key.contentType === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
    },
  });
}
