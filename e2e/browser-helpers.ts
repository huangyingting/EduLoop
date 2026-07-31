import { expect, type Page } from "@playwright/test";

export function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      errors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    }
  });
  return errors;
}

export async function waitForQuestion(page: Page) {
  await expect(page.locator("#practice-question-heading")).toBeVisible({ timeout: 30_000 });
}

export async function login(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录并继续" }).click();
  await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === next, { timeout: 30_000 });
}
