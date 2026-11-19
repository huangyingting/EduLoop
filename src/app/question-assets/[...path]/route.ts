import { questionAssetOrigin, questionAssetResponse } from "@/lib/question-asset-store";

export const dynamic = "force-dynamic";

// Question images ship in public/question-assets by default, and Next.js serves
// those files before this route. Images built without them (see
// docs/operations.md) are fetched from QUESTION_ASSET_ORIGIN and streamed from
// this origin, so pages, the image optimizer, and the CSP keep one origin.
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const origin = questionAssetOrigin();
  if (!origin) return new Response("Not found", { status: 404 });
  return questionAssetResponse(origin, (await context.params).path);
}
