import {
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId,
} from "./social-providers";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_AUTH_VALUE_LENGTH = 4096;

export type OAuthSmokePhase =
  | "configuration"
  | "discovery"
  | "csrf"
  | "initiation"
  | "authorization";

export type OAuthDeploymentSmokeErrorCode =
  | "EOAUTH_SMOKE_AUTHORIZATION"
  | "EOAUTH_SMOKE_CALLBACK"
  | "EOAUTH_SMOKE_CONFIRMATION"
  | "EOAUTH_SMOKE_CSRF"
  | "EOAUTH_SMOKE_DISCOVERY"
  | "EOAUTH_SMOKE_EXPECTATIONS"
  | "EOAUTH_SMOKE_INITIATION"
  | "EOAUTH_SMOKE_ORIGIN"
  | "EOAUTH_SMOKE_PROVIDER_MISSING"
  | "EOAUTH_SMOKE_PROVIDER_UNEXPECTED"
  | "EOAUTH_SMOKE_TIMEOUT";

const ERROR_MESSAGES: Record<OAuthDeploymentSmokeErrorCode, string> = {
  EOAUTH_SMOKE_AUTHORIZATION: "A provider returned an invalid authorization request.",
  EOAUTH_SMOKE_CALLBACK: "A provider returned an unexpected callback URI.",
  EOAUTH_SMOKE_CONFIRMATION: "OAUTH_SMOKE_CONFIRM_INITIATE=1 is required before initiating provider requests.",
  EOAUTH_SMOKE_CSRF: "The deployment did not issue a usable Auth.js CSRF proof.",
  EOAUTH_SMOKE_DISCOVERY: "The deployment did not return a valid social-provider catalog.",
  EOAUTH_SMOKE_EXPECTATIONS: "OAUTH_SMOKE_EXPECT must map at least one supported provider to an expected authorization host.",
  EOAUTH_SMOKE_INITIATION: "The deployment could not initiate the provider request.",
  EOAUTH_SMOKE_ORIGIN: "The OAuth smoke target must be an HTTPS origin without credentials, path, query, or fragment; HTTP is allowed only for loopback testing.",
  EOAUTH_SMOKE_PROVIDER_MISSING: "An expected social provider is not configured on the deployment.",
  EOAUTH_SMOKE_PROVIDER_UNEXPECTED: "The deployment exposes an OAuth/OIDC provider that was not included in the expected provider set.",
  EOAUTH_SMOKE_TIMEOUT: "The OAuth smoke timeout must be an integer from 1 through 60000 milliseconds.",
};

export class OAuthDeploymentSmokeError extends Error {
  readonly code: OAuthDeploymentSmokeErrorCode;
  readonly phase: OAuthSmokePhase;
  readonly provider?: SocialProviderId;

  constructor(
    code: OAuthDeploymentSmokeErrorCode,
    phase: OAuthSmokePhase,
    provider?: SocialProviderId,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "OAuthDeploymentSmokeError";
    this.code = code;
    this.phase = phase;
    this.provider = provider;
  }
}

export function isOAuthDeploymentSmokeError(error: unknown): error is OAuthDeploymentSmokeError {
  try {
    return error instanceof OAuthDeploymentSmokeError;
  } catch {
    return false;
  }
}

function deploymentOrigin(value: string | undefined) {
  let parsed: URL;
  try {
    parsed = new URL(value?.trim() ?? "");
  } catch {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_ORIGIN", "configuration");
  }
  const loopbackHttp = parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !loopbackHttp)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_ORIGIN", "configuration");
  }
  return parsed.origin;
}

function expectedProviders(value: string | undefined) {
  const expectations = new Map<SocialProviderId, string>();
  const entries = value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    const provider = entry.slice(0, separator).trim();
    const host = entry.slice(separator + 1).trim().toLowerCase();
    if (
      separator <= 0
      || !isSocialProviderId(provider)
      || !HOSTNAME_PATTERN.test(host)
      || expectations.has(provider)
    ) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_EXPECTATIONS", "configuration");
    }
    expectations.set(provider, host);
  }
  if (!expectations.size) {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_EXPECTATIONS", "configuration");
  }
  return expectations;
}

export function oauthDeploymentSmokeConfiguration({
  confirmation,
  expectations,
  origin,
}: {
  confirmation?: string;
  expectations?: string;
  origin?: string;
}) {
  if (confirmation?.trim() !== "1") {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_CONFIRMATION", "configuration");
  }
  return {
    origin: deploymentOrigin(origin),
    expectations: expectedProviders(expectations),
  };
}

async function jsonObject(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_JSON_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function storeCookies(response: Response, cookies: Map<string, string>) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (/^[A-Za-z0-9_.-]{1,128}$/.test(name) && value && value.length <= MAX_AUTH_VALUE_LENGTH) {
      cookies.set(name, value);
    }
  }
}

