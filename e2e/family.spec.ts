import { expect, test } from "@playwright/test";
import { captureBrowserErrors, waitForQuestion } from "./browser-helpers";

test("a guardian adds a child profile and practices as that child", async ({ page }) => {
  test.setTimeout(180_000);
  const browserErrors = captureBrowserErrors(page);
  const email = `e2e-family-${Date.now()}-${test.info().workerIndex}@example.test`;
  const password = "e2e-family-password-123";

  try {
    await page.goto("/register?next=%2Fprofile");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByLabel("年满 18 岁的学习者").check();
    await page.getByLabel(/我接受 服务条款/).check();
    await page.getByRole("button", { name: "创建账号" }).click();
    await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 });

    const family = page.getByRole("region", { name: "孩子的学习档案" });
    await family.getByLabel("孩子的称呼").fill("小明");
    await expect(family.getByRole("button", { name: "添加孩子" })).toBeDisabled();
    await family.getByLabel(/我是这个孩子的家长或法定监护人/).check();
    await family.getByRole("button", { name: "添加孩子" }).click();
    await expect(family.getByText("小明", { exact: true })).toBeVisible();

    await page.reload();
    await page.getByLabel("正在练习的学习者").selectOption({ label: "小明" });
    await expect(page.getByLabel("正在练习的学习者")).toHaveValue(/.+/, { timeout: 30_000 });

    await page.goto("/practice?type=SINGLE_CHOICE&difficulty=EASY");
    await waitForQuestion(page);
    await page.locator("article button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText("参考答案：")).toBeVisible();

    const familyState = await (await page.request.get("/api/family")).json() as { children: Array<{ displayName: string; xp: number }> };
    expect(familyState.children[0]).toMatchObject({ displayName: "小明" });
    expect(familyState.children[0].xp).toBeGreaterThan(0);
    expect(browserErrors).toEqual([]);
  } finally {
    await page.request.delete("/api/auth/account", { data: { currentPassword: password } }).catch(() => null);
  }
});
