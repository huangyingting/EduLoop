import { ASSET_REVIEW_STATUS, TAG_SOURCE } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { assetDigest, detectImageType } from "./assets";

// Stores an uploaded diagram in the database and attaches it as a curated
// asset in DRAFT; it is served to learners only after an editor approves it.
export async function storeCuratedAsset(input: { questionId: string; role: string; altText: string; bytes: Uint8Array }) {
  const contentType = detectImageType(input.bytes);
  if (!contentType) return { status: "UNSUPPORTED_TYPE" as const };
  const question = await prisma.question.findUnique({ where: { id: input.questionId }, select: { id: true } });
  if (!question) return { status: "NOT_FOUND" as const };
  const sha256 = assetDigest(input.bytes);
  const blob = await prisma.assetBlob.upsert({
    where: { sha256 },
    create: { sha256, contentType, bytes: Buffer.from(input.bytes) },
    update: {},
    select: { id: true },
  });
  const asset = await prisma.questionAsset.upsert({
    where: { questionId_role: { questionId: input.questionId, role: input.role } },
    create: {
      questionId: input.questionId, role: input.role, kind: "DIAGRAM", path: `/api/assets/${blob.id}`,
      altText: input.altText, source: TAG_SOURCE.CURATED, reviewStatus: ASSET_REVIEW_STATUS.DRAFT,
    },
    update: { path: `/api/assets/${blob.id}`, altText: input.altText, source: TAG_SOURCE.CURATED, reviewStatus: ASSET_REVIEW_STATUS.DRAFT, version: { increment: 1 } },
    select: { id: true, role: true, path: true, altText: true, reviewStatus: true },
  });
  return { status: "STORED" as const, asset };
}

export async function setAssetStatus(assetId: string, reviewStatus: string) {
  const updated = await prisma.questionAsset.updateMany({ where: { id: assetId }, data: { reviewStatus } });
  return updated.count > 0;
}
