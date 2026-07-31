import { expect, test } from "@playwright/test";
import { captureBrowserErrors, waitForQuestion } from "./browser-helpers";

const unavailableResponse = {
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "Injected browser recovery test failure" }),
};

function clearExpectedServiceUnavailable(errors: string[]) {
  expect(errors.filter((error) => !/^console: Failed to load resource: the server responded with a status of 503/.test(error))).toEqual([]);
  errors.length = 0;
}

test("guest route guards and public authentication entry points work", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/progress");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogress$/);
  await expect(page.getByRole("heading", { name: "欢迎回来，探索者" })).toBeVisible();

  await page.getByRole("link", { name: "免费注册" }).click();
  await expect(page).toHaveURL(/\/register\?next=%2Fprogress$/);
  await expect(page.getByRole("heading", { name: "创建你的学习账号" })).toBeVisible();
  await expect(page.getByRole("link", { name: /匿名访客练习/ })).toHaveAttribute("href", "/practice");

  await page.goto("/consent?next=%2Fprogress");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogress$/);

  expect(browserErrors).toEqual([]);
});

test("guest can filter, answer, self-assess, and advance without persistent controls", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);

  await page.goto("/practice?subject=math&type=SINGLE_CHOICE&difficulty=EASY");
  await waitForQuestion(page);
  await expect(page.getByText("访客模式 · 本轮仅保存在内存中")).toBeVisible();
  await expect(page.getByRole("button", { name: /收藏题目/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /这道题有问题/ })).toHaveCount(0);

  await page.getByRole("button", { name: "查看提示" }).click();
  await expect(page.getByText("解题提示")).toBeVisible();
  const options = page.locator("article button[aria-pressed]");
  await expect(options.first()).toBeVisible();
  await options.first().click();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("参考答案：")).toBeVisible();
  await expect(page.getByText("1 / 10")).toBeVisible();

  const previousQuestion = await page.locator("#practice-question-heading").innerText();
  await page.getByRole("button", { name: "下一题" }).click();
  await waitForQuestion(page);
  await expect(page.locator("#practice-question-heading")).not.toHaveText(previousQuestion);

  await page.goto("/practice?subject=chinese&type=WRITTEN_RESPONSE");
  await waitForQuestion(page);
  await page.getByRole("textbox", { name: "写下你的思路或答案" }).fill("这是浏览器测试中的作答思路。");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByRole("button", { name: "思路正确" })).toBeVisible();
  await page.getByRole("button", { name: "思路正确" }).click();
  await expect(page.getByRole("button", { name: "下一题" })).toBeEnabled();

  expect(browserErrors).toEqual([]);
});

test("question loading reports a service failure and recovers on retry", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.route("**/api/questions/next*", (route) => route.fulfill(unavailableResponse), { times: 1 });

  await page.goto("/practice");
  const alert = page.getByRole("alert").filter({ hasText: "题目加载失败，请稍后再试。" });
  await expect(alert).toBeVisible();
  clearExpectedServiceUnavailable(browserErrors);
  await alert.getByRole("button", { name: "重试" }).click();
  await waitForQuestion(page);

  expect(browserErrors).toEqual([]);
});

test("mobile navigation traps focus and advanced filters remain usable", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/practice");
  await waitForQuestion(page);
  const menuButton = page.getByRole("button", { name: "打开导航" });
  await menuButton.click();
  const navigation = page.getByRole("complementary", { name: "主要导航" });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("link", { name: "登录保存进度" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "打开导航" })).toBeFocused();

  await page.getByRole("button", { name: /更多筛选/ }).click();
  await page.getByRole("combobox", { name: "选择难度" }).click();
  await page.getByRole("option", { name: "热身" }).click();
  await waitForQuestion(page);
  await expect(page.getByText("已启用 1 个条件")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("account journey persists learning data and enforces studio authorization", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors = captureBrowserErrors(page);
  const email = `e2e-${Date.now()}-${test.info().workerIndex}@example.test`;
  let password = "e2e-password-123";
  let deleted = false;

  try {
    await page.goto("/register?next=%2Fprofile");
    await page.getByLabel("昵称（选填）").fill("浏览器测试探索者");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByLabel("年满 18 岁的学习者").check();
    await page.getByLabel(/我接受 服务条款/).check();
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "学习档案" })).toBeVisible();

    const knowledgeGroup = page.getByRole("group", { name: "知识阶段" });
    await knowledgeGroup.getByRole("button").nth(1).click();
    await page.getByRole("button", { name: "保存学习档案" }).click();
    await expect(page.getByRole("status")).toContainText("学习档案已保存");

    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await page.goto("/login?next=%2Fprogress");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.route("**/api/learner/progress?**", (route) => route.fulfill(unavailableResponse), { times: 1 });
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(/\/progress$/, { timeout: 30_000 });
    let recoveryAlert = page.getByRole("alert").filter({ hasText: "成长记录加载失败，请稍后再试。" });
    await expect(recoveryAlert).toBeVisible();
    clearExpectedServiceUnavailable(browserErrors);
    await recoveryAlert.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();

    await page.goto("/practice?subject=math&type=SINGLE_CHOICE&difficulty=EASY");
    await waitForQuestion(page);
    await page.getByRole("button", { name: "收藏题目" }).click();
    await expect(page.getByRole("button", { name: "取消收藏" })).toBeVisible();
    await page.locator("article button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText("参考答案：")).toBeVisible();

    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();
    await expect(page.getByText("累计完成", { exact: true })).toBeVisible();

    await page.route("**/api/review", (route) => route.fulfill(unavailableResponse), { times: 1 });
    await page.goto("/review");
    recoveryAlert = page.getByRole("alert").filter({ hasText: "复习清单加载失败，请稍后再试。" });
    await expect(recoveryAlert).toBeVisible();
    clearExpectedServiceUnavailable(browserErrors);
    await recoveryAlert.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "把错题变成新线索" })).toBeVisible();
    await page.getByRole("tab", { name: /我的收藏/ }).click();
    await expect(page.getByRole("link", { name: /练习这题/ })).toBeVisible();

    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "没有审核权限" })).toBeVisible();

    await page.goto("/privacy");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载 JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^eduloop-learning-data-\d{4}-\d{2}-\d{2}\.json$/);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除我的学习记录" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "我的成长星图" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "你的第一颗星，正在等你点亮" })).toBeVisible();
    const clearedProgress = await page.request.get("/api/learner/progress?timeZone=UTC");
    expect(clearedProgress.ok()).toBe(true);
    expect((await clearedProgress.json() as { summary: { totalAttempts: number } }).summary.totalAttempts).toBe(0);

    await page.goto("/privacy");
    const updatedPassword = "e2e-updated-password-456";
    await page.getByLabel("当前密码", { exact: true }).fill(password);
    await page.getByLabel("新密码").fill(updatedPassword);
    await page.getByRole("button", { name: "更新密码" }).click();
    await expect(page.getByText("密码已更新，其他设备上的登录会话已退出。")).toBeVisible();
    password = updatedPassword;

    await page.getByLabel("输入当前密码确认").fill(password);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "删除账号与数据" }).click();
    await expect(page).toHaveURL(/\/practice$/, { timeout: 30_000 });
    await expect(page.getByText("访客模式 · 本轮仅保存在内存中")).toBeVisible();
    deleted = true;

    expect(browserErrors).toEqual([]);
  } finally {
    if (!deleted) {
      await page.request.delete("/api/auth/account", { data: { currentPassword: password } }).catch(() => null);
    }
  }
});
