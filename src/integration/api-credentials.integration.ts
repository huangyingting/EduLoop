import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { PATCH as completeEmailVerification, POST as requestEmailVerification } from "@/app/api/auth/email-verification/route";
import { POST as registerAccount } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/prisma";
import { AUTH_SESSION_COOKIE, PASSWORD_HASH_COST, authenticatePasswordCredentials, getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { hashEmailVerificationToken } from "@/lib/email-verification";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { bandId, headers, passwordUpgradeRaceUserId, staleCredentialsLoginUserId, authJsEmail, expiredRegistrationEmail, consentData, request, responseCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("credentials registration and sign-in", () => {
  it("verifies a registered email before signing in through the credentials callback", async () => {
    const password = "authjs-password-123";
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

    async function credentialsCallback() {
      const csrfResponse = await authGet(new NextRequest("http://localhost/api/auth/csrf"));
      const csrf = await csrfResponse.json() as { csrfToken: string };
      const csrfCookie = responseCookie(csrfResponse, "authjs.csrf-token");
      expect(csrfCookie).toBeTruthy();
      return authPost(new NextRequest("http://localhost/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: csrfCookie!,
          "x-auth-return-redirect": "1",
        },
        body: new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email: authJsEmail,
          password,
          callbackUrl: "http://localhost/progress",
        }).toString(),
      }));
    }

    try {
      const registration = await registerAccount(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { ...headers, origin: "https://learn.example" },
        body: JSON.stringify({ email: authJsEmail, password, displayName: "Auth.js 学习者", knowledgeBand: "integration-middle", consentBasis: "ADULT", acceptedTerms: true }),
      }));
      expect(registration.status).toBe(201);
      expect(await registration.json()).toMatchObject({ created: true, verificationRequired: true });
      expect(await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).toMatchObject({
        emailVerified: null,
        registrationExpiresAt: expect.any(Date),
      });

      const blocked = await credentialsCallback();
      expect(responseCookie(blocked, AUTH_SESSION_COOKIE)).toBeNull();
      expect(await blocked.json()).toMatchObject({
        url: expect.stringContaining("code=email_not_verified"),
      });

      const unknown = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email: "missing-verification@example.com" },
      ));
      const resent = await requestEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "POST",
        { email: authJsEmail.toUpperCase() },
      ));
      expect(unknown.status).toBe(202);
      expect(resent.status).toBe(202);
      expect(await unknown.json()).toEqual(await resent.clone().json());
      expect(emailFetch).toHaveBeenCalledTimes(2);

      const delivery = emailFetch.mock.calls[1]?.[1] as RequestInit | undefined;
      const emailBody = JSON.parse(String(delivery?.body)) as { text: string };
      const token = emailBody.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      expect(await prisma.emailVerificationToken.findUnique({
        where: { tokenHash: hashEmailVerificationToken(token!) },
      })).toMatchObject({ userId: expect.any(String) });

      const wrongPassword = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password: "not-the-registration-password" },
      ));
      expect(wrongPassword.status).toBe(401);
      expect((await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).emailVerified).toBeNull();
      expect(await prisma.emailVerificationToken.count({
        where: { tokenHash: hashEmailVerificationToken(token!) },
      })).toBe(1);

      const verified = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(verified.status).toBe(200);
      expect(await verified.json()).toEqual({ verified: true, providersDisconnected: 0 });
      expect(await prisma.user.findUniqueOrThrow({ where: { email: authJsEmail } })).toMatchObject({
        emailVerified: expect.any(Date),
        registrationExpiresAt: null,
        sessionVersion: 1,
      });
      expect(await prisma.emailVerificationToken.count({ where: { tokenHash: hashEmailVerificationToken(token!) } })).toBe(0);

      const replay = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(replay.status).toBe(400);

      const callback = await credentialsCallback();
      expect(callback.status).toBe(200);
      const sessionCookie = responseCookie(callback, AUTH_SESSION_COOKIE);
      expect(sessionCookie).toBeTruthy();
      const sessionUser = await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: sessionCookie! },
      }));
      expect(sessionUser).toMatchObject({ email: authJsEmail, displayName: "Auth.js 学习者", hasPassword: true, hasCurrentConsent: true });
      expect(await prisma.consentRecord.findFirst({ where: { userId: sessionUser!.id } })).toMatchObject({
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
      expect(await prisma.learnerProfile.findUnique({
        where: { userId: sessionUser!.id },
        include: { knowledgeBand: true },
      })).toMatchObject({ knowledgeBand: { slug: "integration-middle" } });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("does not let a delayed legacy-hash upgrade overwrite a rotated password", async () => {
    const oldPassword = "legacy-login-password-123";
    const replacementPassword = "replacement-login-password-456";
    const replacementHash = await hashPassword(replacementPassword);
    await prisma.user.create({ data: {
      id: passwordUpgradeRaceUserId,
      ...consentData,
      email: "password-upgrade-race@example.com",
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash(oldPassword, PASSWORD_HASH_COST - 1),
    } });

    const originalUpdateMany = prisma.user.updateMany.bind(prisma.user) as unknown as (
      args: unknown,
    ) => Promise<{ count: number }>;
    const updateMany = vi.spyOn(prisma.user, "updateMany");
    const controllable = updateMany as unknown as {
      mockImplementationOnce: (
        implementation: (args: unknown) => Promise<{ count: number }>,
      ) => void;
    };
    controllable.mockImplementationOnce(async (args) => {
      await prisma.user.update({
        where: { id: passwordUpgradeRaceUserId },
        data: {
          passwordHash: replacementHash,
          sessionVersion: { increment: 1 },
        },
      });
      return originalUpdateMany(args);
    });

    try {
      await expect(authenticatePasswordCredentials(
        "password-upgrade-race@example.com",
        oldPassword,
      )).resolves.toBeNull();
    } finally {
      updateMany.mockRestore();
    }

    const secured = await prisma.user.findUniqueOrThrow({
      where: { id: passwordUpgradeRaceUserId },
      select: { passwordHash: true, sessionVersion: true },
    });
    expect(secured.sessionVersion).toBe(1);
    expect(await verifyPassword(replacementPassword, secured.passwordHash!)).toBe(true);
    expect(await verifyPassword(oldPassword, secured.passwordHash!)).toBe(false);
  });

  it("rejects a credentials login revoked after password proof instead of adopting the new version", async () => {
    const email = "stale-credentials-login@example.com";
    const password = "stale-credentials-password-123";
    await prisma.user.create({ data: {
      id: staleCredentialsLoginUserId,
      ...consentData,
      email,
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
    } });

    const csrfResponse = await authGet(new NextRequest("http://localhost/api/auth/csrf"));
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const csrfCookie = responseCookie(csrfResponse, "authjs.csrf-token");
    expect(csrfCookie).toBeTruthy();

    const originalUpdateMany = prisma.user.updateMany.bind(prisma.user) as unknown as (
      args: unknown,
    ) => Promise<{ count: number }>;
    const updateMany = vi.spyOn(prisma.user, "updateMany");
    const controllable = updateMany as unknown as {
      mockImplementationOnce: (
        implementation: (args: unknown) => Promise<{ count: number }>,
      ) => void;
    };
    controllable.mockImplementationOnce(async (args) => {
      const claimed = await originalUpdateMany(args);
      expect(claimed.count).toBe(1);
      const revoked = await originalUpdateMany({
        where: { id: staleCredentialsLoginUserId, sessionVersion: 0 },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(revoked.count).toBe(1);
      return claimed;
    });

    let callback: Response;
    try {
      callback = await authPost(new NextRequest("http://localhost/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: csrfCookie!,
          "x-auth-return-redirect": "1",
          "x-forwarded-for": "198.51.100.243",
        },
        body: new URLSearchParams({
          csrfToken: csrf.csrfToken,
          email,
          password,
          callbackUrl: "http://localhost/progress",
        }).toString(),
      }));
    } finally {
      updateMany.mockRestore();
    }

    expect(callback.status).toBe(200);
    expect(responseCookie(callback, AUTH_SESSION_COOKIE)).toBeNull();
    expect(await prisma.user.findUniqueOrThrow({
      where: { id: staleCredentialsLoginUserId },
      select: { sessionVersion: true },
    })).toEqual({ sessionVersion: 1 });
  });

  it("releases an expired unused email atomically when the mailbox owner registers again", async () => {
    const now = new Date();
    const originalUser = await prisma.user.create({ data: {
      email: expiredRegistrationEmail,
      passwordHash: await hashPassword("expired-registration-password"),
      registrationExpiresAt: new Date(now.getTime() - 1),
      learner: { create: { knowledgeBandId: bandId } },
      consentRecords: { create: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
      } },
    } });
    const previousEnvironment = {
      AUTH_URL: process.env.AUTH_URL,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.AUTH_URL = "https://learn.example";
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    const emailFetch = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", emailFetch);

    try {
      const registration = await registerAccount(new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { ...headers, origin: "https://learn.example" },
        body: JSON.stringify({
          email: expiredRegistrationEmail,
          password: "replacement-registration-password",
          displayName: "重新注册学习者",
          consentBasis: "GUARDIAN",
          acceptedTerms: true,
        }),
      }));
      expect(registration.status).toBe(201);
      expect(await registration.json()).toEqual({ created: true, verificationRequired: true });
      const replacement = await prisma.user.findUniqueOrThrow({
        where: { email: expiredRegistrationEmail },
        include: { learner: true, consentRecords: true },
      });
      expect(replacement.id).not.toBe(originalUser.id);
      expect(replacement).toMatchObject({
        emailVerified: null,
        registrationExpiresAt: expect.any(Date),
        learner: { displayName: "重新注册学习者" },
        consentRecords: [expect.objectContaining({
          basis: "GUARDIAN",
          method: "PASSWORD_REGISTRATION",
        })],
      });
      expect(replacement.registrationExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
      expect(emailFetch).toHaveBeenCalledOnce();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });
});
