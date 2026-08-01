import { describe, expect, it, vi } from "vitest";
import { emailConfiguration, sendAccountDeletedNotice, sendEmailChangedNotice, sendEmailChangeVerificationEmail, sendEmailDeliveryProbe, sendEmailVerificationEmail, sendLearningDataDeletedNotice, sendPasswordChangedNotice, sendPasswordResetEmail, sendProviderDisconnectedNotice, sendSessionsRevokedNotice } from "./email";
import { errorLogMetadata } from "./logging";

describe("account email delivery", () => {
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

  it("sends a link-free delivery probe with a non-identifying correlation ID", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response("private provider response", { status: 202 });
    });
    await sendEmailDeliveryProbe("operator@example.com", "0123456789abcdef", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "EduLoop <accounts@example.com>" },
      fetcher,
    });

    const [endpoint, init] = fetcher.mock.calls[0]!;
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-key" });
    const body = JSON.parse(String(init?.body)) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(body).toMatchObject({
      to: ["operator@example.com"],
      subject: "EduLoop email delivery probe 0123456789abcdef",
    });
    expect(body.text).toContain("No account action is required");
    expect(body.html).not.toContain("href=");
  });

  it("maps a rejected delivery probe to bounded provider status metadata", async () => {
    let error: unknown;
    try {
      await sendEmailDeliveryProbe("operator@example.com", "0123456789abcdef", {
        environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
        fetcher: async () => new Response("private provider detail", { status: 422 }),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ name: "EmailProviderResponseError", status: 422 });
    expect(errorLogMetadata(error)).toEqual({
      errorType: "EmailProviderResponseError",
      errorStatus: 422,
    });
    expect(String(error)).not.toContain("private provider detail");
  });

  it("sends a verification link without exposing an unescaped fragment", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendEmailVerificationEmail("learner@example.com", "https://learn.example/verify-email#token=a&b", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { subject: string; text: string; html: string };
    expect(body.subject).toBe("验证你的 EduLoop 邮箱");
    expect(body.text).toContain("#token=a&b");
    expect(body.html).toContain("#token=a&amp;b");
  });

  it("sends an escaped email-change link and notifies the previous address", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    const options = {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    };
    await sendEmailChangeVerificationEmail(
      "new@example.com",
      "https://learn.example/change-email#token=a&b",
      options,
    );
    await sendEmailChangedNotice("old@example.com", "new+tag@example.com", options);

    const verification = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; html: string };
    expect(verification).toMatchObject({
      to: ["new@example.com"],
      subject: "确认更改 EduLoop 登录邮箱",
    });
    expect(verification.html).toContain("#token=a&amp;b");
    const notice = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as { to: string[]; subject: string; html: string };
    expect(notice).toMatchObject({
      to: ["old@example.com"],
      subject: "你的 EduLoop 登录邮箱已更改",
    });
    expect(notice.html).toContain("new+tag@example.com");
  });

  it("sends a provider-disconnection security notice", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendProviderDisconnectedNotice("learner@example.com", "Google", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; text: string };
    expect(body).toMatchObject({
      to: ["learner@example.com"],
      subject: "你的 EduLoop Google 登录连接已移除",
    });
    expect(body.text).toContain("所有旧登录会话都已退出");
  });

  it("sends a password-change security notice", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendPasswordChangedNotice("learner@example.com", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; text: string };
    expect(body).toMatchObject({
      to: ["learner@example.com"],
      subject: "你的 EduLoop 密码已更新",
    });
    expect(body.text).toContain("未使用的账号验证链接都已失效");
  });

  it("sends an account-deletion confirmation", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendAccountDeletedNotice("learner@example.com", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; text: string };
    expect(body).toMatchObject({
      to: ["learner@example.com"],
      subject: "你的 EduLoop 账号已删除",
    });
    expect(body.text).toContain("在线学习数据已永久删除");
    expect(body.text).toContain("身份关联和自由文本已清除");
    expect(body.text).toContain("保留周期轮换清除");
  });

  it("sends a learning-data deletion confirmation while distinguishing the retained account", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendLearningDataDeletedNotice("learner@example.com", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; text: string };
    expect(body).toMatchObject({
      to: ["learner@example.com"],
      subject: "你的 EduLoop 学习数据已删除",
    });
    expect(body.text).toContain("身份关联和自由文本已清除");
    expect(body.text).toContain("登录账号和登录方式仍然保留");
    expect(body.text).toContain("保留周期轮换清除");
  });

  it("sends an all-device session revocation notice", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    await sendSessionsRevokedNotice("learner@example.com", {
      environment: { RESEND_API_KEY: "secret-key", AUTH_EMAIL_FROM: "accounts@example.com" },
      fetcher,
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string; text: string };
    expect(body).toMatchObject({
      to: ["learner@example.com"],
      subject: "你的 EduLoop 登录会话已全部退出",
    });
    expect(body.text).toContain("未使用的账号安全链接也已失效");
    expect(body.text).toContain("密码、登录邮箱和社交登录连接没有改变");
  });
});