function cookieHeader(cookies: Map<string, string>) {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function boundedFetch(
  fetcher: typeof fetch,
  url: URL,
  timeoutMs: number,
  init: RequestInit = {},
) {
  try {
    return await fetcher(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
  } catch {
    return null;
  }
}

export async function runOAuthDeploymentSmoke({
  confirmation,
  expectations: rawExpectations,
  fetcher = fetch,
  origin: rawOrigin,
  timeoutMs = 10_000,
}: {
  confirmation?: string;
  expectations?: string;
  fetcher?: typeof fetch;
  origin?: string;
  timeoutMs?: number;
}) {
  const { origin, expectations } = oauthDeploymentSmokeConfiguration({
    confirmation,
    expectations: rawExpectations,
    origin: rawOrigin,
  });
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_TIMEOUT", "configuration");
  }

  const catalogResponse = await boundedFetch(
    fetcher,
    new URL("/api/auth/providers", origin),
    timeoutMs,
    { headers: { Accept: "application/json" } },
  );
  if (!catalogResponse?.ok) {
    throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_DISCOVERY", "discovery");
  }
  const catalog = await jsonObject(catalogResponse);
  if (!catalog) throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_DISCOVERY", "discovery");

  const configuredProviders = new Set<SocialProviderId>();
  for (const [catalogId, entry] of Object.entries(catalog)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = entry as Record<string, unknown>;
    if (value.type !== "oauth" && value.type !== "oidc") continue;
    if (typeof value.id !== "string" || value.id !== catalogId) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_DISCOVERY", "discovery");
    }
    if (!isSocialProviderId(value.id)) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_PROVIDER_UNEXPECTED", "discovery");
    }
    configuredProviders.add(value.id);
  }
  for (const provider of expectations.keys()) {
    if (!configuredProviders.has(provider)) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_PROVIDER_MISSING", "discovery", provider);
    }
  }
  for (const provider of SOCIAL_PROVIDER_IDS) {
    if (configuredProviders.has(provider) && !expectations.has(provider)) {
      throw new OAuthDeploymentSmokeError(
        "EOAUTH_SMOKE_PROVIDER_UNEXPECTED",
        "discovery",
        provider,
      );
    }
  }

  const verified: Array<{ provider: SocialProviderId; authorizationHost: string }> = [];
  for (const [provider, authorizationHost] of expectations) {
    const cookies = new Map<string, string>();
    const csrfResponse = await boundedFetch(
      fetcher,
      new URL("/api/auth/csrf", origin),
      timeoutMs,
      { headers: { Accept: "application/json" } },
    );
    if (!csrfResponse?.ok) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_CSRF", "csrf", provider);
    }
    storeCookies(csrfResponse, cookies);
    const csrf = await jsonObject(csrfResponse);
    const csrfToken = csrf?.csrfToken;
    if (
      typeof csrfToken !== "string"
      || !csrfToken
      || csrfToken.length > MAX_AUTH_VALUE_LENGTH
      || ![...cookies.keys()].some((name) => name.endsWith("authjs.csrf-token"))
    ) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_CSRF", "csrf", provider);
    }

    const signInResponse = await boundedFetch(
      fetcher,
      new URL(`/api/auth/signin/${encodeURIComponent(provider)}`, origin),
      timeoutMs,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieHeader(cookies),
          Origin: origin,
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/login" }),
      },
    );
    if (!signInResponse?.ok) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_INITIATION", "initiation", provider);
    }
    const signIn = await jsonObject(signInResponse);
    if (typeof signIn?.url !== "string" || signIn.url.length > 16_384) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_INITIATION", "initiation", provider);
    }

    let authorization: URL;
    try {
      authorization = new URL(signIn.url);
    } catch {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_AUTHORIZATION", "authorization", provider);
    }
    const clientIds = authorization.searchParams.getAll("client_id");
    const states = authorization.searchParams.getAll("state");
    const responseTypes = authorization.searchParams.getAll("response_type");
    const clientId = clientIds[0] ?? "";
    const state = states[0] ?? "";
    if (
      authorization.protocol !== "https:"
      || authorization.username
      || authorization.password
      || authorization.port
      || authorization.hash
      || authorization.hostname.toLowerCase() !== authorizationHost
      || clientIds.length !== 1
      || !clientId.trim()
      || clientId.length > MAX_AUTH_VALUE_LENGTH
      || states.length !== 1
      || !state.trim()
      || state.length > MAX_AUTH_VALUE_LENGTH
      || responseTypes.length !== 1
      || responseTypes[0] !== "code"
    ) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_AUTHORIZATION", "authorization", provider);
    }
    const expectedCallback = `${origin}/api/auth/callback/${provider}`;
    const callbackUris = authorization.searchParams.getAll("redirect_uri");
    if (callbackUris.length !== 1 || callbackUris[0] !== expectedCallback) {
      throw new OAuthDeploymentSmokeError("EOAUTH_SMOKE_CALLBACK", "authorization", provider);
    }
    verified.push({ provider, authorizationHost });
  }

  return {
    providers: verified,
    checks: [
      "provider-discovery",
      "csrf-cookie",
      "authorization-initiation",
      "authorization-host",
      "authorization-state",
      "callback-uri",
    ],
  };
}
