import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

test.describe("local legal consent workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Consent fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-consent-${suffix}`;
  const email = `e2e-consent-${suffix}@example.test`;
  const password = "e2e-consent-password-123";

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email,
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("existing account must record adult or guardian acceptance before persistent use", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "EduLoop 隐私说明" })).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "EduLoop 服务条款" })).toBeVisible();

    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/consent\?next=%2Fprogress$/, { timeout: 30_000 });
    expect(await prisma.learnerProfile.findUnique({ where: { userId } })).toBeNull();
    await page.goto("/practice");
    await expect(page).toHaveURL(/\/consent\?next=%2Fpractice$/);
    await page.goto("/consent?next=%2Fprogress");

    await page.getByLabel("我是父母或法定监护人").check();
    await page.getByLabel(/我已阅读并接受/).check();
    await page.getByRole("button", { name: "接受并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();

    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      termsVersion: "2026-07-31",
      privacyVersion: "2026-07-31",
      consentBasis: "GUARDIAN",
    });
    expect(await prisma.consentRecord.findFirst({ where: { userId } })).toMatchObject({
      basis: "GUARDIAN",
      method: "AUTHENTICATED_CONSENT",
    });
    expect(await prisma.learnerProfile.findUnique({ where: { userId } })).toBeTruthy();
    expect(browserErrors).toEqual([]);
  });
});
