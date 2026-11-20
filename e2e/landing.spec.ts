import { expect, test } from "@playwright/test";
import { captureBrowserErrors, waitForQuestion } from "./browser-helpers";

test("visitors land on the public home page, practice a full round, and are invited to sign up", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "嗨，今天想探索什么？" })).toBeVisible();
  await expect(page.getByRole("link", { name: "免费注册" }).first()).toBeVisible();

  await page.getByRole("link", { name: /开始 10 题挑战/ }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await page.goto("/practice?type=SINGLE_CHOICE&difficulty=EASY");
  for (let round = 1; round <= 10; round += 1) {
    await waitForQuestion(page);
    await page.locator("article button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText(`${round} / 10`)).toBeVisible();
    const selfAssess = page.getByRole("button", { name: "思路正确" });
    if (await selfAssess.isVisible()) await selfAssess.click();
    if (round < 10) await page.getByRole("button", { name: "下一题" }).click();
  }
  await expect(page.getByRole("link", { name: "免费注册，保存下一轮进度" })).toHaveAttribute("href", "/register?next=%2Fpractice");

  expect(browserErrors).toEqual([]);
});

test("search engines receive robots rules, a sitemap, and a share image", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /api/");
  expect(robotsText).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("/practice</loc>");

  const image = await request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");
});
