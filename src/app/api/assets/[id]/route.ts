import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assetResponseHeaders } from "@/lib/studio/assets";

export const runtime = "nodejs";

// Uploaded question images, addressed by an unguessable ID and immutable.
async function getAsset(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9]{8,40}$/.test(id)) return apiError("Asset not found", 404, "NOT_FOUND");
  const blob = await prisma.assetBlob.findUnique({ where: { id }, select: { contentType: true, bytes: true } });
  if (!blob) return apiError("Asset not found", 404, "NOT_FOUND");
  return new Response(Buffer.from(blob.bytes), { headers: assetResponseHeaders(blob.contentType, blob.bytes.length) });
}

export const GET = getAsset;
