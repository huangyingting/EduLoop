import { describe, expect, it, vi } from "vitest";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { DELETE as disconnectCurrentProvider } from "@/app/api/auth/provider/route";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { credentialMinimizingAdapter } from "@/lib/auth-adapter";
import { disconnectProviderAccount } from "@/lib/provider-account";
import { providerUserId, providerMinimizationUserId, providerSocialUserId, providerRaceUserId, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("social provider connections", () => {
  it("disconnects a provider only after recent authentication and revokes stored credentials", async () => {
    const email = "provider-disconnect@example.com";
    const password = "provider-disconnect-password-123";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: providerUserId,
      ...consentData,
      email,
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      accounts: { create: [
        {
          type: "oauth",
          provider: "google",
          providerAccountId: "integration-google-account",
          access_token: "stored-google-access-token",
          refresh_token: "stored-google-refresh-token",
        },
        {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-microsoft-account",
          access_token: "stored-microsoft-access-token",
        },
      ] },
      sessions: { create: {
        sessionToken: "integration-provider-adapter-session",
        expires: expiresAt,
      } },
      emailVerificationTokens: { create: { tokenHash: "c".repeat(64), expiresAt } },
      emailChangeTokens: { create: {
        newEmail: "provider-pending@example.com",
        tokenHash: "d".repeat(64),
        expiresAt,
      } },
      passwordResetTokens: { create: { tokenHash: "e".repeat(64), expiresAt } },
    } });

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const staleCookie = await authCookie(
        providerUserId,
        0,
        Math.floor(Date.now() / 1000) - 11 * 60,
      );
      const stale = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        staleCookie,
      ));
      expect(stale.status).toBe(401);

      const cookie = await authCookie(providerUserId);
      const invalid = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "github" },
        cookie,
      ));
      expect(invalid.status).toBe(400);
      const absent = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "facebook" },
        cookie,
      ));
      expect(absent.status).toBe(404);

      const disconnected = await disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        cookie,
      ));
      expect(disconnected.status).toBe(200);
      expect(await disconnected.json()).toEqual({ disconnected: true, provider: "google" });
      expect(await prisma.account.findMany({
        where: { userId: providerUserId },
        select: { provider: true, access_token: true, refresh_token: true },
      })).toEqual([{
        provider: "microsoft-entra-id",
        access_token: "stored-microsoft-access-token",
        refresh_token: null,
      }]);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: providerUserId } })).toMatchObject({
        sessionVersion: 1,
      });
      expect(await prisma.session.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: providerUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie },
      }))).toBeNull();

      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop Google 登录连接已移除",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("persists provider identity without OAuth or OIDC bearer credentials", async () => {
    await prisma.user.create({ data: {
      id: providerMinimizationUserId,
      ...consentData,
      email: "provider-minimization@example.com",
      emailVerified: new Date(),
    } });
    const adapter = credentialMinimizingAdapter(PrismaAdapter(prisma));

    await adapter.linkAccount?.({
      userId: providerMinimizationUserId,
      type: "oidc",
      provider: "integration-oidc",
      providerAccountId: "integration-provider-identity",
      access_token: "integration-access-secret",
      refresh_token: "integration-refresh-secret",
      id_token: "integration-identity-secret",
      session_state: "integration-provider-session-secret",
      expires_at: 1_800_000_000,
      token_type: "bearer",
      scope: "openid email profile",
    });

    expect(await prisma.account.findUniqueOrThrow({
      where: { provider_providerAccountId: {
        provider: "integration-oidc",
        providerAccountId: "integration-provider-identity",
      } },
    })).toEqual({
      userId: providerMinimizationUserId,
      type: "oidc",
      provider: "integration-oidc",
      providerAccountId: "integration-provider-identity",
      access_token: null,
      refresh_token: null,
      id_token: null,
      session_state: null,
      expires_at: null,
      token_type: null,
      scope: null,
    });
  });

  it("never removes the final login method, including under concurrent disconnects", async () => {
    await prisma.user.create({ data: {
      id: providerSocialUserId,
      email: "provider-social-only@example.com",
      emailVerified: new Date(),
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "integration-social-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "integration-social-facebook" },
      ] },
    } });
    expect(await disconnectProviderAccount(providerSocialUserId, 0, "google")).toMatchObject({
      status: "DISCONNECTED",
    });
    expect(await disconnectProviderAccount(providerSocialUserId, 1, "facebook")).toEqual({
      status: "LAST_LOGIN_METHOD",
    });
    expect(await prisma.account.findMany({
      where: { userId: providerSocialUserId },
      select: { provider: true },
    })).toEqual([{ provider: "facebook" }]);

    await prisma.user.create({ data: {
      id: providerRaceUserId,
      email: "provider-race@example.com",
      emailVerified: new Date(),
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "integration-race-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "integration-race-facebook" },
      ] },
    } });
    const outcomes = await Promise.all([
      disconnectProviderAccount(providerRaceUserId, 0, "google"),
      disconnectProviderAccount(providerRaceUserId, 0, "facebook"),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual(["CONFLICT", "DISCONNECTED"]);
    expect(await prisma.account.count({ where: { userId: providerRaceUserId } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: providerRaceUserId } })).toMatchObject({
      sessionVersion: 1,
    });
  });
});
