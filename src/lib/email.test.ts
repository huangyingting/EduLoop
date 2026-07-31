import { describe, expect, it, vi } from "vitest";
import { emailConfiguration, sendPasswordResetEmail } from "./email";

describe("password recovery email", () => {
  it("requires a complete provider configuration", () => {
    expect(emailConfiguration({})).toBeNull();
    expect(emailConfiguration({ RESEND_API_KEY: "key" })).toBeNull();
    expect(emailConfiguration({ RESEND_API_KEY: " key ", AUTH_EMAIL_FROM: " accounts@example.com " })).toEqual({
      apiKey: "key",
      from: "accounts@example.com",
    });
  });

  it("sends both plain text and escaped HTML through Resend", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendPasswordResetEmail("learner@example.com", "https://learn.example/reset-password#token=a&b", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "EduLoop <accounts@example.com>" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0]!;
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-key" });
    const body = JSON.parse(String(init?.body)) as { to: string[]; text: string; html: string };
    expect(body.to).toEqual(["learner@example.com"]);
    expect(body.text).toContain("#token=a&b");
    expect(body.html).toContain("#token=a&amp;b");
  });

  it("rejects provider failures without exposing response bodies", async () => {
    await expect(sendPasswordResetEmail("learner@example.com", "https://learn.example/reset-password", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher: async () => new Response("provider detail", { status: 503 }),
    })).rejects.toThrow("Password recovery email provider returned 503.");
  });
});
