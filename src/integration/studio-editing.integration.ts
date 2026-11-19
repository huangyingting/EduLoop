import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as serveAsset } from "@/app/api/assets/[id]/route";
import { PATCH as reviewAsset, POST as uploadAsset } from "@/app/api/studio/assets/route";
import { PATCH as reviewHint, POST as addHint } from "@/app/api/studio/hints/route";
import { GET as studioQuestions } from "@/app/api/studio/questions/route";
import { PATCH as reviewRevision, POST as createRevision } from "@/app/api/studio/revisions/route";
import { importCatalog, type CatalogQuestion } from "@/lib/catalog-import";
import { normalizeSourceQuestion } from "@/lib/content";
import { prisma } from "@/lib/prisma";
import { authCookie, createConsentingUser, currentConsent, integrationHeaders, jsonRequest } from "./fixtures";

const prefix = "studio-editing";
const sourceFile = `${prefix}.json`;
const questionId = `${prefix}-question-1`;
const editorId = `${prefix}-editor`;
const secondEditorId = `${prefix}-second-editor`;
const learnerIds = [`${prefix}-learner-a`, `${prefix}-learner-b`];
const subjectName = "编辑测试数学";
const bandName = "编辑测试学段";
const gradeName = "编辑测试年级";
let topicId = "";
let createdDimensionIds: string[] = [];
let preexistingTagIds = new Set<string>();

function sourceQuestion(stem: string): CatalogQuestion {
  const normalized = normalizeSourceQuestion({
    id: questionId, subject: "数学", grade: "七年级", type: "单选题", difficulty: "容易", sourcePaper: "",
    stem, options: { A: "1", B: "2" }, answer: "B", solutions: ["本题考查的知识点是加法。1 + 1 = 2。"], tags: [],
  }, sourceFile);
  return { ...normalized, subjectName, gradeBandName: bandName, gradeName };
}

const scope = { retireScope: { sourceFiles: [sourceFile] } };

function getRequest(url: string, cookie: string) {
  return new NextRequest(url, { headers: { ...integrationHeaders, cookie } });
}

async function answer(learnerUserId: string, response: string) {
  const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: learnerUserId } });
  const isCorrect = response === "B";
  await prisma.practiceAttempt.create({ data: { learnerId: learner.id, questionId, response: JSON.stringify([response]), isCorrect, earnedXp: isCorrect ? 10 : 2 } });
  await prisma.learnerSubjectStat.create({ data: {
    learnerId: learner.id, subjectId: (await prisma.question.findUniqueOrThrow({ where: { id: questionId } })).subjectId,
    attempts: 1, correct: isCorrect ? 1 : 0, lastAttemptAt: new Date(),
  } });
  return learner.id;
}

beforeAll(async () => {
  preexistingTagIds = new Set((await prisma.tag.findMany({ select: { id: true } })).map(({ id }) => id));
  await prisma.subject.create({ data: { slug: `${prefix}-math`, name: subjectName, icon: "∑", color: "#6c5ce7" } });
  const band = await prisma.gradeBand.create({ data: { slug: `${prefix}-band`, name: bandName } });
  await prisma.grade.create({ data: { slug: `${prefix}-grade`, name: gradeName, sortOrder: 7, gradeBandId: band.id } });
  createdDimensionIds = [];
  for (const [index, key] of ["TOPIC", "SKILL", "FORMAT"].entries()) {
    if (!await prisma.tagDimension.findUnique({ where: { key } })) {
      createdDimensionIds.push((await prisma.tagDimension.create({ data: { key, label: key, sortOrder: index } })).id);
    }
  }
  await importCatalog(prisma, [sourceQuestion("1 + 1 等于？")], scope);
  const dimension = await prisma.tagDimension.findUniqueOrThrow({ where: { key: "TOPIC" } });
  topicId = (await prisma.tag.create({ data: { slug: `${prefix}-topic`, label: "编辑主题", dimensionId: dimension.id } })).id;
  for (const id of [editorId, secondEditorId]) {
    await prisma.user.create({ data: { id, email: `${id}@example.com`, emailVerified: new Date(), role: "CONTENT_EDITOR", ...currentConsent } });
  }
  for (const id of learnerIds) await createConsentingUser(id);
});

