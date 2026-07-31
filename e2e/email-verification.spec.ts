import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const consentData = {
  termsAcceptedAt: new Date(), termsVersion: "2026-07-31",
  privacyAcceptedAt: new Date(), privacyVersion: "2026-07-31", consentBasis: "ADULT",
};

test.describe("local email verification workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Email verification fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-email-verification-${suffix}`;
  const email = `e2e-email-verification-${suffix}@example.test`;
  const password = "e2e-verification-password-123";
  const token = randomBytes(32).toString("base64url");

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        ...consentData,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        learner: { create: { displayName: "邮箱验证测试学习者" } },
        emailVerificationTokens: {
          create: {
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("learner verifies a single-use link before credentials sign-in", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto(`/verify-email#token=${token}`);
    await expect(page).toHaveURL(/\/verify-email$/);
    await page.getByLabel("账号密码").fill("incorrect-verification-password");
    await page.getByRole("button", { name: "确认密码并验证" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "密码不正确" })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBeNull();
    expect(await prisma.emailVerificationToken.count({ where: { userId } })).toBe(1);

    await page.getByLabel("账号密码").fill(password);
    await page.getByRole("button", { name: "确认密码并验证" }).click();
    await expect(page.getByRole("heading", { name: "邮箱已验证" })).toBeVisible({ timeout: 15_000 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBeInstanceOf(Date);
    expect(await prisma.emailVerificationToken.count({ where: { userId } })).toBe(0);

    await page.goto(`/verify-email#token=${token}`);
    await page.getByLabel("账号密码").fill(password);
    await page.getByRole("button", { name: "确认密码并验证" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "验证链接无效或已过期" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();

    expect(browserErrors).toEqual([
      "console: Failed to load resource: the server responded with a status of 401 (Unauthorized)",
      "console: Failed to load resource: the server responded with a status of 400 (Bad Request)",
    ]);
  });
});
