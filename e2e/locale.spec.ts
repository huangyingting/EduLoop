import { expect, test } from "@playwright/test";
import { captureBrowserErrors, waitForQuestion } from "./browser-helpers";

test("visitors switch the interface to English and the choice sticks across pages", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/practice");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await waitForQuestion(page);
  await page.getByRole("combobox", { name: "界面语言" }).selectOption("en");

  await expect(page.getByRole("heading", { name: "Focused practice" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeVisible();
  // English practice serves the English AMC originals first.
  await page.reload();
  await waitForQuestion(page);
  await expect(page.locator("#practice-question-heading")).toHaveAttribute("lang", "en");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hi! What would you like to explore today?" })).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back, explorer" })).toBeVisible();

  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(page.getByRole("heading", { name: "欢迎回来，探索者" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
