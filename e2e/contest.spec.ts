import { expect, test } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";

test("a learner takes a timed AMC paper, autosaves an answer, submits, and reviews the score", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = captureBrowserErrors(page);
  const email = `e2e-contest-${Date.now()}-${test.info().workerIndex}@example.test`;
  const password = "e2e-contest-password-123";

  try {
    await page.goto("/register?next=%2Fcontest");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByLabel("年满 18 岁的学习者").check();
    await page.getByLabel(/我接受 服务条款/).check();
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page).toHaveURL(/\/contest$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "竞赛模拟" })).toBeVisible();

    await page.getByRole("button", { name: /开始作答/ }).first().click();
    await expect(page).toHaveURL(/\/contest\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByRole("timer", { name: "剩余时间" })).toBeVisible();
    await expect(page.locator("#contest-question-heading")).toBeVisible();

    await page.getByRole("group", { name: "答案选项" }).getByRole("button").first().click();
    await expect(page.getByText("已保存")).toBeVisible();
    await expect(page.getByRole("button", { name: "第 1 题，已作答" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "交卷" }).click();
    await expect(page.getByRole("heading", { name: /成绩$/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "成绩概览" }).getByText("未作答", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "逐题回顾" })).toBeVisible();

    await page.goto("/contest");
    await expect(page.getByText(/最佳 /).first()).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await page.request.delete("/api/auth/account", { data: { currentPassword: password } }).catch(() => null);
  }
});
