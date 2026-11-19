import type { ApiErrorCode } from "@/lib/api";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "invalid"
  | "rate-limited"
  | "unavailable"
  | "server"
  | "network";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | null;
  readonly kind: ApiErrorKind;
  readonly retryAfterSeconds: number | null;
  readonly details: unknown;

  constructor(input: {
    status: number;
    code: ApiErrorCode | null;
    message: string;
    retryAfterSeconds?: number | null;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
    this.kind = errorKind(input.status);
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.details = input.details;
  }
}

function errorKind(status: number): ApiErrorKind {
  if (status === 0) return "network";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limited";
  if (status === 503) return "unavailable";
  if (status >= 400 && status < 500) return "invalid";
  return "server";
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  // Pages that only make sense for a signed-in learner send an expired session
  // back to login instead of rendering a dead-end error.
  onUnauthorized?: "redirect" | "throw";
};

export function loginRedirectPath(currentPath: string) {
  return `/login?${new URLSearchParams({ next: currentPath })}`;
}

export function apiUrl(path: string, query?: ApiRequestOptions["query"]) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(apiUrl(path, options.query), {
      method,
      cache: "no-store",
      signal: options.signal,
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiClientError({ status: 0, code: null, message: "Network request failed" });
  }

  if (response.ok) return await response.json() as T;

  const payload = await response.json().catch(() => null) as { error?: unknown; code?: unknown; details?: unknown } | null;
  const retryAfter = Number(response.headers.get("Retry-After"));
  const error = new ApiClientError({
    status: response.status,
    code: typeof payload?.code === "string" ? payload.code as ApiErrorCode : null,
    message: typeof payload?.error === "string" ? payload.error : `Request failed with status ${response.status}`,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    details: payload?.details,
  });
  if (error.kind === "unauthorized" && options.onUnauthorized === "redirect" && typeof window !== "undefined") {
    window.location.assign(loginRedirectPath(`${window.location.pathname}${window.location.search}`));
  }
  throw error;
}

// Shared learner-facing wording for transport-level failures. Feature-specific
// failures fall back to the caller's own message.
export function describeApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.kind === "network") return "网络连接失败，请检查网络后重试。";
  if (error.kind === "rate-limited") {
    return error.retryAfterSeconds
      ? `操作太频繁了，请在 ${error.retryAfterSeconds} 秒后再试。`
      : "操作太频繁了，请稍后再试。";
  }
  if (error.kind === "unavailable") return "服务暂时不可用，请稍后再试。";
  if (error.kind === "unauthorized") return "登录已过期，请重新登录。";
  return fallback;
}
