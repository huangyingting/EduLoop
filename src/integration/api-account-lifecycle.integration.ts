import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { DELETE as deleteCurrentAccount, PATCH as updateCurrentAccount } from "@/app/api/auth/account/route";
import { PATCH as completeEmailVerification } from "@/app/api/auth/email-verification/route";
import { DELETE as disconnectCurrentProvider } from "@/app/api/auth/provider/route";
import { DELETE as revokeCurrentSessions } from "@/app/api/auth/sessions/route";
import { DELETE as deleteLearner } from "@/app/api/learner/route";
import { PATCH as updateStudioReport } from "@/app/api/studio/reports/route";
import { prisma } from "@/lib/prisma";
import { changeAccountPassword, deleteAccount, deleteLearningData, revokeAccountSessions } from "@/lib/account";
import { AUTH_SESSION_COOKIE, getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { SENSITIVE_ACTION_MAX_AGE_SECONDS } from "@/lib/auth-validation";
import { transitionContentReport } from "@/lib/content-review";
import { issueEmailChangeToken } from "@/lib/email-change";
import { disconnectProviderAccount } from "@/lib/provider-account";
import { subjectId, bandId, gradeId, choiceId, headers, lifecycleUserId, socialPasswordUserId, sessionRevocationUserId, deletionRaceUserId, reportErasureUserIds, reportErasureQuestionIds, reportErasureReportIds, emailChangeIssuanceRaceUserId, sensitiveMutationRaceUserId, sensitiveMutationRaceReportId, consentData, request, responseCookie, authCookie, revokeAfterNextUserLookup, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("account lifecycle and erasure", () => {
  it("rotates account passwords, revokes sessions, and erases the full account", async () => {
    const oldPassword = "old-password-123";
    const newPassword = "new-password-456";
    const competingPassword = "competing-password-789";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: lifecycleUserId,
      ...consentData,
      email: "lifecycle@example.com",
      passwordHash: await hashPassword(oldPassword),
      learner: { create: { xp: 17 } },
      emailChangeTokens: { create: {
        newEmail: "lifecycle-pending@example.com",
        tokenHash: "a".repeat(64),
        expiresAt,
      } },
      emailVerificationTokens: { create: { tokenHash: "f".repeat(64), expiresAt } },
      passwordResetTokens: { create: { tokenHash: "9".repeat(64), expiresAt } },
      sessions: { create: { sessionToken: "integration-lifecycle-session", expires: expiresAt } },
    } });

    expect(await changeAccountPassword(lifecycleUserId, 0, "wrong-password", newPassword)).toBe("INVALID_PASSWORD");
    expect(await changeAccountPassword(lifecycleUserId, 0, oldPassword, oldPassword)).toBe("UNCHANGED");
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
    const cookie = await authCookie(lifecycleUserId);
    let winningPassword = newPassword;
    try {
      const passwordResponses = await Promise.all([
        updateCurrentAccount(request(
          "http://localhost/api/auth/account",
          "PATCH",
          { currentPassword: oldPassword, newPassword },
          cookie,
        )),
        updateCurrentAccount(request(
          "http://localhost/api/auth/account",
          "PATCH",
          { currentPassword: oldPassword, newPassword: competingPassword },
          cookie,
        )),
      ]);
      expect(passwordResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
      const successfulIndex = passwordResponses.findIndex(({ status }) => status === 200);
      winningPassword = successfulIndex === 0 ? newPassword : competingPassword;
      expect(await passwordResponses[successfulIndex]!.json()).toEqual({ changed: true });
      expect(await passwordResponses[successfulIndex === 0 ? 1 : 0]!.json()).toMatchObject({
        code: "CONFLICT",
      });
      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; subject: string };
      expect(notice).toMatchObject({
        to: ["lifecycle@example.com"],
        subject: "你的 EduLoop 密码已更新",
      });
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: lifecycleUserId } });
      expect(await verifyPassword(winningPassword, updated.passwordHash!)).toBe(true);
      expect(updated.sessionVersion).toBe(1);
      expect(await prisma.session.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: lifecycleUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie },
      }))).toBeNull();

      const currentCookie = await authCookie(lifecycleUserId, 1);
      const wrongDeletion = await deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: "wrong-password" },
        currentCookie,
      ));
      expect(wrongDeletion.status).toBe(401);
      const deleted = await deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: winningPassword },
        currentCookie,
      ));
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ deleted: true });
      expect(emailFetch).toHaveBeenCalledTimes(2);
      const deletionNotice = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { to: string[]; subject: string };
      expect(deletionNotice).toMatchObject({
        to: ["lifecycle@example.com"],
        subject: "你的 EduLoop 账号已删除",
      });
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: currentCookie },
      }))).toBeNull();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
    expect(await prisma.user.findUnique({ where: { id: lifecycleUserId } })).toBeNull();
    expect(await prisma.learnerProfile.findUnique({ where: { userId: lifecycleUserId } })).toBeNull();
  });

  it("requires mailbox verification when an untrusted social account sets a password", async () => {
    const email = "social-password@example.com";
    const password = "social-password-123";
    const expiresAt = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: socialPasswordUserId,
      ...consentData,
      email,
      accounts: { create: {
        type: "oidc",
        provider: "microsoft-entra-id",
        providerAccountId: "integration-social-password-microsoft",
      } },
      learner: { create: {} },
      sessions: { create: {
        sessionToken: "integration-social-password-session",
        expires: expiresAt,
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
          email,
          password,
          callbackUrl: "http://localhost/privacy",
        }).toString(),
      }));
    }

    try {
      const oldCookie = await authCookie(socialPasswordUserId);
      const response = await updateCurrentAccount(request(
        "http://localhost/api/auth/account",
        "PATCH",
        { newPassword: password },
        oldCookie,
      ));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        changed: true,
        verificationRequired: true,
        verificationScheduled: true,
      });
      expect(emailFetch).toHaveBeenCalledOnce();

      const delivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as {
        subject: string;
        text: string;
        to: string[];
      };
      expect(delivery).toMatchObject({
        subject: "验证你的 EduLoop 邮箱",
        to: [email],
      });
      const token = delivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      await prisma.emailChangeToken.create({ data: {
        userId: socialPasswordUserId,
        newEmail: "social-password-pending@example.com",
        tokenHash: "6".repeat(64),
        expiresAt,
      } });
      await prisma.passwordResetToken.create({ data: {
        userId: socialPasswordUserId,
        tokenHash: "7".repeat(64),
        expiresAt,
      } });

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: socialPasswordUserId } });
      expect(await verifyPassword(password, stored.passwordHash!)).toBe(true);
      expect(stored).toMatchObject({ emailVerified: null, sessionVersion: 1 });
      expect(await prisma.session.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      expect(await disconnectProviderAccount(socialPasswordUserId, 1, "microsoft-entra-id")).toEqual({
        status: "LAST_LOGIN_METHOD",
      });

      const blocked = await credentialsCallback();
      expect(responseCookie(blocked, AUTH_SESSION_COOKIE)).toBeNull();
      expect(await blocked.json()).toMatchObject({
        url: expect.stringContaining("code=email_not_verified"),
      });

      const wrongPassword = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password: "wrong-social-password" },
      ));
      expect(wrongPassword.status).toBe(401);
      expect(await prisma.account.count({ where: { userId: socialPasswordUserId } })).toBe(1);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialPasswordUserId } })).toBe(1);

      const verified = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token, password },
      ));
      expect(verified.status).toBe(200);
      expect(await verified.json()).toEqual({ verified: true, providersDisconnected: 1 });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: socialPasswordUserId } })).toMatchObject({
        emailVerified: expect.any(Date),
        sessionVersion: 2,
      });
      expect(await prisma.account.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: socialPasswordUserId } })).toBe(0);
      expect(await disconnectProviderAccount(socialPasswordUserId, 2, "microsoft-entra-id")).toEqual({
        status: "NOT_CONNECTED",
      });

      const signedIn = await credentialsCallback();
      expect(signedIn.status).toBe(200);
      expect(responseCookie(signedIn, AUTH_SESSION_COOKIE)).toBeTruthy();
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("revokes every account session once after recent authentication", async () => {
    const email = "session-revocation@example.com";
    const expires = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: sessionRevocationUserId,
      email,
      emailVerified: new Date(),
      sessions: { create: [
        { sessionToken: "integration-session-revocation-a", expires },
        { sessionToken: "integration-session-revocation-b", expires },
      ] },
      emailVerificationTokens: { create: {
        tokenHash: "session-revocation-verification".padEnd(64, "v"),
        expiresAt: expires,
      } },
      emailChangeTokens: { create: {
        newEmail: "session-revocation-pending@example.com",
        tokenHash: "session-revocation-email-change".padEnd(64, "c"),
        expiresAt: expires,
      } },
      passwordResetTokens: { create: {
        tokenHash: "session-revocation-password-reset".padEnd(64, "r"),
        expiresAt: expires,
      } },
    } });

    const staleCookie = await authCookie(
      sessionRevocationUserId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const bucketsBeforeStaleRequest = await prisma.rateLimitBucket.count();
    const stale = await revokeCurrentSessions(new Request("http://localhost/api/auth/sessions", {
      method: "DELETE",
      headers: { ...headers, cookie: staleCookie },
    }));
    expect(stale.status).toBe(401);
    expect(await stale.json()).toEqual({
      error: "Sign in again to confirm this is your account before signing out everywhere.",
      code: "UNAUTHORIZED",
      messageKey: "reauthRevokeSessions",
    });
    expect(await prisma.user.findUniqueOrThrow({
      where: { id: sessionRevocationUserId },
      select: { sessionVersion: true },
    })).toEqual({ sessionVersion: 0 });
    expect(await prisma.session.count({ where: { userId: sessionRevocationUserId } })).toBe(2);
    expect(await prisma.emailVerificationToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.emailChangeToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: sessionRevocationUserId } })).toBe(1);
    expect(await prisma.rateLimitBucket.count()).toBe(bucketsBeforeStaleRequest);

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
      const issuedAt = Math.floor(Date.now() / 1000);
      const oldCookies = await Promise.all([
        authCookie(sessionRevocationUserId, 0, issuedAt),
        authCookie(sessionRevocationUserId, 0, issuedAt - 1),
      ]);
      for (const cookie of oldCookies) {
        await expect(getSessionUser(new Request("http://localhost/api/learner", {
          headers: { cookie },
        }), { allowMissingConsent: true })).resolves.toMatchObject({
          id: sessionRevocationUserId,
          sessionVersion: 0,
          hasCurrentConsent: false,
        });
      }

      const responses = await Promise.all(oldCookies.map((cookie) => revokeCurrentSessions(
        new Request("http://localhost/api/auth/sessions", {
          method: "DELETE",
          headers: { ...headers, cookie },
        }),
      )));
      expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
      expect(responses.filter(({ status }) => status === 401 || status === 409)).toHaveLength(1);
      const successful = responses.find(({ status }) => status === 200)!;
      expect(await successful.json()).toEqual({ revoked: true });

      expect(await prisma.user.findUniqueOrThrow({
        where: { id: sessionRevocationUserId },
        select: { sessionVersion: true },
      })).toEqual({ sessionVersion: 1 });
      expect(await prisma.session.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.emailVerificationToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: sessionRevocationUserId } })).toBe(0);
      for (const cookie of oldCookies) {
        await expect(getSessionUser(new Request("http://localhost/api/learner", {
          headers: { cookie },
        }), { allowMissingConsent: true })).resolves.toBeNull();
      }

      expect(emailFetch).toHaveBeenCalledOnce();
      const notice = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as {
        to: string[];
        subject: string;
      };
      expect(notice).toMatchObject({
        to: [email],
        subject: "你的 EduLoop 登录会话已全部退出",
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.unstubAllGlobals();
    }
  });

  it("cannot leave an email-change proof after account-wide session revocation", async () => {
    const newEmail = "email-change-issuance-race-new@example.com";
    await prisma.user.create({ data: {
      id: emailChangeIssuanceRaceUserId,
      ...consentData,
      email: "email-change-issuance-race-old@example.com",
      emailVerified: new Date(),
    } });

    const issued = await issueEmailChangeToken(emailChangeIssuanceRaceUserId, newEmail, 0);
    expect(issued.status).toBe("ISSUED");
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(1);

    await expect(revokeAccountSessions(emailChangeIssuanceRaceUserId, 0)).resolves.toBe("REVOKED");
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(0);

    await expect(issueEmailChangeToken(
      emailChangeIssuanceRaceUserId,
      newEmail,
      0,
    )).resolves.toEqual({ status: "SECURITY_CONFLICT" });
    expect(await prisma.emailChangeToken.count({
      where: { userId: emailChangeIssuanceRaceUserId },
    })).toBe(0);
  });

  it("rejects sensitive mutations whose authenticated session is revoked in flight", async () => {
    const password = "sensitive-mutation-race-password";
    await prisma.user.create({ data: {
      id: sensitiveMutationRaceUserId,
      ...consentData,
      email: "sensitive-mutation-race@example.com",
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      role: "CONTENT_EDITOR",
      learner: { create: {} },
      accounts: { create: [
        { type: "oauth", provider: "google", providerAccountId: "sensitive-mutation-race-google" },
        { type: "oauth", provider: "facebook", providerAccountId: "sensitive-mutation-race-facebook" },
      ] },
    } });
    const learner = await prisma.learnerProfile.findUniqueOrThrow({
      where: { userId: sensitiveMutationRaceUserId },
    });
    await prisma.questionReport.create({ data: {
      id: sensitiveMutationRaceReportId,
      learnerId: learner.id,
      questionId: choiceId,
      category: "UNCLEAR",
      detail: "A revoked operator request must not change content.",
    } });

    const passwordChange = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      0,
      async () => updateCurrentAccount(request(
        "http://localhost/api/auth/account",
        "PATCH",
        { currentPassword: password, newPassword: "stale-session-password" },
        await authCookie(sensitiveMutationRaceUserId, 0),
      )),
    );
    expect(passwordChange.status).toBe(409);
    expect(await passwordChange.json()).toMatchObject({ code: "CONFLICT" });
    let secured = await prisma.user.findUniqueOrThrow({ where: { id: sensitiveMutationRaceUserId } });
    expect(secured.sessionVersion).toBe(1);
    expect(await verifyPassword(password, secured.passwordHash!)).toBe(true);

    const providerDisconnect = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      1,
      async () => disconnectCurrentProvider(request(
        "http://localhost/api/auth/provider",
        "DELETE",
        { provider: "google" },
        await authCookie(sensitiveMutationRaceUserId, 1),
      )),
    );
    expect(providerDisconnect.status).toBe(409);
    expect(await prisma.account.count({ where: { userId: sensitiveMutationRaceUserId } })).toBe(2);

    const learningDeletion = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      2,
      async () => deleteLearner(new NextRequest("http://localhost/api/learner", {
        method: "DELETE",
        headers: {
          ...headers,
          cookie: await authCookie(sensitiveMutationRaceUserId, 2),
        },
      })),
    );
    expect(learningDeletion.status).toBe(409);
    expect(await prisma.learnerProfile.findUnique({
      where: { userId: sensitiveMutationRaceUserId },
    })).toBeTruthy();

    const accountDeletion = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      3,
      async () => deleteCurrentAccount(request(
        "http://localhost/api/auth/account",
        "DELETE",
        { currentPassword: password },
        await authCookie(sensitiveMutationRaceUserId, 3),
      )),
    );
    expect(accountDeletion.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: sensitiveMutationRaceUserId } })).toBeTruthy();

    const studioTransition = await revokeAfterNextUserLookup(
      sensitiveMutationRaceUserId,
      4,
      async () => updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH",
        headers: {
          ...headers,
          cookie: await authCookie(sensitiveMutationRaceUserId, 4),
        },
        body: JSON.stringify({
          reportId: sensitiveMutationRaceReportId,
          action: "QUARANTINE",
          note: "This transition must lose to session revocation.",
        }),
      })),
    );
    expect(studioTransition.status).toBe(409);
    expect(await studioTransition.json()).toMatchObject({ code: "CONFLICT" });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: choiceId } })).toMatchObject({
      status: "PUBLISHED",
    });
    expect(await prisma.questionReport.findUniqueOrThrow({
      where: { id: sensitiveMutationRaceReportId },
    })).toMatchObject({ status: "OPEN" });
    expect(await prisma.contentReviewAction.count({
      where: { reportId: sensitiveMutationRaceReportId },
    })).toBe(0);

    secured = await prisma.user.findUniqueOrThrow({ where: { id: sensitiveMutationRaceUserId } });
    expect(secured.sessionVersion).toBe(5);
    expect(await verifyPassword(password, secured.passwordHash!)).toBe(true);
    expect(await prisma.account.count({ where: { userId: sensitiveMutationRaceUserId } })).toBe(2);
  });

  it("serializes account erasure against a concurrent password rotation", async () => {
    const oldPassword = "deletion-race-old-password";
    const newPassword = "deletion-race-new-password";
    await prisma.user.create({ data: {
      id: deletionRaceUserId,
      ...consentData,
      email: "deletion-race@example.com",
      passwordHash: await hashPassword(oldPassword),
      learner: { create: { xp: 23 } },
    } });

    const [passwordOutcome, deletionOutcome] = await Promise.all([
      changeAccountPassword(deletionRaceUserId, 0, oldPassword, newPassword),
      deleteAccount(deletionRaceUserId, 0, oldPassword),
    ]);
    expect([
      passwordOutcome === "UPDATED",
      deletionOutcome === "DELETED",
    ].filter(Boolean)).toHaveLength(1);

    if (passwordOutcome === "UPDATED") {
      expect(deletionOutcome).toBe("CONFLICT");
      expect(await prisma.learnerProfile.findUnique({ where: { userId: deletionRaceUserId } })).toBeTruthy();
      expect(await deleteAccount(deletionRaceUserId, 1, newPassword)).toBe("DELETED");
    } else {
      expect(passwordOutcome).toBe("CONFLICT");
      expect(deletionOutcome).toBe("DELETED");
    }
    expect(await prisma.user.findUnique({ where: { id: deletionRaceUserId } })).toBeNull();
    expect(await prisma.learnerProfile.findUnique({ where: { userId: deletionRaceUserId } })).toBeNull();
  });

  it("anonymizes reporter data without orphaning moderation work during erasure", async () => {
    const accountPassword = "report-erasure-account-password";
    await prisma.question.createMany({ data: reportErasureQuestionIds.map((id) => ({
      id,
      sourceId: id,
      sourceFile: "integration.json",
      sourceType: "解答题",
      type: "WRITTEN_RESPONSE",
      difficulty: "MEDIUM",
      stem: `待审核题目 ${id}`,
      answer: "待核对",
      explanation: "待核对",
      importStatus: "PUBLISHED",
      status: "NEEDS_REVIEW",
      quarantinedAt: new Date("2026-08-01T01:00:00.000Z"),
      isAutoGradable: false,
      subjectId,
      gradeBandId: bandId,
      gradeId,
    })) });
    await prisma.user.create({ data: {
      id: reportErasureUserIds[0],
      ...consentData,
      email: "report-erasure-learning@example.com",
      learner: { create: {} },
    } });
    await prisma.user.create({ data: {
      id: reportErasureUserIds[1],
      ...consentData,
      email: "report-erasure-account@example.com",
      passwordHash: await hashPassword(accountPassword),
      learner: { create: {} },
    } });
    const reporters = await prisma.learnerProfile.findMany({
      where: { userId: { in: [...reportErasureUserIds] } },
      orderBy: { userId: "asc" },
      select: { id: true, userId: true },
    });
    const learnerIdByUser = new Map(reporters.map((reporter) => [reporter.userId, reporter.id]));
    await prisma.questionReport.createMany({ data: reportErasureReportIds.map((id, index) => ({
      id,
      learnerId: learnerIdByUser.get(reportErasureUserIds[index])!,
      questionId: reportErasureQuestionIds[index],
      category: "UNCLEAR",
      detail: `reporter free text ${index}`,
    })) });
    await prisma.contentReviewAction.createMany({ data: reportErasureReportIds.map((reportId, index) => ({
      id: `integration-report-erasure-action-${index}`,
      reportId,
      action: "QUARANTINE",
      note: "Preserve this operator decision after reporter erasure.",
      createdAt: new Date("2026-08-01T01:00:00.000Z"),
    })) });

    expect(await deleteLearningData(reportErasureUserIds[0], 0)).toBe("DELETED");
    expect(await deleteAccount(reportErasureUserIds[1], 0, accountPassword)).toBe("DELETED");

    for (let index = 0; index < reportErasureReportIds.length; index += 1) {
      const reportId = reportErasureReportIds[index];
      expect(await prisma.questionReport.findUniqueOrThrow({ where: { id: reportId } })).toMatchObject({
        learnerId: null,
        questionId: reportErasureQuestionIds[index],
        detail: null,
        status: "OPEN",
        reporterErasedAt: expect.any(Date),
      });
      expect(await prisma.contentReviewAction.count({ where: { reportId } })).toBe(1);
      await expect(transitionContentReport({
        reportId,
        action: "RESOLVE",
        note: "The retained anonymous report remains actionable.",
      })).resolves.toEqual({ status: "UPDATED", questionId: reportErasureQuestionIds[index] });
      expect(await prisma.question.findUniqueOrThrow({
        where: { id: reportErasureQuestionIds[index] },
      })).toMatchObject({ status: "PUBLISHED", quarantinedAt: null });
      expect(await prisma.contentReviewAction.count({ where: { reportId } })).toBe(2);
    }

    expect(await prisma.user.findUnique({ where: { id: reportErasureUserIds[0] } })).toBeTruthy();
    expect(await prisma.user.findUnique({ where: { id: reportErasureUserIds[1] } })).toBeNull();
  });
});
