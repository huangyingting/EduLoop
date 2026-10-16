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
    path: `/question-assets/generated/zh-CN/${VERTICAL_ANGLES_QUESTION_ID}/option-a.svg`,
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
    path: `/question-assets/generated/zh-CN/${VERTICAL_ANGLES_QUESTION_ID}/option-b.svg`,
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
    path: `/question-assets/generated/zh-CN/${VERTICAL_ANGLES_QUESTION_ID}/option-c.svg`,
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
    path: `/question-assets/generated/zh-CN/${VERTICAL_ANGLES_QUESTION_ID}/option-d.svg`,
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
  ["a5eae64bf9503c4d88947f680c9f693e", "丙酮酸脱羧酶催化作用示意图，底物C与酶D结合后分解为产物E和F，反应前后D的形态保持不变。"],
  ["8ef70fc5c12b82a2932b987dd151b5f0", "二倍体生物减数第二次分裂后期细胞示意图，上下两极各有4条染色体，其中每极的第2条和第4条染色体互为同源染色体。"],
  ["fa36ed2a96f34272a49ee7666d357dc5", "甲图为①至④四个时期染色体、染色单体、DNA数量变化柱形图，乙图为a有丝分裂中期、b减数第二次分裂中期、c减数第一次分裂后期、d减数第二次分裂后期四个细胞模式图。"],
  ["54922b46dfbc28f498a1dff7f0bdfc17", "甲组3个密闭透明生态瓶的组成与条件对照表，①号瓶具备光、水草、小金鱼、泥沙，②号瓶无光，③号瓶无泥沙。"],
  ["4f1d8d2f5df3e83fc5622d6476ed18cf", "探究药物V和肾上腺素对小鼠耗氧量影响的实验分组与耗氧量结果表，A组为空白对照，B组注射药物V耗氧量降低，C组注射肾上腺素耗氧量升高，D组同时注射两者耗氧量接近对照组。"],
  ["b7bde20ca0b30a80ac013b03a0166c45", "长为70cm的矩形纸片ABCD沿对称轴EF折叠前后的几何示意图，折叠后AB与CD平行且总距离为60cm。"],
  ["b98ed3fc0c4668aec237c6f23a56fd9b", "方格纸中直角三角形ABC与三角形DEF的位置关系图，三角形ABC绕点A逆时针旋转90度再向右平移6格得到三角形DEF。"],
  ["4fbc1823c2841d62cc022d75a57e3970", "三角形ABC绕点A顺时针旋转得到三角形AB′C′的几何示意图，其中角B为30度，角C为67度，点C′落在边BC上。"],
  ["3fc1aa35c10d807252936da125cd20c3", "竖直条形磁铁N极朝下向水平闭合线圈运动，线圈上标有俯视逆时针方向的电流参考箭头。"],
  ["df56e384715210fb98dcd73be0567a94", "图甲为t=1s时沿x轴负方向传播的简谐横波波形图，图乙为某质元在t=1s时刻经平衡位置向y轴负方向运动的振动图线。"],
  ["6fb547240738f3873ca0baebb6ef4c74", "水平地面上的物体P与竖直轻弹簧相连的示意图，弹簧位于物体P上方，地面在物体P下方提供支持。"],
  ["c7e8723639bd12885a8c4abc5b2347ba", "半偏法测电压表内阻的分压式电路图，滑动变阻器R₁接成分压电路，待测电压表V与电阻箱R₀串联，开关S₂并联在电阻箱R₀两端。"],
] as const;

export const stemDiagramReplacements: readonly DiagramReplacement[] = stemDiagramDefinitions.map(([questionId, altText]) => ({
  questionId,
  role: "STEM",
  kind: "DIAGRAM",
  path: `/question-assets/generated/zh-CN/${questionId}/stem.svg`,
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
