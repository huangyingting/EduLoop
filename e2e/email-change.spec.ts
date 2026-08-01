import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const consentData = {
  termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
  privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION, consentBasis: "ADULT",
};

test.describe("local login email change workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Email-change fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-email-change-${suffix}`;
  const oldEmail = `e2e-email-change-old-${suffix}@example.test`;
  const newEmail = `e2e-email-change-new-${suffix}@example.test`;
  const password = "e2e-email-change-password-123";

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        ...consentData,
        email: oldEmail,
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(password, 12),
        learner: { create: { displayName: "邮箱更改测试学习者" } },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("learner verifies a new address before the login identity changes", async ({ page }) => {
    test.setTimeout(75_000);
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/login?next=%2Fprivacy");
    await page.getByLabel("邮箱").fill(oldEmail);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/privacy$/, { timeout: 30_000 });

    await page.route("**/api/auth/email-change", (route) => route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true }),
    }), { times: 1 });
    await page.getByLabel("新登录邮箱").fill(newEmail);
    await page.getByLabel("当前密码确认", { exact: true }).fill(password);
    await page.getByRole("button", { name: "发送新邮箱确认" }).click();
    await expect(page.getByRole("status")).toContainText("确认邮件已发送");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(oldEmail);

    const token = randomBytes(32).toString("base64url");
    await prisma.emailChangeToken.create({
      data: {
        userId,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await page.goto(`/change-email#token=${token}`);
    await expect(page).toHaveURL(/\/change-email$/);
    await expect(page.getByRole("heading", { name: "登录邮箱已更新" })).toBeVisible({ timeout: 15_000 });
    expect(await prisma.emailChangeToken.count({ where: { userId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      email: newEmail,
      sessionVersion: 1,
    });

    await page.goto(`/change-email#token=${token}`);
    await expect(page.getByRole("alert").filter({ hasText: "邮箱更改链接无效" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(oldEmail);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "邮箱或密码不正确" })).toBeVisible({ timeout: 15_000 });
    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(newEmail);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();

    expect(browserErrors).toEqual([
      "console: Failed to load resource: the server responded with a status of 400 (Bad Request)",
    ]);
  });
});
