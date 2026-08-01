import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

const consentData = {
  termsAcceptedAt: new Date(), termsVersion: "2026-07-31",
  privacyAcceptedAt: new Date(), privacyVersion: "2026-08-01", consentBasis: "ADULT",
};

test.describe("local provider disconnect workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Provider fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-provider-disconnect-${suffix}`;
  const email = `e2e-provider-disconnect-${suffix}@example.test`;
  const password = "e2e-provider-disconnect-password-123";

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        ...consentData,
        email,
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(password, 12),
        learner: { create: { displayName: "登录连接测试学习者" } },
        accounts: { create: {
          type: "oauth",
          provider: "google",
          providerAccountId: `e2e-google-${suffix}`,
          access_token: "e2e-stored-access-token",
          refresh_token: "e2e-stored-refresh-token",
        } },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("learner removes a provider and signs back in with the remaining password", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/login?next=%2Fprivacy");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/privacy$/, { timeout: 30_000 });

    await expect(page.getByText("Google（已连接）")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "断开 Google" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fprivacy&notice=provider_disconnected$/, {
      timeout: 30_000,
    });
    await expect(page.getByRole("status")).toContainText("社交登录连接已移除");

    expect(await prisma.account.count({ where: { userId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      sessionVersion: 1,
    });

    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/privacy$/, { timeout: 30_000 });
    await expect(page.getByText(`当前账号：${email}`)).toBeVisible();
    expect(browserErrors).toEqual([]);
  });
});
