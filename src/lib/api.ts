import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isDatabaseUnavailableError } from "./database-errors";
import { errorLogMetadata } from "./logging";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const MAX_JSON_BODY_BYTES = 32 * 1024;

export type ApiErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED";

export function apiError(error: string, status: number, code: ApiErrorCode, details?: unknown) {
  return NextResponse.json({ error, code, ...(details === undefined ? {} : { details }) }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function readJsonBody(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("JSON body limit must be a positive integer.");
  }

  const contentLength = request.headers.get("content-length")?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
      await request.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        response: apiError("Request body too large", 413, "PAYLOAD_TOO_LARGE", { maxBytes }),
      };
    }
  }

  if (!request.body) return { ok: true, value: null };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {
          ok: false,
          response: apiError("Request body too large", 413, "PAYLOAD_TOO_LARGE", { maxBytes }),
        };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: true, value: null };
  } finally {
    reader.releaseLock();
  }
}

function requestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export function apiHandler<TRequest extends Request>(
  route: string,
  handler: (request: TRequest) => Promise<Response>,
) {
  return async (request: TRequest) => {
    const id = requestId(request);
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      const databaseUnavailable = isDatabaseUnavailableError(error);
      console.error(JSON.stringify({
        level: "error",
        event: "api_request_failed",
        route,
        requestId: id,
        method: request.method,
        ...errorLogMetadata(error),
      }));
      response = databaseUnavailable
        ? apiError("Service unavailable", 503, "SERVICE_UNAVAILABLE")
        : apiError("Internal server error", 500, "INTERNAL_ERROR");
    }

    const durationMs = Math.max(0, performance.now() - startedAt);
    // Several public routes become learner-specific when an Auth.js cookie is
    // present. Default every application API response to no-store so a browser,
    // reverse proxy, or future route refactor cannot reuse one learner's data.
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", "no-store");
    }
    response.headers.set("X-Request-Id", id);
    response.headers.set("Server-Timing", `app;dur=${durationMs.toFixed(1)}`);

    if (process.env.NODE_ENV === "production") {
      const entry = JSON.stringify({
        level: response.status >= 500 ? "error" : "info",
        event: "api_request_completed",
        route,
        requestId: id,
        method: request.method,
        status: response.status,
        durationMs: Number(durationMs.toFixed(1)),
      });
      if (response.status >= 500) console.error(entry);
      else console.info(entry);
    }
    return response;
  };
}

export type RateLimitPolicy =
  | { addressLimit: number; identity?: never; identityLimit?: never }
  | { addressLimit?: number; identity: string; identityLimit: number };

export async function enforceRateLimit(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  windowMs = 60_000,
) {
  // Keep the API response/telemetry wrapper free of Prisma initialization so
  // the process-liveness route cannot become coupled to database availability.
  // Server module imports are cached after the first rate-limited request.
  const {
    addressRateLimitKey,
    checkRateLimit,
    clientAddress,
    identityRateLimitKey,
  } = await import("./rate-limit");

  if (policy.addressLimit !== undefined) {
    const addressResult = await checkRateLimit(
      addressRateLimitKey(scope, clientAddress(request)),
      policy.addressLimit,
      windowMs,
    );
    if (!addressResult.allowed) {
      const response = apiError("Too many requests", 429, "RATE_LIMITED");
      response.headers.set("Retry-After", String(addressResult.retryAfter));
      return response;
    }
  }

  if (!("identity" in policy)) return null;
  if (!policy.identity) throw new RangeError("Rate-limit identity must not be empty.");
  const identityResult = await checkRateLimit(
    identityRateLimitKey(scope, policy.identity),
    policy.identityLimit,
    windowMs,
  );
  if (identityResult.allowed) return null;
  const response = apiError("Too many requests", 429, "RATE_LIMITED");
  response.headers.set("Retry-After", String(identityResult.retryAfter));
  return response;
}