afterAll(async () => {
  delete process.env.CONTENT_REQUIRE_SECOND_APPROVER;
  await prisma.user.deleteMany({ where: { id: { in: [editorId, secondEditorId, ...learnerIds] } } });
  await prisma.question.deleteMany({ where: { sourceFile } });
  await prisma.tag.deleteMany({ where: { id: { notIn: [...preexistingTagIds] }, questions: { none: {} } } });
  await prisma.tagDimension.deleteMany({ where: { id: { in: createdDimensionIds } } });
  await prisma.grade.deleteMany({ where: { slug: `${prefix}-grade` } });
  await prisma.gradeBand.deleteMany({ where: { slug: `${prefix}-band` } });
  await prisma.subject.deleteMany({ where: { slug: `${prefix}-math` } });
  await prisma.assetBlob.deleteMany();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("content studio editing", () => {
  it("keeps the editor workspace behind the operator role and recent login", async () => {
    const learnerCookie = await authCookie(learnerIds[0]);
    expect((await studioQuestions(getRequest(`http://localhost/api/studio/questions?query=${questionId}`, learnerCookie))).status).toBe(403);
    const staleCookie = await authCookie(editorId, 0, Math.floor(Date.now() / 1000) - 3600);
    expect((await studioQuestions(getRequest(`http://localhost/api/studio/questions?query=${questionId}`, staleCookie))).status).toBe(401);
    const cookie = await authCookie(editorId);
    const search = await (await studioQuestions(getRequest(`http://localhost/api/studio/questions?query=${questionId}`, cookie))).json();
    expect(search.questions).toEqual([expect.objectContaining({ id: questionId, edited: false })]);
  });

  it("applies an approved answer-key fix, re-grades attempts, and survives re-import", async () => {
    const [wasWrong, wasRight] = [await answer(learnerIds[0], "A"), await answer(learnerIds[1], "B")];
    const cookie = await authCookie(editorId);
    const created = await createRevision(jsonRequest("http://localhost/api/studio/revisions", "POST", {
      questionId, stem: "1 + 0 等于？", options: [{ label: "A", content: "1" }, { label: "B", content: "2" }],
      answer: "A", correctLabels: ["A"], explanation: "1 + 0 = 1。", topicTagIds: [topicId], reason: "核对原卷后更正题干与答案",
    }, cookie));
    expect(created.status).toBe(201);
    const { id: revisionId } = await created.json();
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionId } })).toMatchObject({ stem: "1 + 1 等于？" });

    const approved = await reviewRevision(jsonRequest("http://localhost/api/studio/revisions", "PATCH", { revisionId, action: "APPROVE" }, cookie));
    expect(await approved.json()).toEqual({ status: "APPLIED", regrade: { checked: 2, nowCorrect: 1, nowIncorrect: 1, learners: 2 } });
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionId } }))
      .toMatchObject({ stem: "1 + 0 等于？", correctAnswer: JSON.stringify(["A"]), revisionId });
    expect(await prisma.practiceAttempt.findFirstOrThrow({ where: { learnerId: wasWrong, questionId } })).toMatchObject({ isCorrect: true, regradedAt: expect.any(Date) });
    expect(await prisma.practiceAttempt.findFirstOrThrow({ where: { learnerId: wasRight, questionId } })).toMatchObject({ isCorrect: false });
    expect(await prisma.learnerSubjectStat.findFirstOrThrow({ where: { learnerId: wasRight } })).toMatchObject({ correct: 0 });
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: wasRight, questionId } } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.questionTag.findMany({ where: { questionId, tag: { dimension: { key: "TOPIC" } } }, select: { tagId: true, source: true } }))
      .toEqual([{ tagId: topicId, source: "CURATED" }]);

    await importCatalog(prisma, [sourceQuestion("1 + 1 等于多少？")], scope);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: questionId } }))
      .toMatchObject({ stem: "1 + 0 等于？", correctAnswer: JSON.stringify(["A"]), revisionId });
  });

  it("requires a different editor for answer-key changes when two-person approval is on", async () => {
    process.env.CONTENT_REQUIRE_SECOND_APPROVER = "true";
    const authorCookie = await authCookie(editorId);
    const created = await (await createRevision(jsonRequest("http://localhost/api/studio/revisions", "POST", {
      questionId, stem: "1 + 0 等于？", options: [{ label: "A", content: "1" }, { label: "B", content: "2" }],
      answer: "B", correctLabels: ["B"], explanation: null, topicTagIds: null, reason: "测试双人审核",
    }, authorCookie))).json();
    const selfApproved = await reviewRevision(jsonRequest("http://localhost/api/studio/revisions", "PATCH", { revisionId: created.id, action: "APPROVE" }, authorCookie));
    expect(selfApproved.status).toBe(409);
    expect((await selfApproved.json()).details).toEqual({ reason: "SECOND_APPROVER_REQUIRED" });

    const reviewerCookie = await authCookie(secondEditorId);
    const approved = await reviewRevision(jsonRequest("http://localhost/api/studio/revisions", "PATCH", { revisionId: created.id, action: "APPROVE" }, reviewerCookie));
    expect((await approved.json()).status).toBe("APPLIED");
    const revisions = await prisma.questionRevision.findMany({ where: { questionId }, orderBy: { createdAt: "asc" }, select: { status: true } });
    expect(revisions.map(({ status }) => status)).toEqual(["SUPERSEDED", "APPROVED"]);
    delete process.env.CONTENT_REQUIRE_SECOND_APPROVER;
  });

  it("curates hints and keeps a rejected derived hint rejected across imports", async () => {
    const cookie = await authCookie(editorId);
    const derived = await prisma.questionHint.findFirstOrThrow({ where: { questionId, source: "DERIVED" } });
    expect((await reviewHint(jsonRequest("http://localhost/api/studio/hints", "PATCH", { hintId: derived.id, reviewStatus: "REJECTED" }, cookie))).status).toBe(200);
    expect((await addHint(jsonRequest("http://localhost/api/studio/hints", "POST", { questionId, content: "想一想加上 0 会怎样。" }, cookie))).status).toBe(201);

    await importCatalog(prisma, [sourceQuestion("1 + 1 等于几？")], scope);
    const hints = await prisma.questionHint.findMany({ where: { questionId }, select: { source: true, reviewStatus: true, content: true } });
    expect(hints).toEqual(expect.arrayContaining([
      { source: "DERIVED", reviewStatus: "REJECTED", content: derived.content },
      { source: "CURATED", reviewStatus: "APPROVED", content: "想一想加上 0 会怎样。" },
    ]));
    expect(hints.filter(({ source }) => source === "DERIVED")).toHaveLength(1);
  });

  it("stores raster uploads as drafts, serves them sandboxed, and rejects SVG", async () => {
    const cookie = await authCookie(editorId);
    const upload = (bytes: Uint8Array<ArrayBuffer>, name: string) => {
      const form = new FormData();
      form.set("questionId", questionId); form.set("role", "STEM"); form.set("altText", "一张示意图");
      form.set("file", new File([bytes], name));
      return uploadAsset(new Request("http://localhost/api/studio/assets", { method: "POST", headers: { cookie, "x-forwarded-for": "198.51.100.42" }, body: form }));
    };
    const svg = await upload(new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"), "figure.svg");
    expect(svg.status).toBe(400);

    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const stored = await upload(png, "figure.png");
    expect(stored.status).toBe(201);
    const asset = await stored.json();
    expect(asset).toMatchObject({ role: "STEM", reviewStatus: "DRAFT", path: expect.stringMatching(/^\/api\/assets\//) });

    const blobId = asset.path.split("/").at(-1);
    const served = await serveAsset(new Request(`http://localhost${asset.path}`), { params: Promise.resolve({ id: blobId }) });
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);

    expect((await reviewAsset(jsonRequest("http://localhost/api/studio/assets", "PATCH", { assetId: asset.id, reviewStatus: "APPROVED" }, cookie))).status).toBe(200);
    expect(await prisma.questionAsset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ reviewStatus: "APPROVED", source: "CURATED" });
  });
});
