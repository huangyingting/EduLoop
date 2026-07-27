import type { NormalizedAsset, NormalizedOption, NormalizedTag } from "@/lib/content";

export const VERTICAL_ANGLES_QUESTION_ID = "8c502ae5d1d18e4743ada96d0adf0ebd";

type DiagramRelationship = "ADJACENT" | "DIFFERENT_VERTICES" | "VERTICAL" | "LINEAR_PAIR";

type DiagramReplacement = NormalizedAsset & {
  questionId: string;
  label?: string;
  relationship?: DiagramRelationship;
};

export const verticalAnglesDiagramReplacements: readonly DiagramReplacement[] = [
  {
    questionId: VERTICAL_ANGLES_QUESTION_ID,
    label: "A",
    role: "OPTION_A",
    kind: "DIAGRAM",
    path: `/question-assets/${VERTICAL_ANGLES_QUESTION_ID}/option-a.svg`,
    altText: "三条射线从同一点发出，角1和角2相邻并共用一条边。",
    relationship: "ADJACENT",
    source: "GENERATED_REPLACEMENT",
    reviewStatus: "APPROVED",
    version: 1,
  },
  {
    questionId: VERTICAL_ANGLES_QUESTION_ID,
    label: "B",
    role: "OPTION_B",
    kind: "DIAGRAM",
    path: `/question-assets/${VERTICAL_ANGLES_QUESTION_ID}/option-b.svg`,
    altText: "两个分开的角，角1和角2位于不同顶点。",
    relationship: "DIFFERENT_VERTICES",
    source: "GENERATED_REPLACEMENT",
    reviewStatus: "APPROVED",
    version: 1,
  },
  {
    questionId: VERTICAL_ANGLES_QUESTION_ID,
    label: "C",
    role: "OPTION_C",
    kind: "DIAGRAM",
    path: `/question-assets/${VERTICAL_ANGLES_QUESTION_ID}/option-c.svg`,
    altText: "两条直线相交，角1位于交点上方，角2位于交点下方。",
    relationship: "VERTICAL",
    source: "GENERATED_REPLACEMENT",
    reviewStatus: "APPROVED",
    version: 1,
  },
  {
    questionId: VERTICAL_ANGLES_QUESTION_ID,
    label: "D",
    role: "OPTION_D",
    kind: "DIAGRAM",
    path: `/question-assets/${VERTICAL_ANGLES_QUESTION_ID}/option-d.svg`,
    altText: "两条直线相交，角1位于交点上方，角2位于交点右侧。",
    relationship: "LINEAR_PAIR",
    source: "GENERATED_REPLACEMENT",
    reviewStatus: "APPROVED",
    version: 1,
  },
] as const;

const stemDiagramDefinitions = [
  ["b156f27d686b78a81e9a3b073972ad7c", "一条直线上依次标有A、B、C、D、E、F六个点。"],
  ["e1998463b37e6667bc39585b6d123db2", "直线外一点P处作直线m，截线PQ与m和已知直线l形成一对标记为相等的同位角。"],
  ["f1260031fe91046fd04d2930d97b1ea3", "数轴上从负1到1的区间被标出，负1处为实心点，1处为空心点。"],
  ["f4a3e0f8783ac20e7ee9589b4a4d4388", "AB平行于CD，B、E、C在同一直线上，连接ED，角BED为68度，角CDE为38度。"],
  ["69ecd61d036121917f3312faa13e01ff", "坐标系中绘有横向和纵向两个椭圆，并标出它们内部的重叠区域以及四个焦点。"],
  ["9f9962ef164964171d62dbd37314b016", "简易净水器从上到下装有小石子、石英砂、活性炭和蓬松棉，出水滴入烧杯。"],
  ["e659966a3cf2fbf368b5be54fbda5cc9", "烟雾传感器网罩内有电极II、电极III和镅241放射源IV，外接端点为a和b。"],
  ["ca82813730a15f9dedd6b947cf0335db", "电灯悬挂在O点下方，OB连接左墙，OA连接右墙；A从与O同高的位置向上移动。"],
] as const;

export const stemDiagramReplacements: readonly DiagramReplacement[] = stemDiagramDefinitions.map(([questionId, altText]) => ({
  questionId,
  role: "STEM",
  kind: "DIAGRAM",
  path: `/question-assets/${questionId}/stem.svg`,
  altText,
  source: "GENERATED_REPLACEMENT",
  reviewStatus: "APPROVED",
  version: 1,
}));

export const allDiagramReplacements: readonly DiagramReplacement[] = [
  ...verticalAnglesDiagramReplacements,
  ...stemDiagramReplacements,
];

const diagramAssetsByQuestion = new Map<string, DiagramReplacement[]>();
for (const asset of allDiagramReplacements) {
  const assets = diagramAssetsByQuestion.get(asset.questionId) ?? [];
  assets.push(asset);
  diagramAssetsByQuestion.set(asset.questionId, assets);
}

type ReplacementTarget = {
  id: string;
  stem: string;
  status: string;
  correctAnswer: string | null;
  isAutoGradable: boolean;
  options: NormalizedOption[];
  assets: NormalizedAsset[];
  tags: NormalizedTag[];
};

export function applyQuestionReplacement<T extends ReplacementTarget>(question: T): T {
  const diagramAssets = diagramAssetsByQuestion.get(question.id);
  if (!diagramAssets) return question;
  const assets = diagramAssets.map(({
    role, kind, path, altText, source, reviewStatus, version,
  }) => ({ role, kind, path, altText, source, reviewStatus, version }));
  const status = assets.every((asset) => asset.reviewStatus === "APPROVED") ? "PUBLISHED" : question.status;
  if (question.id !== VERTICAL_ANGLES_QUESTION_ID) return { ...question, status, assets };

  const tags = question.tags.map((tag) => {
    if (tag.dimension === "FORMAT" && tag.slug === "self-assessed") return {
      ...tag,
      slug: "auto-gradable",
      label: "可自动判分",
    };
    if (tag.dimension === "FORMAT" && tag.slug === "written-response") return {
      ...tag,
      slug: "choice",
      label: "选择作答",
    };
    return tag;
  });
  const options = verticalAnglesDiagramReplacements.map(({ label }, sortOrder) => ({
    label: label!,
    content: "",
    sortOrder,
  }));
  return {
    ...question,
    stem: "下列图中，∠1与∠2属于对顶角的是（ ）．",
    status,
    correctAnswer: JSON.stringify(["C"]),
    isAutoGradable: true,
    options,
    assets,
    tags,
  };
}
