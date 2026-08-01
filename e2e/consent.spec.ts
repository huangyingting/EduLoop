import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");
const PREVIOUS_PRIVACY_VERSION = "2026-08-01";

test.describe("local legal consent workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Consent fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-consent-${suffix}`;
  const email = `e2e-consent-${suffix}@example.test`;
  const password = "e2e-consent-password-123";

  test.beforeAll(async () => {
    const previousAcceptedAt = new Date("2026-08-01T00:00:00.000Z");
    await prisma.user.create({
      data: {
        id: userId,
        email,
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(password, 12),
        termsAcceptedAt: previousAcceptedAt,
        termsVersion: TERMS_VERSION,
        privacyAcceptedAt: previousAcceptedAt,
        privacyVersion: PREVIOUS_PRIVACY_VERSION,
        consentBasis: "ADULT",
        learner: { create: {} },
        consentRecords: { create: {
          termsVersion: TERMS_VERSION,
          privacyVersion: PREVIOUS_PRIVACY_VERSION,
          basis: "ADULT",
          method: "PASSWORD_REGISTRATION",
          acceptedAt: previousAcceptedAt,
        } },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("a previous privacy version requires fresh consent without replacing learner data", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    const existingLearner = await prisma.learnerProfile.findUniqueOrThrow({
      where: { userId },
    });
    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "EduLoop 隐私说明" })).toBeVisible();
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: "EduLoop 服务条款" })).toBeVisible();

    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/consent\?next=%2Fprogress$/, { timeout: 30_000 });
    expect(await prisma.learnerProfile.findUnique({ where: { userId } })).toMatchObject({
      id: existingLearner.id,
    });
    await page.goto("/practice");
    await expect(page).toHaveURL(/\/consent\?next=%2Fpractice$/);
    await page.goto("/consent?next=%2Fprogress");

    await page.getByLabel("我是父母或法定监护人").check();
    await page.getByLabel(/我已阅读并接受/).check();
    await page.getByRole("button", { name: "接受并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();

    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      consentBasis: "GUARDIAN",
    });
    expect(await prisma.consentRecord.findFirstOrThrow({
      where: { userId, privacyVersion: PRIVACY_VERSION },
    })).toMatchObject({
      basis: "GUARDIAN",
      method: "AUTHENTICATED_CONSENT",
    });
    expect(await prisma.consentRecord.findFirstOrThrow({
      where: { userId, privacyVersion: PREVIOUS_PRIVACY_VERSION },
    })).toMatchObject({
      basis: "ADULT",
      method: "PASSWORD_REGISTRATION",
    });
    expect(await prisma.consentRecord.count({ where: { userId } })).toBe(2);
    expect(await prisma.learnerProfile.findUnique({ where: { userId } })).toMatchObject({
      id: existingLearner.id,
    });
    expect(browserErrors).toEqual([]);
  });
});
