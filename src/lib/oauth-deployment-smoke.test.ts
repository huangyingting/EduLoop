import { describe, expect, it, vi } from "vitest";
import {
  OAuthDeploymentSmokeError,
  oauthDeploymentSmokeConfiguration,
  runOAuthDeploymentSmoke,
} from "./oauth-deployment-smoke";

const origin = "https://learn.example";
const expectations = "google=accounts.google.com,microsoft-entra-id=login.microsoftonline.com,facebook=www.facebook.com";
const hosts = {
  google: "accounts.google.com",
  "microsoft-entra-id": "login.microsoftonline.com",
  facebook: "www.facebook.com",
};

function providerCatalog(providers: Array<keyof typeof hosts> = ["google"]) {
  return Object.fromEntries(providers.map((provider) => [
    provider,
    {
      id: provider,
      type: provider === "facebook" ? "oauth" : "oidc",
    },
  ]));
}

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("Expected OAuth smoke configuration to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(OAuthDeploymentSmokeError);
    expect(error).toMatchObject({ code });
  }
}

function healthyFetcher(overrides: {
  callback?: string;
  csrfCookie?: string | null;
  csrfToken?: unknown;
  host?: string;
  initiationStatus?: number;
  mutateAuthorization?: (authorization: URL) => void;
  providers?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    if (url.pathname === "/api/auth/providers") {
      return Response.json(overrides.providers ?? {
        credentials: { id: "credentials", type: "credentials" },
        ...providerCatalog(),
      });
    }
    if (url.pathname === "/api/auth/csrf") {
      const cookie = overrides.csrfCookie === undefined
        ? "__Host-authjs.csrf-token=cookie-proof; Path=/; HttpOnly; Secure; SameSite=Lax"
        : overrides.csrfCookie;
      return Response.json({ csrfToken: overrides.csrfToken ?? "csrf-proof" }, {
        headers: cookie ? { "Set-Cookie": cookie } : undefined,
      });
    }
    const provider = url.pathname.split("/").at(-1) as keyof typeof hosts;
    const body = new URLSearchParams(String(init.body));
    expect(body.get("csrfToken")).toBe("csrf-proof");
    expect(body.get("callbackUrl")).toBe("/login");
    expect(new Headers(init.headers).get("cookie")).toContain("__Host-authjs.csrf-token=cookie-proof");
    const callback = overrides.callback ?? `${origin}/api/auth/callback/${provider}`;
    const host = overrides.host ?? hosts[provider];
    const authorization = new URL(`https://${host}/authorize`);
    authorization.searchParams.set("client_id", "private-client-id");
    authorization.searchParams.set("state", "private-state");
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("redirect_uri", callback);
    overrides.mutateAuthorization?.(authorization);
    return Response.json({ url: authorization.href }, {
      status: overrides.initiationStatus ?? 200,
    });
  });
  return { calls, fetcher };
}

describe("OAuth deployment smoke configuration", () => {
  it("requires explicit initiation confirmation first", () => {
    expectCode(() => oauthDeploymentSmokeConfiguration({
      origin,
      expectations: "google=private.example",
    }), "EOAUTH_SMOKE_CONFIRMATION");
  });

  it("accepts HTTPS origins and supported provider-to-host mappings", () => {
    const result = oauthDeploymentSmokeConfiguration({
      origin: `${origin}/`,
      expectations,
      confirmation: "1",
    });
    expect(result.origin).toBe(origin);
    expect([...result.expectations]).toEqual(Object.entries(hosts));
  });

  it("rejects unsafe targets and ambiguous expectations", () => {
    for (const target of [
      "http://learn.example",
      "https://user:secret@learn.example",
      "https://learn.example/login",
      "https://learn.example?private=value",
    ]) {
      expectCode(() => oauthDeploymentSmokeConfiguration({
        origin: target,
        expectations,
        confirmation: "1",
      }), "EOAUTH_SMOKE_ORIGIN");
    }
    for (const value of [
      "",
      "credentials=accounts.example",
      "google=https://accounts.google.com",
      "google=accounts.google.com,google=accounts.google.com",
      "google=localhost",
    ]) {
      expectCode(() => oauthDeploymentSmokeConfiguration({
        origin,
        expectations: value,
        confirmation: "1",
      }), "EOAUTH_SMOKE_EXPECTATIONS");
    }
  });
});

