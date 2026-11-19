import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { ASSET_REVIEW_STATUS } from "@/lib/domain-constants";
import { ASSET_ROLE_PATTERN, MAX_ASSET_BYTES } from "@/lib/studio/assets";
import { setAssetStatus, storeCuratedAsset } from "@/lib/studio/asset-store";

export const runtime = "nodejs";

const reviewSchema = z.object({
  assetId: z.string().min(8).max(100),
  reviewStatus: z.enum([ASSET_REVIEW_STATUS.APPROVED, ASSET_REVIEW_STATUS.DRAFT]),
});

// Multipart upload: questionId, role (STEM or OPTION_A..E), altText, file.
async function postAsset(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ASSET_BYTES + 64 * 1024) {
    return apiError("Upload too large", 413, "PAYLOAD_TOO_LARGE", { maxBytes: MAX_ASSET_BYTES });
  }
  const limited = await enforceRateLimit(request, "studio-assets", { identity: operator.user.id, identityLimit: 20 }, 10 * 60_000);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const questionId = String(form?.get("questionId") ?? "");
  const role = String(form?.get("role") ?? "");
  const altText = String(form?.get("altText") ?? "").trim();
  if (!(file instanceof File) || !questionId || !ASSET_ROLE_PATTERN.test(role) || altText.length < 2 || altText.length > 300) {
    return apiError("Invalid asset upload", 400, "INVALID_REQUEST");
  }
  if (file.size > MAX_ASSET_BYTES) return apiError("Upload too large", 413, "PAYLOAD_TOO_LARGE", { maxBytes: MAX_ASSET_BYTES });
  const outcome = await storeCuratedAsset({ questionId, role, altText, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (outcome.status === "UNSUPPORTED_TYPE") return apiError("Only PNG, JPEG, or WebP images are accepted", 400, "INVALID_REQUEST");
  if (outcome.status === "NOT_FOUND") return apiError("Question not found", 404, "NOT_FOUND");
  return NextResponse.json(outcome.asset, { status: 201 });
}

async function patchAsset(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reviewSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid asset review", 400, "INVALID_REQUEST");
  return await setAssetStatus(parsed.data.assetId, parsed.data.reviewStatus)
    ? NextResponse.json({ updated: true })
    : apiError("Asset not found", 404, "NOT_FOUND");
}

export const POST = apiHandler("POST /api/studio/assets", postAsset);
export const PATCH = apiHandler("PATCH /api/studio/assets", patchAsset);
