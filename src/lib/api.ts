import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, clientAddress } from "./rate-limit";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ApiErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNAUTHORIZED";

export function apiError(error: string, status: number, code: ApiErrorCode, details?: unknown) {
  return NextResponse.json({ error, code, ...(details === undefined ? {} : { details }) }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    try {
      const response = await handler(request);
      // Several public routes become learner-specific when an Auth.js cookie is
      // present. Default every application API response to no-store so a browser,
      // reverse proxy, or future route refactor cannot reuse one learner's data.
      if (!response.headers.has("Cache-Control")) {
        response.headers.set("Cache-Control", "no-store");
      }
      response.headers.set("X-Request-Id", id);
      response.headers.set("Server-Timing", `app;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`);
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "api_request_failed",
        route,
        requestId: id,
        method: request.method,
        message: error instanceof Error ? error.message : "Unknown error",
      }));
      const response = apiError("Internal server error", 500, "INTERNAL_ERROR");
      response.headers.set("X-Request-Id", id);
      return response;
    }
  };
}

export async function enforceRateLimit(request: Request, scope: string, identity: string, limit: number, windowMs = 60_000) {
  const result = await checkRateLimit(`${scope}:${clientAddress(request)}:${identity}`, limit, windowMs);
  if (result.allowed) return null;
  const response = apiError("Too many requests", 429, "RATE_LIMITED");
  response.headers.set("Retry-After", String(result.retryAfter));
  return response;
}