describe("deployed OAuth initiation", () => {
  it("rejects an invalid timeout before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher,
      timeoutMs: 0,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_TIMEOUT",
      phase: "configuration",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("verifies discovery, CSRF, authorization requests, and exact callbacks", async () => {
    const { calls, fetcher } = healthyFetcher({ providers: {
      credentials: { id: "credentials", type: "credentials" },
      ...providerCatalog(["google", "microsoft-entra-id", "facebook"]),
    } });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations,
      confirmation: "1",
      fetcher,
      timeoutMs: 500,
    })).resolves.toEqual({
      providers: Object.entries(hosts).map(([provider, authorizationHost]) => ({
        provider,
        authorizationHost,
      })),
      checks: [
        "provider-discovery",
        "csrf-cookie",
        "authorization-initiation",
        "authorization-host",
        "authorization-state",
        "callback-uri",
      ],
    });
    expect(calls.map(({ url }) => url.pathname)).toEqual([
      "/api/auth/providers",
      "/api/auth/csrf",
      "/api/auth/signin/google",
      "/api/auth/csrf",
      "/api/auth/signin/microsoft-entra-id",
      "/api/auth/csrf",
      "/api/auth/signin/facebook",
    ]);
  });

  it("fails when an expected provider is absent or malformed", async () => {
    const absent = healthyFetcher({
      providers: { google: { id: "google", type: "oidc" } },
    });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com,facebook=www.facebook.com",
      confirmation: "1",
      fetcher: absent.fetcher,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_PROVIDER_MISSING",
      phase: "discovery",
      provider: "facebook",
    });
  });

  it("rejects extra supported or unknown OAuth providers", async () => {
    const extraSupported = healthyFetcher({
      providers: providerCatalog(["google", "facebook"]),
    });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher: extraSupported.fetcher,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_PROVIDER_UNEXPECTED",
      phase: "discovery",
      provider: "facebook",
    });

    const unknown = healthyFetcher({
      providers: {
        google: { id: "google", type: "oidc" },
        "private-provider": { id: "private-provider", type: "oauth" },
      },
    });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher: unknown.fetcher,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_PROVIDER_UNEXPECTED",
      phase: "discovery",
      provider: undefined,
    });
  });

  it("requires both the CSRF token and its cookie", async () => {
    for (const options of [
      { csrfCookie: null },
      { csrfToken: "" },
    ]) {
      const { fetcher } = healthyFetcher(options);
      await expect(runOAuthDeploymentSmoke({
        origin,
        expectations: "google=accounts.google.com",
        confirmation: "1",
        fetcher,
      })).rejects.toMatchObject({
        code: "EOAUTH_SMOKE_CSRF",
        phase: "csrf",
        provider: "google",
      });
    }
  });

  it("rejects an unsuccessful provider initiation without reading private error details", async () => {
    const { fetcher } = healthyFetcher({ initiationStatus: 503 });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_INITIATION",
      phase: "initiation",
      provider: "google",
    });
  });

  it("rejects a wrong authorization host or callback without exposing request values", async () => {
    const wrongHost = healthyFetcher({ host: "private-provider.example" });
    let hostError: unknown;
    try {
      await runOAuthDeploymentSmoke({
        origin,
        expectations: "google=accounts.google.com",
        confirmation: "1",
        fetcher: wrongHost.fetcher,
      });
    } catch (error) {
      hostError = error;
    }
    expect(hostError).toMatchObject({ code: "EOAUTH_SMOKE_AUTHORIZATION", provider: "google" });
    expect(String(hostError)).not.toContain("private-provider.example");
    expect(String(hostError)).not.toContain("private-client-id");
    expect(String(hostError)).not.toContain("private-state");

    const wrongCallback = healthyFetcher({ callback: "https://private.example/callback" });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher: wrongCallback.fetcher,
    })).rejects.toMatchObject({ code: "EOAUTH_SMOKE_CALLBACK", provider: "google" });
  });

  it("rejects non-default ports, fragments, and ambiguous authorization parameters", async () => {
    for (const mutateAuthorization of [
      (authorization: URL) => { authorization.port = "8443"; },
      (authorization: URL) => { authorization.hash = "private-fragment"; },
      (authorization: URL) => { authorization.searchParams.append("state", "second-private-state"); },
      (authorization: URL) => { authorization.searchParams.set("response_type", "token"); },
    ]) {
      const { fetcher } = healthyFetcher({ mutateAuthorization });
      await expect(runOAuthDeploymentSmoke({
        origin,
        expectations: "google=accounts.google.com",
        confirmation: "1",
        fetcher,
      })).rejects.toMatchObject({
        code: "EOAUTH_SMOKE_AUTHORIZATION",
        phase: "authorization",
        provider: "google",
      });
    }
  });

  it("requires exactly one callback parameter", async () => {
    const { fetcher } = healthyFetcher({
      mutateAuthorization(authorization) {
        authorization.searchParams.append("redirect_uri", `${origin}/private-callback`);
      },
    });
    await expect(runOAuthDeploymentSmoke({
      origin,
      expectations: "google=accounts.google.com",
      confirmation: "1",
      fetcher,
    })).rejects.toMatchObject({
      code: "EOAUTH_SMOKE_CALLBACK",
      phase: "authorization",
      provider: "google",
    });
  });

  it("bounds malformed and oversized discovery bodies", async () => {
    const privateBody = "private-provider-detail".repeat(4_000);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(privateBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    let error: unknown;
    try {
      await runOAuthDeploymentSmoke({
        origin,
        expectations: "google=accounts.google.com",
        confirmation: "1",
        fetcher,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "EOAUTH_SMOKE_DISCOVERY" });
    expect(String(error)).not.toContain("private-provider-detail");
  });
});
