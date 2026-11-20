import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CatalogImportRefused, importCatalog, type CatalogQuestion } from "@/lib/catalog-import";
import { normalizeSourceQuestion } from "@/lib/content";
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

const scope = { deleteScope: { sourceFiles: [sourceFile] } };

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
  it("deletes removed questions together with their learner and moderation history", async () => {
    const first = await importCatalog(prisma, catalog(questionIds), scope);
    expect(first).toMatchObject({ created: 8, updated: 0, deleted: 0 });

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId } });
    const removedId = questionIds[1];
    await prisma.practiceAttempt.create({ data: {
      learnerId: learner.id, questionId: removedId, response: "[\"A\"]", isCorrect: false, earnedXp: 2,
    } });
    await prisma.reviewItem.create({ data: {
      learnerId: learner.id, questionId: removedId, lastAttemptAt: new Date(),
    } });
    await prisma.savedQuestion.create({ data: { learnerId: learner.id, questionId: removedId } });
    const report = await prisma.questionReport.create({ data: {
      learnerId: learner.id, questionId: removedId, category: "UNCLEAR",
    } });
    await prisma.contentReviewAction.create({ data: { reportId: report.id, action: "NOTE" } });

    const dryRun = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== removedId)), {
      ...scope,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({ dryRun: true, deleted: 1 });
    expect(await prisma.question.findUnique({ where: { id: removedId } })).not.toBeNull();

    const second = await importCatalog(prisma, catalog(questionIds.filter((id) => id !== removedId)), scope);
    expect(second).toMatchObject({ deleted: 1, updated: 0, unchanged: 7 });
    expect(await prisma.question.findUnique({ where: { id: removedId } })).toBeNull();
    expect(await prisma.practiceAttempt.count({ where: { questionId: removedId } })).toBe(0);
    expect(await prisma.reviewItem.count({ where: { questionId: removedId } })).toBe(0);
    expect(await prisma.savedQuestion.count({ where: { questionId: removedId } })).toBe(0);
    expect(await prisma.questionReport.count({ where: { questionId: removedId } })).toBe(0);
    expect(await prisma.contentReviewAction.count({ where: { reportId: report.id } })).toBe(0);
    expect(await prisma.catalogRelease.findFirstOrThrow({ orderBy: { completedAt: "desc" } })).toMatchObject({ deleted: 1 });

    const restored = await importCatalog(prisma, catalog(questionIds), scope);
    expect(restored).toMatchObject({ created: 1, deleted: 0, unchanged: 7 });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: removedId } })).toMatchObject({ status: "PUBLISHED" });
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

  it("rebuilds derived hints on import while preserving curated ones", async () => {
    const questionId = questionIds[7];
    await prisma.questionHint.create({ data: { questionId, position: 5, content: "编辑补充的提示", source: "CURATED" } });
    const withHint = (id: string) => ({ ...catalogQuestion(id, `${id}: 3 + 4 等于？`), hints: [{ position: 0, content: "这道题考查：加法。" }] });
    await importCatalog(prisma, questionIds.map((id) => (id === questionId ? withHint(id) : catalogQuestion(id))), scope);
    expect((await prisma.questionHint.findMany({ where: { questionId }, orderBy: { position: "asc" } })).map(({ source, content }) => ({ source, content })))
      .toEqual([{ source: "DERIVED", content: "这道题考查：加法。" }, { source: "CURATED", content: "编辑补充的提示" }]);

    await importCatalog(prisma, catalog(questionIds), scope);
    expect(await prisma.questionHint.findMany({ where: { questionId }, select: { source: true } })).toEqual([{ source: "CURATED" }]);
  });

  it("rebuilds contest papers and slots from provenance", async () => {
    const [first, second] = questionIds;
    const slot = (problemNumber: number) => ({ paperKey: "2098-amc-12b", year: 2098, contest: "AMC 12B", level: "AMC-12" as const, problemNumber });
    await importCatalog(prisma, questionIds.map((id) => (
      id === first ? { ...catalogQuestion(id, `${id}: 5 + 5 等于？`), paperSlots: [slot(1)] }
        : id === second ? { ...catalogQuestion(id, `${id}: 6 + 6 等于？`), paperSlots: [slot(2)] }
          : catalogQuestion(id)
    )), scope);
    expect(await prisma.contestPaper.findUniqueOrThrow({ where: { key: "2098-amc-12b" } }))
      .toMatchObject({ level: "AMC-12", questionCount: 25, durationMinutes: 75 });
    expect(await prisma.contestPaperSlot.findMany({ where: { paperKey: "2098-amc-12b" }, orderBy: { problemNumber: "asc" }, select: { questionId: true } }))
      .toEqual([{ questionId: first }, { questionId: second }]);
    await importCatalog(prisma, catalog(questionIds), scope);
    expect(await prisma.contestPaperSlot.count({ where: { paperKey: "2098-amc-12b" } })).toBe(0);
    await prisma.contestPaper.delete({ where: { key: "2098-amc-12b" } });
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

  it("refuses mass deletion unless it is explicitly allowed", async () => {
    const remaining = questionIds.slice(0, 2);
    await expect(importCatalog(prisma, catalog(remaining), scope)).rejects.toBeInstanceOf(CatalogImportRefused);
    expect(await prisma.question.count({ where: { sourceFile, status: "PUBLISHED" } })).toBe(8);

    await expect(importCatalog(prisma, [], scope)).rejects.toThrow(/empty/);

    const allowed = await importCatalog(prisma, catalog(remaining), { ...scope, allowDelete: 6 });
    expect(allowed.deleted).toBe(6);
    expect(await prisma.question.count({ where: { sourceFile } })).toBe(2);
    await importCatalog(prisma, catalog(questionIds), scope);
  });
});
