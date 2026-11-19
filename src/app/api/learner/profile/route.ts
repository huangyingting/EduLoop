import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { cachedCatalogValue } from "@/lib/catalog-cache";
import { ensureLearnerForUser } from "@/lib/learner-identity";
import { isValidTimeZone } from "@/lib/dates";
import { canChangeTimeZone, learnerProfileInputSchema } from "@/lib/learner-profile";
import { prisma } from "@/lib/prisma";
import { QUESTION_STATUS } from "@/lib/domain-constants";

export const dynamic = "force-dynamic";

async function availableKnowledgeCatalog() {
  return cachedCatalogValue("knowledge-stages", () => prisma.gradeBand.findMany({
    where: { questions: { some: { status: QUESTION_STATUS.PUBLISHED } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      grades: {
        where: { questions: { some: { status: QUESTION_STATUS.PUBLISHED } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, slug: true, name: true },
      },
    },
  }));
}

async function profileResponse(user: { id: string; displayName: string | null }) {
  const [profile, gradeBands] = await Promise.all([
    prisma.learnerProfile.findUnique({
      where: { userId: user.id },
      select: {
        displayName: true,
        timeZone: true,
        knowledgeBand: { select: { slug: true } },
        knowledgeGrade: { select: { slug: true } },
      },
    }),
    availableKnowledgeCatalog(),
  ]);
  return {
    displayName: profile?.displayName ?? user.displayName ?? "",
    knowledgeBand: profile?.knowledgeBand?.slug ?? null,
    knowledgeGrade: profile?.knowledgeGrade?.slug ?? null,
    timeZone: profile?.timeZone ?? null,
    gradeBands: gradeBands.map((band) => ({
      slug: band.slug,
      name: band.name,
      grades: band.grades.map((grade) => ({ slug: grade.slug, name: grade.name })),
    })),
  };
}

async function getProfile(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(
    request,
    "learner-profile-read",
    { identity: user.id, identityLimit: 60 },
  );
  if (limited) return limited;
  return NextResponse.json(await profileResponse(user), { headers: { "Cache-Control": "no-store" } });
}

async function patchProfile(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(
    request,
    "learner-profile",
    { identity: user.id, identityLimit: 20 },
    15 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = learnerProfileInputSchema.safeParse(body.value);
  if (!parsed.success) return apiError("学习档案格式不正确。", 400, "INVALID_REQUEST");

  const catalog = await availableKnowledgeCatalog();
  const band = parsed.data.knowledgeBand
    ? catalog.find(({ slug }) => slug === parsed.data.knowledgeBand)
    : null;
  if (parsed.data.knowledgeBand && !band) {
    return apiError("所选知识阶段当前没有可用题目。", 400, "INVALID_REQUEST");
  }
  const grade = parsed.data.knowledgeGrade
    ? band?.grades.find(({ slug }) => slug === parsed.data.knowledgeGrade)
    : null;
  if (parsed.data.knowledgeGrade && !grade) {
    return apiError("所选年级不属于当前知识阶段。", 400, "INVALID_REQUEST");
  }

  const learner = await ensureLearnerForUser(user.id, user.displayName);
  const requestedTimeZone = parsed.data.timeZone;
  const changesTimeZone = Boolean(requestedTimeZone && requestedTimeZone !== learner.timeZone);
  if (requestedTimeZone && !isValidTimeZone(requestedTimeZone)) {
    return apiError("无法识别所选时区。", 400, "INVALID_REQUEST");
  }
  if (changesTimeZone && learner.timeZone && !canChangeTimeZone(learner.timeZoneUpdatedAt)) {
    return apiError("学习时区每 24 小时只能修改一次。", 409, "CONFLICT");
  }
  const displayName = parsed.data.displayName || null;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name: displayName } }),
    prisma.learnerProfile.update({
      where: { id: learner.id },
      data: {
        displayName,
        knowledgeBandId: band?.id ?? null,
        knowledgeGradeId: grade?.id ?? null,
        ...(changesTimeZone ? { timeZone: requestedTimeZone, timeZoneUpdatedAt: new Date() } : {}),
      },
    }),
  ]);

  return NextResponse.json(await profileResponse({ ...user, displayName }), {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = apiHandler("GET /api/learner/profile", getProfile);
export const PATCH = apiHandler("PATCH /api/learner/profile", patchProfile);
