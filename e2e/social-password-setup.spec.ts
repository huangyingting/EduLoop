import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { captureBrowserErrors } from "./browser-helpers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

const baseUrl = externalBaseUrl ?? "http://localhost:32178";
const sessionCookie = "authjs.session-token";
const authSecret = process.env.AUTH_SECRET
  || "eduloop-development-secret-change-before-production";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const consentData = {
  termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
  privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION, consentBasis: "ADULT",
};

test.describe("unverified social password setup", () => {
  test.skip(Boolean(externalBaseUrl), "Social password fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const userId = `e2e-social-password-${suffix}`;
  const email = `e2e-social-password-${suffix}@example.test`;
  const password = "e2e-social-password-123";

  test.beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        ...consentData,
        email,
        learner: { create: { displayName: "社交账号密码测试学习者" } },
        accounts: { create: {
          type: "oidc",
          provider: "microsoft-entra-id",
          providerAccountId: `e2e-social-microsoft-${suffix}`,
        } },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("setting a password requires email proof before credentials login", async ({ context, page }) => {
    const browserErrors = captureBrowserErrors(page);
    const token = await encode({
      token: {
        sub: userId,
        sessionVersion: 0,
        authenticatedAt: Math.floor(Date.now() / 1000),
      },
      secret: authSecret,
      salt: sessionCookie,
    });
    await context.addCookies([{
      name: sessionCookie,
      value: token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    }]);

    await page.goto("/profile");
    await expect(page.getByText(`当前账号：${email}（邮箱未验证）`)).toBeVisible();
    await expect(page.getByText("若要启用邮箱登录，请先设置密码", { exact: false })).toBeVisible();
    await expect(page.getByText("确认邮箱归属时会移除当前社交登录连接", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "断开 Microsoft" })).toBeDisabled();

    await page.getByLabel("新密码", { exact: true }).fill(password);
    await page.getByLabel("再次输入新密码").fill(password);
    await page.getByRole("button", { name: "设置密码" }).click();
    await expect(page).toHaveURL(/\/verify-email\?passwordSet=1$/, { timeout: 30_000 });
    await expect(page.getByRole("status")).toContainText("密码已设置并退出所有旧会话");
    await expect.poll(async () => {
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      return {
        emailVerified: stored.emailVerified,
        hasPassword: Boolean(stored.passwordHash && await bcrypt.compare(password, stored.passwordHash)),
        sessionVersion: stored.sessionVersion,
      };
    }).toEqual({ emailVerified: null, hasPassword: true, sessionVersion: 1 });

    const verificationToken = randomBytes(32).toString("base64url");
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(verificationToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    await page.goto(`/verify-email#token=${verificationToken}`);
    await expect(page.getByText("尚未证明邮箱所有权的社交登录连接会被移除")).toBeVisible();
    await page.getByLabel("账号密码").fill(password);
    await page.getByRole("button", { name: "确认密码并验证" }).click();
    await expect(page.getByRole("heading", { name: "邮箱已验证" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status")).toContainText("原有社交登录连接也已移除");
    await expect.poll(async () => {
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      return {
        emailVerified: stored.emailVerified instanceof Date,
        sessionVersion: stored.sessionVersion,
        providers: await prisma.account.count({ where: { userId } }),
      };
    }).toEqual({ emailVerified: true, sessionVersion: 2, providers: 0 });

    await page.goto("/login?next=%2Fprofile");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 });
    await expect(page.getByText(`当前账号：${email}（邮箱已验证）`)).toBeVisible();
    await expect(page.getByRole("button", { name: "断开 Microsoft" })).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  });
});
