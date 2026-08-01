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
  privacyAcceptedAt: new Date(), privacyVersion: "2026-08-01", consentBasis: "ADULT",
};

test.describe("local password recovery workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Password recovery fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-password-reset-${suffix}`;
  const email = `e2e-password-reset-${suffix}@example.test`;
  const oldPassword = "e2e-old-password-123";
  const newPassword = "e2e-new-password-456";

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        ...consentData,
        email,
        passwordHash: await bcrypt.hash(oldPassword, 12),
        learner: { create: { displayName: "密码恢复测试学习者" } },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("learner can request, consume, and not replay a password reset link", async ({ page }) => {
    test.setTimeout(60_000);
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/login");
    await page.getByRole("link", { name: "忘记密码？" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.route("**/api/auth/password-reset", (route) => route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true }),
    }), { times: 1 });
    await page.getByLabel("邮箱").fill(email);
    await page.getByRole("button", { name: "发送重置邮件" }).click();
    await expect(page.getByRole("status")).toContainText("请检查邮箱");

    await page.goto("/reset-password");
    await expect(page.getByRole("alert").filter({ hasText: "重置链接无效" })).toBeVisible();

    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await page.goto(`/reset-password#token=${token}`);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("新密码", { exact: true }).fill(newPassword);
    await page.getByLabel("再次输入新密码").fill("different-password-789");
    await page.getByRole("button", { name: "更新密码" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "两次输入的密码不一致" })).toBeVisible();
    await page.getByLabel("再次输入新密码").fill(newPassword);
    await page.getByRole("button", { name: "更新密码" }).click();
    await expect(page.getByRole("status")).toContainText("密码已更新");
    await expect.poll(() => prisma.passwordResetToken.count({ where: { userId } })).toBe(0);

    await page.goto(`/reset-password#token=${token}`);
    await page.getByLabel("新密码", { exact: true }).fill("another-password-789");
    await page.getByLabel("再次输入新密码").fill("another-password-789");
    await page.getByRole("button", { name: "更新密码" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "重置链接无效或已过期" })).toBeVisible();
    expect(browserErrors).toEqual([
      "console: Failed to load resource: the server responded with a status of 400 (Bad Request)",
    ]);
    browserErrors.length = 0;

    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(oldPassword);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "邮箱或密码不正确" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(newPassword);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBeInstanceOf(Date);

    expect(browserErrors).toEqual([]);
  });
});
