import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const dimensions = await prisma.tagDimension.findMany({
    where: { isFilterable: true }, orderBy: { sortOrder: "asc" },
    include: {
      tags: {
        where: { questions: { some: { question: { status: "PUBLISHED" } } } },
        orderBy: { label: "asc" }, select: { slug: true, label: true },
      },
    },
  });
  return NextResponse.json(dimensions.map((dimension) => ({ key: dimension.key, label: dimension.label, tags: dimension.tags })));
}
