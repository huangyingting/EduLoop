import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { captureBrowserErrors } from "./browser-helpers";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const externalBaseUrl = process.env.E2E_BASE_URL;
if (!externalBaseUrl && !process.env.DATABASE_URL) process.loadEnvFile(".env");

test.describe("teacher classes", () => {
  test.skip(Boolean(externalBaseUrl), "Class fixtures only run against the local test database.");

  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${process.pid}`;
  const password = "e2e-classes-password-123";
  const teacher = { id: `e2e-teacher-${suffix}`, email: `e2e-teacher-${suffix}@example.test` };
  const student = { id: `e2e-student-${suffix}`, email: `e2e-student-${suffix}@example.test` };

  test.beforeAll(async () => {
    const acceptedAt = new Date();
    const passwordHash = await bcrypt.hash(password, 12);
    for (const [account, role] of [[teacher, "TEACHER"], [student, "LEARNER"]] as const) {
      await prisma.user.create({ data: {
        id: account.id, email: account.email, emailVerified: acceptedAt, passwordHash, role, name: role === "TEACHER" ? "王老师" : "小林",
        termsAcceptedAt: acceptedAt, termsVersion: TERMS_VERSION, privacyAcceptedAt: acceptedAt, privacyVersion: PRIVACY_VERSION, consentBasis: "ADULT",
        learner: { create: { displayName: role === "TEACHER" ? null : "小林" } },
      } });
    }
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [teacher.id, student.id] } } });
    await prisma.$disconnect();
  });

  async function signIn(page: Page, email: string, next: string) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录并继续" }).click();
    await expect(page).toHaveURL(new RegExp(`${next}$`), { timeout: 30_000 });
  }

  test("a teacher sets an assignment and a student joins and sees it", async ({ browser }) => {
    test.setTimeout(180_000);
    const teacherPage = await (await browser.newContext()).newPage();
    const teacherErrors = captureBrowserErrors(teacherPage);
    await signIn(teacherPage, teacher.email, "/teach");
    await teacherPage.getByLabel("班级名称").fill("七年级二班");
    await teacherPage.getByRole("button", { name: "创建班级" }).click();
    await expect(teacherPage.getByRole("heading", { name: "七年级二班" })).toBeVisible();
    const code = (await teacherPage.locator("p.font-mono").first().innerText()).trim();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    await teacherPage.getByLabel("任务名称").fill("热身练习");
    await teacherPage.getByLabel("题目数量").fill("3");
    await teacherPage.getByRole("button", { name: "布置" }).click();
    await expect(teacherPage.getByText("热身练习")).toBeVisible();

    const studentPage = await (await browser.newContext()).newPage();
    const studentErrors = captureBrowserErrors(studentPage);
    await signIn(studentPage, student.email, "/classes");
    await studentPage.getByLabel("班级码").fill(code);
    await studentPage.getByRole("button", { name: "加入班级" }).click();
    await expect(studentPage.getByText("已加入“七年级二班”。")).toBeVisible();
    await expect(studentPage.getByText("热身练习")).toBeVisible();
    await expect(studentPage.getByText("老师：王老师")).toBeVisible();
    await expect(studentPage.getByRole("main").getByRole("link", { name: "开始", exact: true })).toHaveAttribute("href", "/practice");

    await teacherPage.reload();
    await teacherPage.getByRole("button", { name: "查看" }).first().click();
    await expect(teacherPage.getByRole("rowheader", { name: "小林" })).toBeVisible();
    expect(teacherErrors).toEqual([]);
    expect(studentErrors).toEqual([]);
  });
});
