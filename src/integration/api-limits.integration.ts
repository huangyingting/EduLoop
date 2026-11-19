import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as registerAccount } from "@/app/api/auth/register/route";
import { POST as requestPasswordReset } from "@/app/api/auth/password-reset/route";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { prisma } from "@/lib/prisma";
import { MAX_JSON_BODY_BYTES } from "@/lib/api";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { cleanupExpiredSecurityArtifacts } from "@/lib/retention";
import { addressRateLimitKey, checkRateLimit, cleanupExpiredRateLimitBuckets, rateLimitBucketId } from "@/lib/rate-limit";
import { bandId, headers, expiredRetentionUserId, activeRetentionUserId, staleRegistrationUserIds, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("API limits and security-artifact retention", () => {
  it("rejects oversized custom JSON before route validation or mutation", async () => {
    const response = await registerAccount(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        ...headers,
        "content-length": "2",
      },
      body: "x".repeat(MAX_JSON_BODY_BYTES + 1),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Request body too large",
      code: "PAYLOAD_TOO_LARGE",
      details: { maxBytes: MAX_JSON_BODY_BYTES },
    });
  });

  it("atomically enforces shared fixed-window limits without storing raw identities", async () => {
    const key = "integration-shared-limit:198.51.100.90:private@example.com";
    const windowMs = 60_000;
    const now = Math.floor(Date.now() / windowMs) * windowMs + 1_000;
    const id = rateLimitBucketId(key, windowMs, now);

    const responses = await Promise.all(
      Array.from({ length: 12 }, () => checkRateLimit(key, 4, windowMs, now)),
    );
    expect(responses.filter(({ allowed }) => allowed)).toHaveLength(4);
    expect(responses.filter(({ allowed }) => !allowed)).toHaveLength(8);
    expect(responses.every(({ retryAfter }) => retryAfter === 59)).toBe(true);

    const persisted = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { id } });
    expect(persisted).toMatchObject({ count: 12, windowStart: new Date(now - 1_000) });
    expect(persisted.id).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted.id).not.toContain("private@example.com");

    await expect(checkRateLimit(key, 4, windowMs, now + windowMs)).resolves.toMatchObject({
      allowed: true,
      remaining: 3,
    });
  });

  it("cleans up expired shared buckets while preserving active windows", async () => {
    const now = Date.now();
    await prisma.rateLimitBucket.createMany({ data: [
      {
        id: "integration-expired-rate-limit",
        windowStart: new Date(now - 120_000),
        expiresAt: new Date(now - 60_000),
        count: 3,
      },
      {
        id: "integration-active-rate-limit",
        windowStart: new Date(now),
        expiresAt: new Date(now + 60_000),
        count: 1,
      },
    ] });

    await cleanupExpiredRateLimitBuckets(now);
    expect(await prisma.rateLimitBucket.findUnique({
      where: { id: "integration-expired-rate-limit" },
    })).toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({
      where: { id: "integration-active-rate-limit" },
    })).toBeTruthy();
  });

  it("removes expired security artifacts while preserving active proofs", async () => {
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 1);
    const activeUntil = new Date(now.getTime() + 60 * 60_000);
    await expect(cleanupExpiredSecurityArtifacts(new Date(Number.NaN))).rejects.toThrow(
      "Cleanup time must be valid.",
    );

    await prisma.user.create({ data: {
      id: expiredRetentionUserId,
      email: "expired-retention@example.com",
      sessions: { create: {
        sessionToken: "integration-retention-expired-session",
        expires: expiredAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "1".repeat(64),
        expiresAt: expiredAt,
      } },
      emailChangeTokens: { create: {
        newEmail: "expired-retention-new@example.com",
        tokenHash: "2".repeat(64),
        expiresAt: expiredAt,
      } },
      passwordResetTokens: { create: {
        tokenHash: "3".repeat(64),
        expiresAt: expiredAt,
      } },
    } });
    await prisma.user.create({ data: {
      id: activeRetentionUserId,
      email: "active-retention@example.com",
      sessions: { create: {
        sessionToken: "integration-retention-active-session",
        expires: activeUntil,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "4".repeat(64),
        expiresAt: activeUntil,
      } },
      emailChangeTokens: { create: {
        newEmail: "active-retention-new@example.com",
        tokenHash: "5".repeat(64),
        expiresAt: activeUntil,
      } },
      passwordResetTokens: { create: {
        tokenHash: "6".repeat(64),
        expiresAt: activeUntil,
      } },
    } });
    await prisma.verificationToken.createMany({ data: [
      {
        identifier: "integration-retention-expired",
        token: "expired-auth-token",
        expires: expiredAt,
      },
      {
        identifier: "integration-retention-active",
        token: "active-auth-token",
        expires: activeUntil,
      },
    ] });
    await prisma.rateLimitBucket.createMany({ data: [
      {
        id: "integration-retention-expired-bucket",
        windowStart: expiredAt,
        expiresAt: expiredAt,
        count: 2,
      },
      {
        id: "integration-retention-active-bucket",
        windowStart: now,
        expiresAt: activeUntil,
        count: 1,
      },
    ] });

    await expect(cleanupExpiredSecurityArtifacts(now)).resolves.toEqual({
      adapterSessions: 1,
      authVerificationTokens: 1,
      emailVerificationTokens: 1,
      emailChangeTokens: 1,
      passwordResetTokens: 1,
      rateLimitBuckets: 1,
      staleUnverifiedRegistrations: 0,
    });

    expect(await prisma.session.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { sessionToken: true },
    })).toEqual([{ sessionToken: "integration-retention-active-session" }]);
    expect(await prisma.verificationToken.findMany({
      where: { identifier: { startsWith: "integration-retention-" } },
      select: { identifier: true },
    })).toEqual([{ identifier: "integration-retention-active" }]);
    expect(await prisma.emailVerificationToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.emailChangeToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.passwordResetToken.findMany({
      where: { userId: { in: [expiredRetentionUserId, activeRetentionUserId] } },
      select: { userId: true },
    })).toEqual([{ userId: activeRetentionUserId }]);
    expect(await prisma.rateLimitBucket.findMany({
      where: { id: { startsWith: "integration-retention-" } },
      select: { id: true },
    })).toEqual([{ id: "integration-retention-active-bucket" }]);
  });

  it("removes expired unused registrations in bounded batches without touching protected accounts", async () => {
    const now = new Date();
    const expiredEarlier = new Date(now.getTime() - 2 * 60 * 60_000);
    const expiredLater = new Date(now.getTime() - 60 * 60_000);
    const activeUntil = new Date(now.getTime() + 60 * 60_000);
    const baseRegistration = {
      passwordHash: "unused-registration-password-hash",
      registrationExpiresAt: expiredLater,
    } as const;

    await prisma.$transaction([
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[0],
        email: "stale-registration-a@example.com",
        ...baseRegistration,
        registrationExpiresAt: expiredEarlier,
        learner: { create: { knowledgeBandId: bandId } },
        consentRecords: { create: {
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          basis: "ADULT",
          method: "PASSWORD_REGISTRATION",
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[1],
        email: "stale-registration-b@example.com",
        ...baseRegistration,
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[2],
        email: "stale-registration-verification@example.com",
        ...baseRegistration,
        learner: { create: {} },
        emailVerificationTokens: { create: {
          tokenHash: "a".repeat(64),
          expiresAt: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[3],
        email: "stale-registration-recovery@example.com",
        ...baseRegistration,
        learner: { create: {} },
        passwordResetTokens: { create: {
          tokenHash: "b".repeat(64),
          expiresAt: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[4],
        email: "stale-registration-provider@example.com",
        ...baseRegistration,
        learner: { create: {} },
        accounts: { create: {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: "integration-stale-registration-provider",
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[5],
        email: "stale-registration-session@example.com",
        ...baseRegistration,
        learner: { create: {} },
        sessions: { create: {
          sessionToken: "integration-stale-registration-session",
          expires: activeUntil,
        } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[6],
        email: "stale-registration-learning@example.com",
        ...baseRegistration,
        learner: { create: { xp: 10 } },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[7],
        email: "stale-registration-future@example.com",
        ...baseRegistration,
        registrationExpiresAt: activeUntil,
        learner: { create: {} },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[8],
        email: "stale-registration-verified@example.com",
        ...baseRegistration,
        emailVerified: now,
        learner: { create: {} },
      } }),
      prisma.user.create({ data: {
        id: staleRegistrationUserIds[9],
        email: "stale-registration-operator@example.com",
        ...baseRegistration,
        role: "CONTENT_EDITOR",
        learner: { create: {} },
      } }),
    ]);

    await expect(cleanupExpiredSecurityArtifacts(now, 0)).rejects.toThrow(
      "Stale-registration cleanup batch size must be between 1 and 1000.",
    );
    const first = await cleanupExpiredSecurityArtifacts(now, 1);
    const second = await cleanupExpiredSecurityArtifacts(now, 1);
    expect(first.staleUnverifiedRegistrations).toBe(1);
    expect(second.staleUnverifiedRegistrations).toBe(1);
    expect(await prisma.user.findMany({
      where: { id: { in: staleRegistrationUserIds.slice(0, 2) } },
      select: { id: true },
    })).toEqual([]);
    expect(await prisma.consentRecord.count({
      where: { userId: staleRegistrationUserIds[0] },
    })).toBe(0);
    expect(await prisma.learnerProfile.count({
      where: { userId: staleRegistrationUserIds[0] },
    })).toBe(0);

    const protectedIds = await prisma.user.findMany({
      where: { id: { in: staleRegistrationUserIds.slice(2) } },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    expect(protectedIds.map(({ id }) => id)).toEqual(
      [...staleRegistrationUserIds.slice(2)].sort(),
    );
  });

  it("enforces identity limits across addresses and address limits across identities", async () => {
    const resetRequest = (email: string, address: string) => new Request(
      "http://localhost/api/auth/password-reset",
      {
        method: "POST",
        headers: { ...headers, "x-forwarded-for": address },
        body: JSON.stringify({ email }),
      },
    );
    const responses = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(await requestPasswordReset(resetRequest(
        "rate-limited-missing@example.com",
        `198.51.100.${100 + index}`,
      )));
    }

    expect(responses.slice(0, 3).map(({ status }) => status)).toEqual([202, 202, 202]);
    expect(responses[3].status).toBe(429);
    expect(responses[3].headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await responses[3].json()).toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
    });

    const addressResponses = [];
    for (let index = 0; index < 21; index += 1) {
      addressResponses.push(await requestPasswordReset(resetRequest(
        `rate-limited-address-${index}@example.com`,
        "198.51.100.200",
      )));
    }
    expect(addressResponses.slice(0, 20).every(({ status }) => status === 202)).toBe(true);
    expect(addressResponses[20].status).toBe(429);
    expect(addressResponses[20].headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("caches strict public catalog responses and rejects a saturated shared bucket", async () => {
    const catalogHeaders = { "x-forwarded-for": "203.0.113.76" };
    const catalog = await getCatalog(new NextRequest("http://localhost/api/catalog", {
      headers: catalogHeaders,
    }));
    expect(catalog.status).toBe(200);
    expect(catalog.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    );
    expect(await catalog.json()).toMatchObject({
      subjects: expect.any(Array),
      gradeBands: expect.any(Array),
      tagDimensions: expect.any(Array),
    });

    const invalid = await getCatalog(new NextRequest("http://localhost/api/catalog?cacheBust=1", {
      headers: catalogHeaders,
    }));
    expect(invalid.status).toBe(400);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-31T12:00:30.000Z"));
    try {
      const key = addressRateLimitKey("catalog", "203.0.113.77");
      const windowMs = 60_000;
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      await prisma.rateLimitBucket.create({ data: {
        id: rateLimitBucketId(key, windowMs, now),
        windowStart: new Date(windowStart),
        expiresAt: new Date(windowStart + windowMs),
        count: 180,
      } });
      const limited = await getCatalog(new NextRequest("http://localhost/api/catalog", {
        headers: { "x-forwarded-for": "203.0.113.77" },
      }));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("30");
    } finally {
      vi.useRealTimers();
    }
  });
});
