import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CatalogImportRefused, RETIRED_STATUS, importCatalog, type CatalogQuestion } from "@/lib/catalog-import";
import { normalizeSourceQuestion } from "@/lib/content";
import { transitionContentReport } from "@/lib/content-review";
import { prisma } from "@/lib/prisma";

const sourceFile = "catalog-import-integration.json";
const subjectName = "导入测试数学";
const bandName = "导入测试初中";
const gradeName = "导入测试七年级";
const userId = "catalog-import-learner";
const questionIds = Array.from({ length: 8 }, (_, index) => `catalog-import-question-${index + 1}`);
const dimensionKeys = ["TOPIC", "SKILL", "FORMAT"] as const;
let createdDimensionIds: string[] = [];
let preexistingTagIds = new Set<string>();

function catalogQuestion(id: string, stem = `${id}: 1 + 1 等于？`): CatalogQuestion {
  const normalized = normalizeSourceQuestion({
    id,
    subject: "数学",
    grade: "七年级",
    type: "单选题",
    difficulty: "容易",
    sourcePaper: "",
    stem,
    options: { A: "1", B: "2" },
    answer: "B",
    solutions: ["1 + 1 = 2。"],
    tags: [],
  }, sourceFile);
  return { ...normalized, subjectName, gradeBandName: bandName, gradeName };
}

function catalog(ids: string[]) {
  return ids.map((id) => catalogQuestion(id));
}

const scope = { retireScope: { sourceFiles: [sourceFile] } };

beforeAll(async () => {
  preexistingTagIds = new Set((await prisma.tag.findMany({ select: { id: true } })).map(({ id }) => id));
  const subject = await prisma.subject.create({ data: { slug: "catalog-import-math", name: subjectName, icon: "∑", color: "#6c5ce7" } });
  const band = await prisma.gradeBand.create({ data: { slug: "catalog-import-middle", name: bandName } });
  await prisma.grade.create({ data: { slug: "catalog-import-grade-7", name: gradeName, sortOrder: 7, gradeBandId: band.id } });
  createdDimensionIds = [];
  for (const [index, key] of dimensionKeys.entries()) {
    const existing = await prisma.tagDimension.findUnique({ where: { key } });
    if (!existing) {
      const created = await prisma.tagDimension.create({ data: { key, label: key, sortOrder: index } });
      createdDimensionIds.push(created.id);
    }
  }
  await prisma.user.create({ data: {
    id: userId,
    email: "catalog-import-learner@example.com",
    learner: { create: {} },
  } });
  expect(subject.id).toBeTruthy();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.question.deleteMany({ where: { sourceFile } });
  await prisma.tag.deleteMany({ where: { id: { notIn: [...preexistingTagIds] }, questions: { none: {} } } });
  await prisma.tagDimension.deleteMany({ where: { id: { in: createdDimensionIds } } });
  await prisma.grade.deleteMany({ where: { slug: "catalog-import-grade-7" } });
  await prisma.gradeBand.deleteMany({ where: { slug: "catalog-import-middle" } });
  await prisma.subject.deleteMany({ where: { slug: "catalog-import-math" } });
  await prisma.$disconnect();
});

