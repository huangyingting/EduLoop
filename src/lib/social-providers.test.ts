import { describe, expect, it, vi } from "vitest";
import { loadSocialProviders, requestProviderAuthorization } from "./social-providers";

const origin = "https://eduloop.example";

describe("social provider browser client", () => {
  it("loads only configured, recognized OAuth and OIDC providers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      credentials: { id: "credentials", name: "Credentials", type: "credentials" },
      google: { id: "google", name: "Google", type: "oidc" },
      "microsoft-entra-id": { id: "microsoft-entra-id", name: "Microsoft Entra ID", type: "oidc" },
      private: { id: "private", name: "Private", type: "oauth" },
    }), { status: 200 }));

    await expect(loadSocialProviders({ fetcher, origin })).resolves.toEqual([
      { id: "google", name: "Google" },
      { id: "microsoft-entra-id", name: "Microsoft Entra ID" },
    ]);
    expect(fetcher).toHaveBeenCalledWith(`${origin}/api/auth/providers`, expect.objectContaining({
      cache: "no-store",
    }));
  });

  it("uses one fixed failure for rejected, malformed, and private provider responses", async () => {
    const rejected = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      message: "postgresql://operator:secret@private.example/database",
    }), { status: 503 }));
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));

    await expect(loadSocialProviders({ fetcher: rejected, origin }))
      .rejects.toThrow("Social provider request is unavailable.");
    await expect(loadSocialProviders({ fetcher: malformed, origin }))
      .rejects.toThrow("Social provider request is unavailable.");
  });

  it("starts a provider request with a same-origin callback and CSRF proof", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-proof" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: "https://accounts.example/authorize?state=provider-state",
      }), { status: 200 }));

    await expect(requestProviderAuthorization("google", "/progress?tab=week", { fetcher, origin }))
      .resolves.toEqual({
        ok: true,
        url: "https://accounts.example/authorize?state=provider-state",
      });
    const request = fetcher.mock.calls[1];
    expect(request?.[0]).toBe(`${origin}/api/auth/signin/google`);
    const body = request?.[1]?.body as URLSearchParams;
    expect(body.get("csrfToken")).toBe("csrf-proof");
    expect(body.get("callbackUrl")).toBe("/progress?tab=week");
  });

  it("returns bounded Auth.js error codes instead of navigating to an error page", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-proof" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        url: `${origin}/login?error=Configuration&code=private-detail`,
      }), { status: 200 }));

    await expect(requestProviderAuthorization("facebook", "/privacy", { fetcher, origin }))
      .resolves.toEqual({ ok: false, error: "Configuration", code: "private-detail" });
  });

  it("refuses external callbacks, insecure provider redirects, and malformed responses", async () => {
    const unused = vi.fn<typeof fetch>();
    await expect(requestProviderAuthorization("google", "https://attacker.example", { fetcher: unused, origin }))
      .rejects.toThrow("Social provider request is unavailable.");
    expect(unused).not.toHaveBeenCalled();

    const insecure = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-proof" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "http://accounts.example/authorize" }), { status: 200 }));
    await expect(requestProviderAuthorization("google", "/", { fetcher: insecure, origin }))
      .rejects.toThrow("Social provider request is unavailable.");
  });
});
