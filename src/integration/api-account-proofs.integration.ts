import { describe, expect, it, vi } from "vitest";
import { DELETE as deleteCurrentAccount, PATCH as updateCurrentAccount } from "@/app/api/auth/account/route";
import { PATCH as completeEmailChange, POST as requestEmailChange } from "@/app/api/auth/email-change/route";
import { PATCH as completeEmailVerification } from "@/app/api/auth/email-verification/route";
import { PATCH as completePasswordReset } from "@/app/api/auth/password-reset/route";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { deliverEmailChangeVerification, finalizeEmailChangeDelivery, hashEmailChangeToken, issueEmailChangeToken } from "@/lib/email-change";
import { deliverEmailVerification, finalizeEmailVerificationDelivery, issueEmailVerificationToken } from "@/lib/email-verification";
import { deliverPasswordReset, finalizePasswordResetDelivery, issuePasswordResetToken } from "@/lib/password-reset";
import { sensitiveUserId, emailChangeUserId, emailChangeConflictUserId, deliveryVerificationUserId, deliveryResetUserId, deliveryChangeUserId, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("email change and proof delivery", () => {
  it("verifies a new login email, handles address races, and revokes old sessions", async () => {
    const oldEmail = "email-change-old@example.com";
    const newEmail = "email-change-new@example.com";
    const password = "email-change-password-123";
    await prisma.user.create({ data: {
      id: emailChangeUserId,
      ...consentData,
      email: oldEmail,
      emailVerified: new Date(),
      passwordHash: await hashPassword(password),
      learner: { create: {} },
    } });
    const oldCookie = await authCookie(emailChangeUserId);
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
      const wrongPassword = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail, currentPassword: "wrong-password" },
        oldCookie,
      ));
      expect(wrongPassword.status).toBe(401);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);

      const requested = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail: `  ${newEmail.toUpperCase()}  `, currentPassword: password },
        oldCookie,
      ));
      expect(requested.status).toBe(202);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: emailChangeUserId } })).email).toBe(oldEmail);
      const firstDelivery = JSON.parse(String(emailFetch.mock.calls[0]?.[1]?.body)) as { to: string[]; text: string };
      expect(firstDelivery.to).toEqual([newEmail]);
      const firstToken = firstDelivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(firstToken).toBeTruthy();
      expect(await prisma.emailChangeToken.findUnique({
        where: { tokenHash: hashEmailChangeToken(firstToken!) },
      })).toMatchObject({ userId: emailChangeUserId, newEmail });

      await prisma.user.create({ data: {
        id: emailChangeConflictUserId,
        email: newEmail,
        emailVerified: new Date(),
      } });
      const conflicted = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token: firstToken },
      ));
      expect(conflicted.status).toBe(409);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);
      await prisma.user.delete({ where: { id: emailChangeConflictUserId } });

      const retried = await requestEmailChange(request(
        "http://localhost/api/auth/email-change",
        "POST",
        { newEmail, currentPassword: password },
        oldCookie,
      ));
      expect(retried.status).toBe(202);
      const retryDelivery = JSON.parse(String(emailFetch.mock.calls[1]?.[1]?.body)) as { text: string };
      const token = retryDelivery.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();

      const completed = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token },
      ));
      expect(completed.status).toBe(200);
      const updated = await prisma.user.findUniqueOrThrow({ where: { id: emailChangeUserId } });
      expect(updated).toMatchObject({ email: newEmail, sessionVersion: 1 });
      expect(updated.emailVerified).toBeInstanceOf(Date);
      expect(await prisma.emailChangeToken.count({ where: { userId: emailChangeUserId } })).toBe(0);
      expect(await getSessionUser(new Request("http://localhost/api/learner", {
        headers: { cookie: oldCookie },
      }))).toBeNull();
      const notice = JSON.parse(String(emailFetch.mock.calls[2]?.[1]?.body)) as { to: string[]; text: string };
      expect(notice.to).toEqual([oldEmail]);
      expect(notice.text).toContain(newEmail);

      const replay = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token },
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

  it("keeps the last delivered verification link until a newer delivery wins", async () => {
    const email = "delivery-verification@example.com";
    const password = "delivery-verification-password-123";
    const baseTime = new Date(Date.now() - 60_000);
    await prisma.user.create({ data: {
      id: deliveryVerificationUserId,
      ...consentData,
      email,
      passwordHash: await hashPassword(password),
      learner: { create: {} },
    } });
    const initial = await issueEmailVerificationToken(email, baseTime);
    if (!initial) throw new Error("Expected an initial verification proof.");
    expect(await finalizeEmailVerificationDelivery(initial, new Date(baseTime.getTime() + 1_000))).toBe(true);

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    let deliveryAttempt = 0;
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      deliveryAttempt += 1;
      return new Response(null, { status: deliveryAttempt === 1 ? 503 : 202 });
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", emailFetch);

    try {
      await deliverEmailVerification(email, "https://learn.example");
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("email_verification_delivery_failed"));
      expect(await prisma.emailVerificationToken.findMany({
        where: { userId: deliveryVerificationUserId },
      })).toEqual([expect.objectContaining({
        id: initial.id,
        deliveredAt: expect.any(Date),
      })]);

      await deliverEmailVerification(email, "https://learn.example");
      expect(emailFetch).toHaveBeenCalledTimes(2);
      const accepted = await prisma.emailVerificationToken.findMany({
        where: { userId: deliveryVerificationUserId },
      });
      expect(accepted).toEqual([expect.objectContaining({
        id: expect.not.stringMatching(initial.id),
        deliveredAt: expect.any(Date),
      })]);

      const simultaneousTime = new Date(Date.now() + 60_000);
      const earlier = await issueEmailVerificationToken(email, simultaneousTime);
      const latest = await issueEmailVerificationToken(email, simultaneousTime);
      if (!earlier || !latest) throw new Error("Expected verification replacements.");
      const issueOrder = await prisma.emailVerificationToken.findMany({
        where: { id: { in: [earlier.id, latest.id] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      expect(issueOrder.map(({ id }) => id)).toEqual([earlier.id, latest.id]);
      expect(issueOrder[1]!.createdAt.getTime()).toBeGreaterThan(issueOrder[0]!.createdAt.getTime());

      expect(await finalizeEmailVerificationDelivery(
        latest,
        new Date(simultaneousTime.getTime() + 2_000),
      )).toBe(true);
      expect(await finalizeEmailVerificationDelivery(
        earlier,
        new Date(simultaneousTime.getTime() + 3_000),
      )).toBe(false);
      expect(await prisma.emailVerificationToken.findMany({
        where: { userId: deliveryVerificationUserId },
      })).toEqual([expect.objectContaining({ id: latest.id, deliveredAt: expect.any(Date) })]);

      await prisma.emailChangeToken.create({ data: {
        userId: deliveryVerificationUserId,
        newEmail: "delivery-verification-pending@example.com",
        tokenHash: "delivery-verification-change".padEnd(64, "c"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      await prisma.passwordResetToken.create({ data: {
        userId: deliveryVerificationUserId,
        tokenHash: "delivery-verification-reset".padEnd(64, "r"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      const completed = await completeEmailVerification(request(
        "http://localhost/api/auth/email-verification",
        "PATCH",
        { token: latest.token, password },
      ));
      expect(completed.status).toBe(200);
      expect(await prisma.emailVerificationToken.count({ where: { userId: deliveryVerificationUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: deliveryVerificationUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: deliveryVerificationUserId } })).toBe(0);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      errorLog.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the last delivered reset link until a newer delivery wins", async () => {
    const email = "delivery-reset@example.com";
    const oldPassword = "delivery-reset-old-password-123";
    const newPassword = "delivery-reset-new-password-456";
    const baseTime = new Date(Date.now() - 60_000);
    await prisma.user.create({ data: {
      id: deliveryResetUserId,
      ...consentData,
      email,
      emailVerified: baseTime,
      passwordHash: await hashPassword(oldPassword),
      learner: { create: {} },
    } });
    const initial = await issuePasswordResetToken(email, baseTime);
    if (!initial) throw new Error("Expected an initial password-reset proof.");
    expect(await finalizePasswordResetDelivery(initial, new Date(baseTime.getTime() + 1_000))).toBe(true);

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    let deliveryAttempt = 0;
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      deliveryAttempt += 1;
      return new Response(null, { status: deliveryAttempt === 1 ? 503 : 202 });
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", emailFetch);

    try {
      await deliverPasswordReset(email, "https://learn.example");
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("password_reset_email_failed"));
      expect(await prisma.passwordResetToken.findMany({ where: { userId: deliveryResetUserId } })).toEqual([
        expect.objectContaining({ id: initial.id, deliveredAt: expect.any(Date) }),
      ]);

      await deliverPasswordReset(email, "https://learn.example");
      expect(emailFetch).toHaveBeenCalledTimes(2);
      expect(await prisma.passwordResetToken.findMany({ where: { userId: deliveryResetUserId } })).toEqual([
        expect.objectContaining({ id: expect.not.stringMatching(initial.id), deliveredAt: expect.any(Date) }),
      ]);

      const simultaneousTime = new Date(Date.now() + 60_000);
      const earlier = await issuePasswordResetToken(email, simultaneousTime);
      const latest = await issuePasswordResetToken(email, simultaneousTime);
      if (!earlier || !latest) throw new Error("Expected password-reset replacements.");
      const issueOrder = await prisma.passwordResetToken.findMany({
        where: { id: { in: [earlier.id, latest.id] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      expect(issueOrder.map(({ id }) => id)).toEqual([earlier.id, latest.id]);
      expect(issueOrder[1]!.createdAt.getTime()).toBeGreaterThan(issueOrder[0]!.createdAt.getTime());

      expect(await finalizePasswordResetDelivery(
        latest,
        new Date(simultaneousTime.getTime() + 2_000),
      )).toBe(true);
      expect(await finalizePasswordResetDelivery(
        earlier,
        new Date(simultaneousTime.getTime() + 3_000),
      )).toBe(false);
      expect(await prisma.passwordResetToken.findMany({ where: { userId: deliveryResetUserId } })).toEqual([
        expect.objectContaining({ id: latest.id, deliveredAt: expect.any(Date) }),
      ]);

      await prisma.emailVerificationToken.create({ data: {
        userId: deliveryResetUserId,
        tokenHash: "delivery-reset-verification".padEnd(64, "v"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      await prisma.emailChangeToken.create({ data: {
        userId: deliveryResetUserId,
        newEmail: "delivery-reset-pending@example.com",
        tokenHash: "delivery-reset-change".padEnd(64, "c"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      const completed = await completePasswordReset(request(
        "http://localhost/api/auth/password-reset",
        "PATCH",
        { token: latest.token, newPassword },
      ));
      expect(completed.status).toBe(200);
      expect(await prisma.emailVerificationToken.count({ where: { userId: deliveryResetUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: deliveryResetUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: deliveryResetUserId } })).toBe(0);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      errorLog.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps the last delivered email-change link until a newer delivery wins", async () => {
    const email = "delivery-change@example.com";
    const password = "delivery-change-password-123";
    const baseTime = new Date(Date.now() - 60_000);
    await prisma.user.create({ data: {
      id: deliveryChangeUserId,
      ...consentData,
      email,
      emailVerified: baseTime,
      passwordHash: await hashPassword(password),
      learner: { create: {} },
    } });
    const initial = await issueEmailChangeToken(
      deliveryChangeUserId,
      "delivery-change-initial@example.com",
      0,
      baseTime,
    );
    if (initial.status !== "ISSUED") throw new Error("Expected an initial email-change proof.");
    expect(await finalizeEmailChangeDelivery(initial, new Date(baseTime.getTime() + 1_000))).toBe(true);

    const previousEnvironment = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    };
    process.env.RESEND_API_KEY = "re_integration_key";
    process.env.AUTH_EMAIL_FROM = "EduLoop <accounts@learn.example>";
    let deliveryAttempt = 0;
    const emailFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input; void init;
      deliveryAttempt += 1;
      return new Response(null, { status: deliveryAttempt === 1 ? 503 : 202 });
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", emailFetch);

    try {
      const failed = await issueEmailChangeToken(
        deliveryChangeUserId,
        "delivery-change-failed@example.com",
        0,
      );
      if (failed.status !== "ISSUED") throw new Error("Expected a failed-delivery replacement.");
      await deliverEmailChangeVerification(failed, "https://learn.example");
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("email_change_delivery_failed"));
      expect(await prisma.emailChangeToken.findMany({ where: { userId: deliveryChangeUserId } })).toEqual([
        expect.objectContaining({ id: initial.id, deliveredAt: expect.any(Date) }),
      ]);

      const accepted = await issueEmailChangeToken(
        deliveryChangeUserId,
        "delivery-change-accepted@example.com",
        0,
      );
      if (accepted.status !== "ISSUED") throw new Error("Expected an accepted-delivery replacement.");
      await deliverEmailChangeVerification(accepted, "https://learn.example");
      expect(emailFetch).toHaveBeenCalledTimes(2);
      expect(await prisma.emailChangeToken.findMany({ where: { userId: deliveryChangeUserId } })).toEqual([
        expect.objectContaining({ id: accepted.id, deliveredAt: expect.any(Date) }),
      ]);

      const simultaneousTime = new Date(Date.now() + 60_000);
      const earlier = await issueEmailChangeToken(
        deliveryChangeUserId,
        "delivery-change-earlier@example.com",
        0,
        simultaneousTime,
      );
      const latest = await issueEmailChangeToken(
        deliveryChangeUserId,
        "delivery-change-latest@example.com",
        0,
        simultaneousTime,
      );
      if (earlier.status !== "ISSUED" || latest.status !== "ISSUED") {
        throw new Error("Expected email-change replacements.");
      }
      const issueOrder = await prisma.emailChangeToken.findMany({
        where: { id: { in: [earlier.id, latest.id] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      expect(issueOrder.map(({ id }) => id)).toEqual([earlier.id, latest.id]);
      expect(issueOrder[1]!.createdAt.getTime()).toBeGreaterThan(issueOrder[0]!.createdAt.getTime());

      expect(await finalizeEmailChangeDelivery(
        latest,
        new Date(simultaneousTime.getTime() + 2_000),
      )).toBe(true);
      expect(await finalizeEmailChangeDelivery(
        earlier,
        new Date(simultaneousTime.getTime() + 3_000),
      )).toBe(false);
      expect(await prisma.emailChangeToken.findMany({ where: { userId: deliveryChangeUserId } })).toEqual([
        expect.objectContaining({ id: latest.id, deliveredAt: expect.any(Date) }),
      ]);

      await prisma.emailVerificationToken.create({ data: {
        userId: deliveryChangeUserId,
        tokenHash: "delivery-change-verification".padEnd(64, "v"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      await prisma.passwordResetToken.create({ data: {
        userId: deliveryChangeUserId,
        tokenHash: "delivery-change-reset".padEnd(64, "r"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      } });
      const completed = await completeEmailChange(request(
        "http://localhost/api/auth/email-change",
        "PATCH",
        { token: latest.token },
      ));
      expect(completed.status).toBe(200);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: deliveryChangeUserId } })).toMatchObject({
        email: latest.newEmail,
        sessionVersion: 1,
      });
      expect(await prisma.emailVerificationToken.count({ where: { userId: deliveryChangeUserId } })).toBe(0);
      expect(await prisma.emailChangeToken.count({ where: { userId: deliveryChangeUserId } })).toBe(0);
      expect(await prisma.passwordResetToken.count({ where: { userId: deliveryChangeUserId } })).toBe(0);
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      errorLog.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("requires recent reauthentication for sensitive social-only account actions", async () => {
    const email = "sensitive-social@example.com";
    await prisma.user.create({ data: {
      id: sensitiveUserId,
      ...consentData,
      email,
      learner: { create: {} },
    } });
    const staleCookie = await authCookie(sensitiveUserId, 0, Math.floor(Date.now() / 1000) - 11 * 60);
    const stalePasswordChange = await updateCurrentAccount(request(
      "http://localhost/api/auth/account",
      "PATCH",
      { newPassword: "new-social-password" },
      staleCookie,
    ));
    expect(stalePasswordChange.status).toBe(401);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: sensitiveUserId } })).toMatchObject({ passwordHash: null });

    const staleEmailChange = await requestEmailChange(request(
      "http://localhost/api/auth/email-change",
      "POST",
      { newEmail: "sensitive-social-new@example.com" },
      staleCookie,
    ));
    expect(staleEmailChange.status).toBe(401);
    expect(await prisma.emailChangeToken.count({ where: { userId: sensitiveUserId } })).toBe(0);

    const staleDeletion = await deleteCurrentAccount(request(
      "http://localhost/api/auth/account",
      "DELETE",
      { emailConfirmation: email },
      staleCookie,
    ));
    expect(staleDeletion.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: sensitiveUserId } })).toBeTruthy();

    const recentCookie = await authCookie(sensitiveUserId);
    const deletion = await deleteCurrentAccount(request(
      "http://localhost/api/auth/account",
      "DELETE",
      { emailConfirmation: email },
      recentCookie,
    ));
    expect(deletion.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: sensitiveUserId } })).toBeNull();
  });
});
