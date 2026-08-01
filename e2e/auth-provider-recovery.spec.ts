import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";

test.skip(Boolean(process.env.E2E_BASE_URL), "Provider failure fixtures run against the local test server.");

const unavailableResponse = {
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ message: "Injected private provider failure" }),
};

function expectOnlyInjectedUnavailable(errors: string[]) {
  expect(errors.filter((error) => !/^console: Failed to load resource: the server responded with a status of 503/.test(error))).toEqual([]);
}

test("provider discovery failure leaves password login available and retryable", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.route("**/api/auth/providers", (route) => route.fulfill(unavailableResponse), { times: 1 });

  await page.goto("/login");
  const outage = page.getByRole("alert").filter({ hasText: "社交登录暂时不可用" });
  await expect(outage).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeEnabled();
  await expect(page.getByLabel("密码")).toBeEnabled();
  await outage.getByRole("button", { name: "重试社交登录" }).click();
  await expect(page.getByRole("button", { name: "使用 Facebook 继续" })).toBeVisible();

  expectOnlyInjectedUnavailable(browserErrors);
});

test("provider initiation failure clears busy state and shows a bounded retry message", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.goto("/login");
  const facebook = page.getByRole("button", { name: "使用 Facebook 继续" });
  await expect(facebook).toBeVisible();
  await page.route("**/api/auth/signin/facebook", (route) => route.fulfill(unavailableResponse), { times: 1 });

  await facebook.click();
  const alert = page.getByRole("alert").filter({ hasText: "暂时无法开始社交登录" });
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText("Injected private provider failure");
  await expect(facebook).toBeEnabled();
  await expect(page.getByLabel("邮箱")).toBeEnabled();

  expectOnlyInjectedUnavailable(browserErrors);
});

test("rejected account-link callback reaches a stable recovery screen without a redirect loop", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  const email = `e2e-provider-recovery-${Date.now()}-${test.info().workerIndex}@example.test`;
  const password = "e2e-provider-recovery-password-123";

  try {
    await page.goto("/register?next=%2Fprivacy");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByLabel("年满 18 岁的学习者").check();
    await page.getByLabel(/我接受 服务条款/).check();
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page).toHaveURL(/\/privacy$/, { timeout: 30_000 });

    const failedLinkUrl = new URL("/login?error=Configuration", page.url()).href;
    await page.route("**/api/auth/signin/facebook", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: failedLinkUrl }),
    }), { times: 1 });
    const connectFacebook = page.getByRole("button", { name: "连接 Facebook" });
    await connectFacebook.click();
    await expect(page.getByRole("alert").filter({ hasText: "社交账号连接没有完成" })).toBeVisible();
    await expect(connectFacebook).toBeEnabled();

    const authorizationUrl = await page.evaluate(async () => {
      const csrfResponse = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
      const response = await fetch("/api/auth/signin/facebook", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/privacy" }),
      });
      const body = await response.json() as { url: string };
      return body.url;
    });
    expect(new URL(authorizationUrl).hostname).toBe("www.facebook.com");

    await page.goto("/api/auth/callback/facebook?error=access_denied&error_description=private-provider-detail");
    await expect(page).toHaveURL(/\/login\?error=OAuthCallbackError$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "社交账号连接未完成" })).toBeVisible();
    const alert = page.getByRole("alert").filter({ hasText: "社交账号连接已取消" });
    await expect(alert).toContainText("社交账号连接已取消");
    await expect(alert).not.toContainText("private-provider-detail");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login\?error=OAuthCallbackError$/);

    await page.getByRole("link", { name: "返回数据与隐私" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    expect(browserErrors).toEqual([]);
  } finally {
    await page.request.delete("/api/auth/account", {
      data: { currentPassword: password },
    }).catch(() => null);
  }
});