describe("catalog import lifecycle", () => {
  it("retires removed questions without deleting learner or moderation history", async () => {
    const first = await importCatalog(prisma, catalog(questionIds), scope);
    expect(first).toMatchObject({ created: 8, updated: 0, retired: 0 });

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } });
    const retiredId = questionIds[1];
    await prisma.practiceAttempt.create({ data: {
      learnerId: learner.id, questionId: retiredId, response: "[\"A\"]", isCorrect: false, earnedXp: 2,
    } });
    await prisma.reviewItem.create({ data: {
      learnerId: learner.id, questionId: retiredId, lastAttemptAt: new Date(),
    } });
    await prisma.savedQuestion.create({ data: { learnerId: learner.id, questionId: retiredId } });
    const report = await prisma.questionReport.create({ data: {
      learnerId: learner.id, questionId: retiredId, category: "UNCLEAR",
    } });
    await prisma.contentReviewAction.create({ data: { reportId: report.id, action: "NOTE" } });

    const dryRun = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== retiredId)), {
      ...scope,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({ dryRun: true, retired: 1 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: retiredId } }))
      .toMatchObject({ status: "PUBLISHED", retiredAt: null });

    const second = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== retiredId)), scope);
    expect(second).toMatchObject({ retired: 1, updated: 0, unchanged: 7 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: retiredId } })).toMatchObject({
      status: RETIRED_STATUS,
      importStatus: RETIRED_STATUS,
      retiredAt: expect.any(Date),
    });
    expect(await prisma.practiceAttempt.count({ where: { questionId: retiredId } })).toBe(1);
    expect(await prisma.reviewItem.count({ where: { questionId: retiredId } })).toBe(1);
    expect(await prisma.savedQuestion.count({ where: { questionId: retiredId } })).toBe(1);
    expect(await prisma.questionReport.count({ where: { questionId: retiredId } })).toBe(1);
    expect(await prisma.contentReviewAction.count({ where: { reportId: report.id } })).toBe(1);

    const revived = await importCatalog(prisma, catalog(questionIds), scope);
    expect(revived).toMatchObject({ revived: 1, retired: 0, updated: 1, unchanged: 7 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: retiredId } }))
      .toMatchObject({ status: "PUBLISHED", importStatus: "PUBLISHED", retiredAt: null });
  });

  it("skips an unchanged catalog and rewrites only changed questions", async () => {
    const before = new Map((await prisma.question.findMany({
      where: { sourceFile }, select: { id: true, updatedAt: true },
    })).map(({ id, updatedAt }) => [id, updatedAt.getTime()]));
    const releasesBefore = await prisma.catalogRelease.count();

    const noOp = await importCatalog(prisma, catalog(questionIds), scope);
    expect(noOp).toMatchObject({ skipped: true, created: 0, updated: 0, unchanged: 8 });
    expect(await prisma.catalogRelease.count()).toBe(releasesBefore);

    const editedId = questionIds[4];
    const edited = await importCatalog(prisma, questionIds.map((id) => (
      id === editedId ? catalogQuestion(id, `${id}: 2 + 2 等于？`) : catalogQuestion(id)
    )), scope);
    expect(edited).toMatchObject({ skipped: false, updated: 1, unchanged: 7 });
    const after = await prisma.question.findMany({ where: { sourceFile }, select: { id: true, stem: true, updatedAt: true } });
    for (const question of after) {
      if (question.id === editedId) expect(question.stem).toContain("2 + 2");
      else expect(question.updatedAt.getTime()).toBe(before.get(question.id));
    }
    expect(await prisma.questionOption.count({ where: { questionId: editedId } })).toBe(2);
    expect(await prisma.catalogRelease.findFirstOrThrow({ orderBy: { completedAt: "desc" } }))
      .toMatchObject({ scope: `files:${sourceFile}`, updated: 1, unchanged: 7, manifestHash: edited.manifestHash });
    await importCatalog(prisma, catalog(questionIds), scope);
  });

  it("rolls back every write when an import fails partway through", async () => {
    const broken = catalog(questionIds).map((question, index) => (
      index === 6 ? { ...question, stem: "changed before failure", gradeName: "不存在的年级" } : question
    ));
    broken[1] = { ...broken[1], stem: "this change must roll back" };
    // Two-question batches make the first changed batch write before the
    // later invalid batch throws, so this exercises a real rollback.
    await expect(importCatalog(prisma, broken, { ...scope, batchSize: 2 })).rejects.toThrow(/Unknown grade/);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionIds[1] } }))
      .toMatchObject({ stem: expect.not.stringContaining("roll back") });
  });

  it("refuses mass retirement unless it is explicitly allowed", async () => {
    const remaining = questionIds.slice(0, 2);
    await expect(importCatalog(prisma, catalog(remaining), scope)).rejects.toBeInstanceOf(CatalogImportRefused);
    expect(await prisma.question.count({ where: { sourceFile, status: "PUBLISHED" } })).toBe(8);

    await expect(importCatalog(prisma, [], scope)).rejects.toThrow(/empty/);

    const allowed = await importCatalog(prisma, catalog(remaining), { ...scope, allowRetire: 6 });
    expect(allowed.retired).toBe(6);
    expect(await prisma.question.count({ where: { sourceFile, status: RETIRED_STATUS } })).toBe(6);
    await importCatalog(prisma, catalog(questionIds), scope);
  });

  it("moves learner history from a superseded duplicate onto its replacement", async () => {
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } });
    const [replacementId, , , duplicateId] = questionIds;
    await prisma.practiceAttempt.create({ data: {
      learnerId: learner.id, questionId: duplicateId, response: "[\"B\"]", isCorrect: true, earnedXp: 10,
    } });
    await prisma.reviewItem.create({ data: { learnerId: learner.id, questionId: duplicateId, lastAttemptAt: new Date() } });
    await prisma.reviewItem.create({ data: { learnerId: learner.id, questionId: replacementId, lastAttemptAt: new Date() } });
    await prisma.savedQuestion.create({ data: { learnerId: learner.id, questionId: duplicateId } });

    const summary = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== duplicateId)), {
      ...scope,
      supersededSourceIds: { [duplicateId]: replacementId },
    });
    expect(summary).toMatchObject({ retired: 1, superseded: 1 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: duplicateId } }))
      .toMatchObject({ status: RETIRED_STATUS, supersededById: replacementId });
    expect(await prisma.practiceAttempt.count({ where: { questionId: duplicateId } })).toBe(0);
    expect(await prisma.practiceAttempt.count({ where: { questionId: replacementId, learnerId: learner.id } })).toBe(1);
    expect(await prisma.reviewItem.count({ where: { learnerId: learner.id, questionId: { in: [duplicateId, replacementId] } } })).toBe(1);
    expect(await prisma.savedQuestion.findMany({
      where: { learnerId: learner.id, questionId: { in: [duplicateId, replacementId] } },
      select: { questionId: true },
    })).toEqual([{ questionId: replacementId }]);

    const repeated = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== duplicateId)), {
      ...scope,
      supersededSourceIds: { [duplicateId]: replacementId },
    });
    expect(repeated).toMatchObject({ retired: 0, superseded: 0 });
    await importCatalog(prisma, catalog(questionIds), scope);
  });

  it("keeps a quarantined question retired after its final report is resolved", async () => {
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } });
    const questionId = questionIds[2];
    const report = await prisma.questionReport.create({ data: {
      learnerId: learner.id, questionId, category: "WRONG_ANSWER",
    } });
    expect(await transitionContentReport({ reportId: report.id, action: "QUARANTINE" }))
      .toMatchObject({ status: "UPDATED" });

    await importCatalog(prisma, catalog(questionIds.filter((id) => id !== questionId)), scope);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionId } }))
      .toMatchObject({ status: "NEEDS_REVIEW", importStatus: RETIRED_STATUS });

    expect(await transitionContentReport({ reportId: report.id, action: "RESOLVE", note: "Retired upstream." }))
      .toMatchObject({ status: "UPDATED" });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionId } }))
      .toMatchObject({ status: RETIRED_STATUS, quarantinedAt: null });
  });
});
