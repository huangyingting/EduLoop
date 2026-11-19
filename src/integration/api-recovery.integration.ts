import { describe, expect, it, vi } from "vitest";
import { PATCH as completeEmailChange } from "@/app/api/auth/email-change/route";
import { PATCH as completeEmailVerification, POST as requestEmailVerification } from "@/app/api/auth/email-verification/route";
import { PATCH as completePasswordReset, POST as requestPasswordReset } from "@/app/api/auth/password-reset/route";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { hashEmailChangeToken } from "@/lib/email-change";
import { hashEmailVerificationToken } from "@/lib/email-verification";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { disconnectProviderAccount, linkProviderAccountSafely, providerAuthenticationSnapshot, providerSessionVersionForAuthentication } from "@/lib/provider-account";
import { passwordResetUserId, socialRecoveryUserId, verifiedRecoveryUserId, ownershipRaceUserId, proofLockRaceUserId, providerLinkRaceUserId, providerLoginSnapshotUserId, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("password and mailbox recovery", () => {
  it("recovers a password with a single-use emailed token and revokes old sessions", async () => {
    const email = "password-reset@example.com";
    const oldPassword = "old-reset-password-123";
    const newPassword = "new-reset-password-456";
    const registrationExpiresAt = new Date(Date.now() + 5 * 60_000);
    await prisma.user.create({ data: {
      id: passwordResetUserId,
      ...consentData,
      email,
      passwordHash: await hashPassword(oldPassword),
      registrationExpiresAt,
      learner: { create: {} },
      sessions: { create: {
        sessionToken: "integration-password-reset-session",
        expires: new Date(Date.now() + 60 * 60_000),
      } },
      emailVerificationTokens: { create: {
        tokenHash: "8".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });
    const oldCookie = await authCookie(passwordResetUserId);
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const unknown = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email: "missing@example.com" },
      ));
      const requested = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email: `  ${email.toUpperCase()}  ` },
      ));
      expect(unknown.status).toBe(202);
      expect(requested.status).toBe(202);
      expect(await unknown.json()).toEqual(await requested.clone().json());
      expect(emailFetch).toHaveBeenCalledOnce();

      const delivery = emailFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      const emailBody = JSON.parse(String(delivery?.body)) as { text: string };
      const token = emailBody.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      const issuedReset = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashPasswordResetToken(token!) },
      });
      expect(issuedReset).toMatchObject({ userId: passwordResetUserId });
      expect(issuedReset!.expiresAt.getTime()).toBeLessThanOrEqual(registrationExpiresAt.getTime());
      await prisma.emailChangeToken.create({ data: {
        userId: passwordResetUserId,
        newEmail: "password-reset-pending@example.com",
        tokenHash: "b".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });

      const unchanged = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: oldPassword },
      ));
      expect(unchanged.status).toBe(400);
      expect(await prisma.passwordResetToken.count({ where: { userId: passwordResetUserId } })).toBe(1);

      const completed = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword },
      ));
      expect(completed.status).toBe(200);
      expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 0 });
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: passwordResetUserId } });
      expect(await verifyPassword(newPassword, updated.passwordHash!)).toBe(true);
      expect(updated.sessionVersion).toBe(1);
      expect(updated.emailVerified).toBeInstanceOf(Date);
      expect(updated.registrationExpiresAt).toBeNull();
      expect(await prisma.session.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: passwordResetUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      expect(emailFetch).toHaveBeenCalledTimes(2);
      const notice = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop 密码已更新",
      });

      const replay = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: "another-password-789" },
      ));
      expect(replay.status).toBe(400);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("transfers an unverified social account to the proven mailbox owner", async () => {
    const email = "social-recovery@example.com";
    const nextPassword = "social-recovery-password-456";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: socialRecoveryUserId,
      ...consentData,
      email,
      accounts: { create: [
        {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-social-recovery-microsoft",
        },
        {
          type: "oauth",
          provider: "facebook",
          providerAccountId: "integration-social-recovery-facebook",
        },
      ] },
      sessions: { create: {
        sessionToken: "integration-social-recovery-session",
        expires: expiresAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "9".repeat(64),
        expiresAt,
      } },
    } });
    const staleCookie = await authCookie(socialRecoveryUserId);
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", emailFetch);

    try {
      const genericVerification = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email },
      ));
      expect(genericVerification.status).toBe(202);
      expect(emailFetch).not.toHaveBeenCalled();
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialRecoveryUserId } })).toBe(1);

      const requested = await requestPasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "POST",
        { email },
      ));
      expect(requested.status).toBe(202);
      expect(emailFetch).toHaveBeenCalledOnce();
      const delivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { text: string };
      const token = delivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();

      const completed = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token, newPassword: nextPassword },
      ));
      expect(completed.status).toBe(200);
      expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 2 });
      const secured = await prisma.user.findUniqueOrThrow({ where: { id: socialRecoveryUserId } });
      expect(secured).toMatchObject({ emailVerified: expect.any(Date), sessionVersion: 1 });
      expect(await verifyPassword(nextPassword, secured.passwordHash!)).toBe(true);
      expect(await prisma.account.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: socialRecoveryUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: staleCookie },
      }))).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("preserves trusted providers when a verified account resets its password", async () => {
    const token = "verified-recovery-token-".padEnd(43, "v");
    const verificationToken = "verified-recovery-verification".padEnd(43, "e");
    const oldPassword = "verified-recovery-old-password";
    const newPassword = "verified-recovery-new-password";
    await prisma.user.create({ data: {
      id: verifiedRecoveryUserId,
      ...consentData,
      email: "verified-recovery@example.com",
      emailVerified: new Date(),
      passwordHash: await hashPassword(oldPassword),
      accounts: { create: {
        type: "oauth",
        provider: "google",
        providerAccountId: "integration-verified-recovery-google",
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const completed = await completePasswordReset(request(
      "http://localhost/api/auth/password-reset",
      "PATCH",
      { token, newPassword },
    ));
    expect(completed.status).toBe(200);
    expect(await completed.json()).toEqual({ changed: true, providersDisconnected: 0 });
    expect(await prisma.account.count({ where: { userId: verifiedRecoveryUserId } })).toBe(1);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: verifiedRecoveryUserId } });
    expect(updated.sessionVersion).toBe(1);
    expect(await verifyPassword(newPassword, updated.passwordHash!)).toBe(true);

    await prisma.emailVerificationToken.create({ data: {
      userId: verifiedRecoveryUserId,
      tokenHash: hashEmailVerificationToken(verificationToken),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    } });
    const verifiedAgain = await completeEmailVerification(request(
      "http://localhost/api/auth/email-verification",
      "PATCH",
      { token: verificationToken, password: newPassword },
    ));
    expect(verifiedAgain.status).toBe(200);
    expect(await verifiedAgain.json()).toEqual({ verified: true, providersDisconnected: 0 });
    expect(await prisma.account.count({ where: { userId: verifiedRecoveryUserId } })).toBe(1);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: verifiedRecoveryUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 2,
    });
  });

  it("serializes competing mailbox proofs without retaining an untrusted provider", async () => {
    const verificationToken = "ownership-verification-token".padEnd(43, "e");
    const resetToken = "ownership-password-reset-token".padEnd(43, "r");
    const currentPassword = "ownership-race-current-password";
    const resetPassword = "ownership-race-reset-password";
    await prisma.user.create({ data: {
      id: ownershipRaceUserId,
      ...consentData,
      email: "ownership-race@example.com",
      passwordHash: await hashPassword(currentPassword),
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-ownership-race-microsoft",
      } },
      emailVerificationTokens: { create: {
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const outcomes = await Promise.all([
      completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token: verificationToken, password: currentPassword },
      )),
      completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token: resetToken, newPassword: resetPassword },
      )),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(outcomes.every(({ status }) => [200, 400, 409].includes(status))).toBe(true);
    expect(await prisma.account.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: ownershipRaceUserId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ownershipRaceUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 1,
    });
  });

  it("uses one lock order for verification and login-email confirmation", async () => {
    const verificationToken = "proof-lock-verification-token".padEnd(43, "v");
    const emailChangeToken = "proof-lock-email-change-token".padEnd(43, "c");
    const password = "proof-lock-current-password";
    const oldEmail = "proof-lock-old@example.com";
    const newEmail = "proof-lock-new@example.com";
    await prisma.user.create({ data: {
      id: proofLockRaceUserId,
      ...consentData,
      email: oldEmail,
      passwordHash: await hashPassword(password),
      emailVerificationTokens: { create: {
        tokenHash: hashEmailVerificationToken(verificationToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
      emailChangeTokens: { create: {
        newEmail,
        tokenHash: hashEmailChangeToken(emailChangeToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });

    const outcomes = await Promise.all([
      completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token: verificationToken, password },
      )),
      completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token: emailChangeToken },
      )),
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(outcomes.every(({ status }) => [200, 400, 409].includes(status))).toBe(true);
    expect(await prisma.emailVerificationToken.count({ where: { userId: proofLockRaceUserId } })).toBe(0);
    expect(await prisma.emailChangeToken.count({ where: { userId: proofLockRaceUserId } })).toBe(0);
    const secured = await prisma.user.findUniqueOrThrow({ where: { id: proofLockRaceUserId } });
    expect([oldEmail, newEmail]).toContain(secured.email);
    expect(secured).toMatchObject({ emailVerified: expect.any(Date), sessionVersion: 1 });
  });

  it("cannot restore an untrusted provider after mailbox recovery wins", async () => {
    const resetToken = "provider-link-race-reset-token".padEnd(43, "r");
    const nextPassword = "provider-link-race-password";
    await prisma.user.create({ data: {
      id: providerLinkRaceUserId,
      ...consentData,
      email: "provider-link-race@example.com",
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-provider-link-race-microsoft",
      } },
      passwordResetTokens: { create: {
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } },
    } });
    const pendingLink = {
      userId: providerLinkRaceUserId,
      type: "oauth" as const,
      provider: "facebook",
      providerAccountId: "integration-provider-link-race-facebook",
    };

    const [recovery, link] = await Promise.all([
      completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token: resetToken, newPassword: nextPassword },
      )),
      linkProviderAccountSafely(pendingLink, 0).then(
        () => "LINKED" as const,
        () => "REJECTED" as const,
      ),
    ]);
    expect(recovery.status).toBe(200);
    expect(["LINKED", "REJECTED"]).toContain(link);
    expect(await prisma.account.count({ where: { userId: providerLinkRaceUserId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: providerLinkRaceUserId } })).toMatchObject({
      emailVerified: expect.any(Date),
      sessionVersion: 1,
    });
    await expect(linkProviderAccountSafely(pendingLink, 0)).rejects.toThrow();
    expect(await prisma.account.count({ where: { userId: providerLinkRaceUserId } })).toBe(0);
  });

  it("binds provider login to its connected account and rejects implicit relinking", async () => {
    const providerAccountId = "integration-provider-login-snapshot-google";
    const snapshot = await providerAuthenticationSnapshot("google", providerAccountId);
    expect(snapshot).toBeNull();

    const securedAccount = await prisma.user.create({ data: {
      id: providerLoginSnapshotUserId,
      email: "provider-login-snapshot@example.com",
      emailVerified: new Date(),
      passwordHash: await hashPassword("provider-login-snapshot-password"),
      accounts: { create: {
        type: "oauth",
        provider: "google",
        providerAccountId,
      } },
    } });
    const connected = await providerAuthenticationSnapshot("google", providerAccountId);
    expect(connected).toEqual({ userId: securedAccount.id, sessionVersion: 0 });
    expect(providerSessionVersionForAuthentication(connected, securedAccount.id, false, 0)).toBe(0);

    await expect(disconnectProviderAccount(
      securedAccount.id,
      0,
      "google",
    )).resolves.toEqual({
      status: "DISCONNECTED",
      email: "provider-login-snapshot@example.com",
    });
    expect(providerSessionVersionForAuthentication(connected, securedAccount.id, false, 1)).toBeNull();
    expect(providerSessionVersionForAuthentication(null, securedAccount.id, false, 1)).toBeNull();
    expect(providerSessionVersionForAuthentication(null, securedAccount.id, true, 0)).toBe(0);

    await expect(linkProviderAccountSafely({
      userId: securedAccount.id,
      type: "oauth",
      provider: "google",
      providerAccountId,
    }, undefined)).rejects.toThrow();
    expect(await prisma.account.count({ where: { userId: securedAccount.id } })).toBe(0);
    await prisma.user.delete({ where: { id: securedAccount.id } });
  });
});
