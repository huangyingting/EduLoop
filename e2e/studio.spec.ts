import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { captureBrowserErrors, login, waitForQuestion } from "./browser-helpers";
import { SENSITIVE_ACTION_MAX_AGE_SECONDS } from "../src/lib/auth-validation";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");
const authSecret = process.env.AUTH_SECRET
  || "eduloop-development-secret-change-before-production";
const authCookieName = "authjs.session-token";
const consentData = {
  termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
  privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION, consentBasis: "ADULT",
};

test.describe("local content review workflow", () => {
  test.skip(Boolean(externalBaseUrl), "Content review mutations only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const learnerUserId = `e2e-studio-learner-${suffix}`;
  const editorUserId = `e2e-studio-editor-${suffix}`;
  const learnerEmail = `e2e-studio-learner-${suffix}@example.test`;
  const editorEmail = `e2e-studio-editor-${suffix}@example.test`;
  const password = "e2e-studio-password-123";
  const questionId = `e2e-studio-question-${suffix}`;
  const questionStem = `浏览器审核流程测试题 ${suffix}：1 + 1 等于多少？`;

  test.beforeAll(async () => {
    const catalogQuestion = await prisma.question.findFirstOrThrow({
      where: { status: "PUBLISHED" },
      select: { subjectId: true, gradeBandId: true, gradeId: true },
    });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        id: learnerUserId,
        ...consentData,
        email: learnerEmail,
        emailVerified: new Date(),
        name: "浏览器报告学习者",
        passwordHash,
        learner: { create: { displayName: "浏览器报告学习者" } },
      },
    });
    await prisma.user.create({
      data: {
        id: editorUserId,
        ...consentData,
        email: editorEmail,
        emailVerified: new Date(),
        name: "浏览器内容编辑",
        passwordHash,
        role: "CONTENT_EDITOR",
        learner: { create: { displayName: "浏览器内容编辑" } },
      },
    });
    await prisma.question.create({
      data: {
        id: questionId,
        sourceId: questionId,
        sourceFile: "e2e/content-studio.json",
        sourceType: "单选题",
        type: "SINGLE_CHOICE",
        difficulty: "EASY",
        sourceDifficulty: "EASY",
        difficultyReason: "Synthetic browser workflow fixture",
        stem: questionStem,
        answer: "B",
        correctAnswer: JSON.stringify(["B"]),
        explanation: "浏览器审核测试解析：1 + 1 = 2。",
        status: "PUBLISHED",
        isAutoGradable: true,
        optionSplit: true,
        ...catalogQuestion,
        options: {
          create: [
            { label: "A", content: "1", sortOrder: 0 },
            { label: "B", content: "2", sortOrder: 1 },
          ],
        },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.questionReport.deleteMany({ where: { questionId } });
    await prisma.user.deleteMany({ where: { id: { in: [learnerUserId, editorUserId] } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.$disconnect();
  });

  test("learner report can be quarantined, resolved, reopened, and audited", async ({ page }) => {
    test.setTimeout(90_000);
    const browserErrors = captureBrowserErrors(page);
    const practicePath = `/practice?questionId=${encodeURIComponent(questionId)}`;

    await login(page, learnerEmail, password, practicePath);
    await waitForQuestion(page);
    await expect(page.locator("#practice-question-heading")).toContainText(questionStem);
    await page.getByRole("button", { name: "这道题有问题" }).click();
    await page.getByRole("combobox", { name: "问题类型" }).click();
    await page.getByRole("option", { name: "公式或排版问题" }).click();
    await page.getByPlaceholder("可选：补充具体情况").fill("浏览器测试报告：题目排版需要人工复核。");
    await page.getByRole("button", { name: "提交反馈" }).click();
    await expect(page.getByText("已收到反馈，谢谢你帮助改进题目。")).toBeVisible();

    await page.locator("article button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "提交答案" }).click();
    await expect(page.getByText("差一点，找到新线索了")).toBeVisible();
    await page.goto("/review");
    const reviewCard = page.locator("article").filter({ hasText: questionStem });
    await expect(reviewCard).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await reviewCard.getByRole("button", { name: "移出复习清单" }).click();
    await expect(reviewCard).toHaveCount(0);

    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await login(page, editorEmail, password, "/studio");
    await expect(page.getByRole("heading", { name: "内容审核台" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /近 28 天学习循环/ })).toBeVisible();

    let reportCard = page.locator("article").filter({ hasText: questionStem });
    await expect(reportCard).toHaveCount(1);
    await reportCard.getByText("查看答案与解析").click();
    await expect(reportCard.getByText(/浏览器审核测试解析/)).toBeVisible();

    const note = reportCard.getByPlaceholder("记录核对来源、判断或修复说明（解决时必填）");
    await note.fill("短");
    await reportCard.getByRole("button", { name: "记录为已解决" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "至少 3 个字符" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await reportCard.getByRole("button", { name: "立即隔离题目" }).click();
    await expect(reportCard.getByText("已隔离", { exact: true })).toBeVisible();
    await expect(reportCard.getByText("源数据已通过；解决最后一条报告后恢复")).toBeVisible();
    await expect.poll(async () => (await prisma.question.findUniqueOrThrow({ where: { id: questionId } })).status).toBe("NEEDS_REVIEW");
    await expect.poll(async () => (await prisma.question.findUniqueOrThrow({ where: { id: questionId } })).quarantinedAt).not.toBeNull();
    expect((await page.request.get(`/api/questions/next?questionId=${encodeURIComponent(questionId)}`)).status()).toBe(404);

    reportCard = page.locator("article").filter({ hasText: questionStem });
    await reportCard.getByPlaceholder("记录核对来源、判断或修复说明（解决时必填）").fill("已核对合成测试题，记录审核结论。");
    await reportCard.getByRole("button", { name: "记录为已解决" }).click();
    await expect(reportCard).toHaveCount(0);
    await expect.poll(() => prisma.question.findUniqueOrThrow({ where: { id: questionId } })).toMatchObject({
      status: "PUBLISHED",
      quarantinedAt: null,
    });

    await page.getByRole("tab", { name: /已解决/ }).click();
    reportCard = page.locator("article").filter({ hasText: questionStem });
    await expect(reportCard).toHaveCount(1);
    await expect(reportCard.getByText(/已解决报告/)).toBeVisible();
    await expect(reportCard.getByText("已核对合成测试题，记录审核结论。")).toBeVisible();
    await reportCard.getByRole("button", { name: "重新打开" }).click();
    await expect(reportCard).toHaveCount(0);

    await page.getByRole("tab", { name: /待处理/ }).click();
    reportCard = page.locator("article").filter({ hasText: questionStem });
    await expect(reportCard).toHaveCount(1);
    await expect(reportCard.getByText(/重新打开报告/)).toBeVisible();
    await reportCard.getByPlaceholder("记录核对来源、判断或修复说明（解决时必填）").fill("重新确认后保持已解决状态。");
    await reportCard.getByRole("button", { name: "记录为已解决" }).click();
    await expect(reportCard).toHaveCount(0);

    const staleToken = await encode({
      token: {
        sub: editorUserId,
        sessionVersion: 0,
        authenticatedAt: Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
      },
      secret: authSecret,
      salt: authCookieName,
      maxAge: 30 * 24 * 60 * 60,
    });
    await page.context().addCookies([{
      name: authCookieName,
      value: staleToken,
      url: new URL(page.url()).origin,
      httpOnly: true,
      sameSite: "Lax",
    }]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "重新验证审核账号" })).toBeVisible();
    await expect(page.getByText("完整答案、学习指标和题目状态变更只在登录验证后的 10 分钟内开放。"))
      .toBeVisible();
    await page.getByRole("button", { name: "重新登录验证" }).click();
    await expect(page).toHaveURL((url) => (
      url.pathname === "/login" && url.searchParams.get("next") === "/studio"
    ));
    await expect(page.getByLabel("邮箱")).toBeVisible();

    expect(browserErrors).toEqual([]);
  });
});
