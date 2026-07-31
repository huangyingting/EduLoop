import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { ensureLearnerForUser } from "@/lib/learner-identity";
import { learnerProfileInputSchema } from "@/lib/learner-profile";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function availableKnowledgeCatalog() {
  return prisma.gradeBand.findMany({
    where: { questions: { some: { status: "PUBLISHED" } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      grades: {
        where: { questions: { some: { status: "PUBLISHED" } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, slug: true, name: true },
      },
    },
  });
}

async function profileResponse(user: { id: string; displayName: string | null }) {
  const learner = await ensureLearnerForUser(user.id, user.displayName);
  const [profile, gradeBands] = await Promise.all([
    prisma.learnerProfile.findUniqueOrThrow({
      where: { id: learner.id },
      select: {
        displayName: true,
        knowledgeBand: { select: { slug: true } },
        knowledgeGrade: { select: { slug: true } },
      },
    }),
    availableKnowledgeCatalog(),
  ]);
  return {
    displayName: profile.displayName ?? user.displayName ?? "",
    knowledgeBand: profile.knowledgeBand?.slug ?? null,
    knowledgeGrade: profile.knowledgeGrade?.slug ?? null,
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
  const limited = await enforceRateLimit(request, "learner-profile-read", user.id, 60);
  if (limited) return limited;
  return NextResponse.json(await profileResponse(user), { headers: { "Cache-Control": "no-store" } });
}

async function patchProfile(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(request, "learner-profile", user.id, 20, 15 * 60_000);
  if (limited) return limited;
  const parsed = learnerProfileInputSchema.safeParse(await request.json().catch(() => null));
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
  const displayName = parsed.data.displayName || null;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { name: displayName } }),
    prisma.learnerProfile.update({
      where: { id: learner.id },
      data: {
        displayName,
        knowledgeBandId: band?.id ?? null,
        knowledgeGradeId: grade?.id ?? null,
      },
    }),
  ]);

  return NextResponse.json(await profileResponse({ ...user, displayName }), {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = apiHandler("GET /api/learner/profile", getProfile);
export const PATCH = apiHandler("PATCH /api/learner/profile", patchProfile);
