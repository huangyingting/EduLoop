import { isErrorMessageKey, type ErrorMessageKey, type Translator } from "@/i18n/messages";
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
  readonly messageKey: ErrorMessageKey | null;

  constructor(input: {
    status: number;
    code: ApiErrorCode | null;
    message: string;
    retryAfterSeconds?: number | null;
    details?: unknown;
    messageKey?: ErrorMessageKey | null;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
    this.kind = errorKind(input.status);
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.details = input.details;
    this.messageKey = input.messageKey ?? null;
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

// Builds the typed error for a failed response, for callers that need the raw
// Response (for example, file downloads).
export async function apiErrorFromResponse(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: unknown; code?: unknown; details?: unknown; messageKey?: unknown } | null;
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new ApiClientError({
    status: response.status,
    code: typeof payload?.code === "string" ? payload.code as ApiErrorCode : null,
    message: typeof payload?.error === "string" ? payload.error : `Request failed with status ${response.status}`,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    details: payload?.details,
    messageKey: isErrorMessageKey(payload?.messageKey) ? payload.messageKey : null,
  });
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

  const error = await apiErrorFromResponse(response);
  if (error.kind === "unauthorized" && options.onUnauthorized === "redirect" && typeof window !== "undefined") {
    window.location.assign(loginRedirectPath(`${window.location.pathname}${window.location.search}`));
  }
  throw error;
}

// Shared learner-facing wording for failures the learner can act on (network,
// rate limit, a specific server reason, expired login). Everything else,
// including a temporary 503, uses the caller's feature-specific message, which
// says what failed to load.
export function describeApiError(error: unknown, fallback: string, t: Translator) {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.kind === "network") return t("apiClient.network");
  if (error.kind === "rate-limited") {
    return error.retryAfterSeconds
      ? t("apiClient.rateLimitedFor", { seconds: error.retryAfterSeconds })
      : t("apiClient.rateLimited");
  }
  if (error.messageKey) return t(`errors.${error.messageKey}`);
  if (error.kind === "unauthorized") return t("apiClient.sessionExpired");
  return fallback;
}
