export const SOCIAL_PROVIDER_IDS = ["google", "microsoft-entra-id", "facebook"] as const;

export type SocialProviderId = typeof SOCIAL_PROVIDER_IDS[number];

export type SocialProvider = {
  id: SocialProviderId;
  name: string;
};

type ProviderClientOptions = {
  fetcher?: typeof fetch;
  origin?: string;
};

export type ProviderAuthorizationResult = {
  ok: true;
  url: string;
} | {
  ok: false;
  error: string;
  code: string | null;
};

const SOCIAL_PROVIDER_LABELS: Record<SocialProviderId, string> = {
  google: "Google",
  "microsoft-entra-id": "Microsoft",
  facebook: "Facebook",
};

export function socialProviderLabel(provider: SocialProviderId) {
  return SOCIAL_PROVIDER_LABELS[provider];
}

export function isSocialProviderId(provider: string): provider is SocialProviderId {
  return SOCIAL_PROVIDER_IDS.some((candidate) => candidate === provider);
}

function clientOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return explicitOrigin;
  if (typeof window !== "undefined") return window.location.origin;
  throw new Error("Social provider request is unavailable.");
}

async function jsonObject(response: Response) {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function unavailable(): never {
  throw new Error("Social provider request is unavailable.");
}

export async function loadSocialProviders(options: ProviderClientOptions = {}) {
  const origin = clientOrigin(options.origin);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/auth/providers`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return unavailable();
  }
  if (!response.ok) return unavailable();
  const body = await jsonObject(response);
  if (!body) return unavailable();

  return SOCIAL_PROVIDER_IDS.flatMap((id): SocialProvider[] => {
    const provider = body[id];
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) return [];
    const { id: responseId, name, type } = provider as Record<string, unknown>;
    if (responseId !== id || typeof name !== "string" || (type !== "oauth" && type !== "oidc")) return [];
    return [{ id, name }];
  });
}

export async function requestProviderAuthorization(
  provider: SocialProviderId,
  redirectTo: string,
  options: ProviderClientOptions = {},
): Promise<ProviderAuthorizationResult> {
  const origin = clientOrigin(options.origin);
  const fetcher = options.fetcher ?? fetch;
  let callbackUrl: URL;
  try {
    callbackUrl = new URL(redirectTo, origin);
  } catch {
    return unavailable();
  }
  if (callbackUrl.origin !== origin) return unavailable();

  let csrfResponse: Response;
  try {
    csrfResponse = await fetcher(`${origin}/api/auth/csrf`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return unavailable();
  }
  if (!csrfResponse.ok) return unavailable();
  const csrfBody = await jsonObject(csrfResponse);
  const csrfToken = csrfBody?.csrfToken;
  if (typeof csrfToken !== "string" || !csrfToken || csrfToken.length > 4096) return unavailable();

  let signInResponse: Response;
  try {
    signInResponse = await fetcher(`${origin}/api/auth/signin/${encodeURIComponent(provider)}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        csrfToken,
        callbackUrl: `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`,
      }),
    });
  } catch {
    return unavailable();
  }
  const signInBody = await jsonObject(signInResponse);
  if (!signInBody || typeof signInBody.url !== "string" || signInBody.url.length > 16_384) {
    return unavailable();
  }

  let target: URL;
  try {
    target = new URL(signInBody.url, origin);
  } catch {
    return unavailable();
  }
  if (target.protocol !== "https:" && target.origin !== origin) return unavailable();
  if (target.origin === origin) {
    const error = target.searchParams.get("error");
    if (error) return { ok: false, error, code: target.searchParams.get("code") };
  }
  if (!signInResponse.ok) return unavailable();
  return { ok: true, url: target.href };
}
