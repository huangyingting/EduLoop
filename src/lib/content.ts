import {
  curatedChoiceContent,
  curatedQuestionUpdates,
  reviewedSelfContainedVisualIds,
  selfAssessedCompositeIds,
} from "@/lib/content-curation";
import { applyQuestionReplacement } from "@/lib/question-replacements";
import { auditQuestionDifficulty, type Difficulty } from "@/lib/difficulty";

export const SUBJECTS = [
  { slug: "math", name: "数学", icon: "∑", color: "#6c5ce7", description: "数感、代数、几何与数据思维", sortOrder: 1 },
  { slug: "physics", name: "物理", icon: "⚡", color: "#0984e3", description: "从力与运动探索世界规律", sortOrder: 2 },
  { slug: "chemistry", name: "化学", icon: "⚗", color: "#00a67e", description: "理解物质、反应与实验", sortOrder: 3 },
  { slug: "biology", name: "生物", icon: "⌁", color: "#e17055", description: "认识生命、遗传与生态", sortOrder: 4 },
] as const;

export const GRADE_BANDS = [
  { slug: "primary", name: "小学", sortOrder: 1 },
  { slug: "middle", name: "初中", sortOrder: 2 },
  { slug: "high", name: "高中", sortOrder: 3 },
] as const;

export const GRADES = [
  ["grade-1", "一年级", "primary", 1], ["grade-2", "二年级", "primary", 2],
  ["grade-3", "三年级", "primary", 3], ["grade-4", "四年级", "primary", 4],
  ["grade-5", "五年级", "primary", 5], ["grade-6", "六年级", "primary", 6],
  ["grade-7", "七年级", "middle", 7], ["grade-8", "八年级", "middle", 8],
  ["grade-9", "九年级", "middle", 9], ["grade-10", "高一", "high", 10],
  ["grade-11", "高二", "high", 11], ["grade-12", "高三", "high", 12],
] as const;

const GRADE_ORDER_BY_NAME = new Map<string, number>(GRADES.map(([, name, , sortOrder]) => [name, sortOrder]));

export const DIFFICULTIES = [
  { key: "EASY", source: "容易", label: "热身", dot: "●" },
  { key: "MEDIUM", source: "一般", label: "进阶", dot: "●●" },
  { key: "HARD", source: "困难", label: "挑战", dot: "●●●" },
] as const;

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: "单项选择",
  MULTIPLE_CHOICE: "多项选择",
  TRUE_FALSE: "判断",
  FILL_BLANK: "填空",
  COMPUTATION: "计算",
  EXPERIMENT: "实验探究",
  WRITTEN_RESPONSE: "解答",
};

export type SourceQuestion = {
  id: string;
  type: string;
  grade_band: string;
  difficulty: string;
  grade: string;
  course: string;
  paper?: string;
  online_test: boolean;
  option_split: boolean;
  quality?: string;
  question_info: { raw_content: Record<string, unknown> };
  answer_info: { raw_content: string };
  solution_info: Array<{ solution_info: string }>;
  children?: unknown[];
};

export type NormalizedTag = {
  dimension: "TOPIC" | "SKILL" | "FORMAT";
  slug: string;
  label: string;
  confidence: number;
  source: "RULE" | "IMPORT";
};

type TopicRule = { slug: string; label: string; pattern: RegExp };

const TOPIC_RULES: Record<string, TopicRule[]> = {
  数学: [
    { slug: "numbers-arithmetic", label: "数与运算", pattern: /整数|小数|分数|有理数|实数|四则|因数|倍数|质数|数轴|\b(?:integer|digit|prime|divisor|multiple|factor|remainder|fraction|decimal|ratio|percent)\b/i },
    { slug: "algebra-equations", label: "代数与方程", pattern: /代数|方程|不等式|整式|因式分解|二次根式|未知数|\b(?:algebra|equation|inequality|polynomial|quadratic|variable|expression)\b/i },
    { slug: "functions", label: "函数", pattern: /函数|图象|定义域|值域|抛物线|反比例|正比例|\b(?:function|domain|range|parabola)\b/i },
    { slug: "geometry", label: "图形与几何", pattern: /三角形|四边形|长方形|正方形|圆|几何|平行|垂直|面积|周长|体积|棱|角|相似|全等|\b(?:triangle|quadrilateral|rectangle|square|circle|polygon|geometry|parallel|perpendicular|area|perimeter|volume|angle|similar|congruent)\b/i },
    { slug: "coordinates-vectors", label: "坐标与向量", pattern: /坐标|向量|直线方程|空间位置|\b(?:coordinate|vector|slope|x-axis|y-axis)\b/i },
    { slug: "statistics-probability", label: "统计与概率", pattern: /概率|统计|平均数|中位数|众数|方差|频率|抽样|随机|\b(?:probability|statistic|average|mean|median|mode|variance|random)\b/i },
    { slug: "combinatorics", label: "组合与计数", pattern: /排列|组合|计数|\b(?:arrang(?:e|ement)s?|permutations?|combinations?|assortments?|selections?|how many ways)\b/i },
    { slug: "sequences-patterns", label: "数列与规律", pattern: /数列|等差|等比|递推|\b(?:sequence|progression|consecutive|recurrence)\b/i },
    { slug: "trigonometry", label: "三角与解三角形", pattern: /正弦|余弦|正切|三角函数|\b(?:sine|cosine|tangent|sin|cos|tan)\b/i },
    { slug: "calculus", label: "导数", pattern: /导数|极值|单调区间|切线/ },
    { slug: "sets-logic", label: "集合与逻辑", pattern: /集合|命题|充分条件|必要条件|逻辑/ },
  ],
  物理: [
    { slug: "mechanics", label: "力与运动", pattern: /速度|加速度|运动|位移|力|牛顿|动量|冲量|机械能|功率|重力|摩擦|压强|浮力/ },
    { slug: "electricity", label: "电与磁", pattern: /电流|电压|电阻|电路|电场|电荷|磁场|电磁|安培|欧姆|电功/ },
    { slug: "optics", label: "光学", pattern: /光线|光学|反射|折射|透镜|成像|焦距/ },
    { slug: "thermal", label: "热学", pattern: /温度|内能|热量|比热|熔化|凝固|汽化|液化|升华|凝华|物态/ },
    { slug: "waves", label: "振动与波", pattern: /振动|波长|频率|声波|声音|简谐/ },
    { slug: "modern-physics", label: "近代物理", pattern: /原子|原子核|光电效应|量子|相对论|放射/ },
  ],
  化学: [
    { slug: "substances", label: "物质与分类", pattern: /物质|混合物|纯净物|单质|化合物|胶体|溶液|溶解度/ },
    { slug: "chemical-reactions", label: "化学反应", pattern: /反应|方程式|氧化|还原|离子方程式|化合价|生成物/ },
    { slug: "stoichiometry", label: "化学计量", pattern: /物质的量|摩尔|阿伏加德罗|浓度|质量分数|计量/ },
    { slug: "inorganic", label: "无机化学", pattern: /金属|非金属|酸|碱|盐|氧化物|氯|硫|氮|钠|铝|铁|铜/ },
    { slug: "organic", label: "有机化学", pattern: /有机|烷|烯|炔|苯|醇|醛|羧酸|酯|高分子/ },
    { slug: "structure-periodicity", label: "结构与周期律", pattern: /元素周期|电子式|原子结构|化学键|晶体|轨道/ },
    { slug: "electrochemistry", label: "电化学", pattern: /原电池|电解池|电极|电化学|电解质/ },
  ],
  生物: [
    { slug: "cells", label: "细胞", pattern: /细胞|细胞器|细胞膜|细胞核|有丝分裂|减数分裂/ },
    { slug: "metabolism", label: "代谢与能量", pattern: /光合作用|呼吸作用|酶|ATP|代谢|能量/ },
    { slug: "genetics", label: "遗传与变异", pattern: /遗传|基因|DNA|RNA|染色体|突变|孟德尔|性状/ },
    { slug: "ecology", label: "生态", pattern: /生态|种群|群落|生态系统|食物链|环境|生物多样性/ },
    { slug: "physiology", label: "稳态与调节", pattern: /激素|神经|免疫|内环境|稳态|血糖|体温|调节/ },
    { slug: "biotechnology", label: "生物技术", pattern: /基因工程|细胞工程|胚胎工程|发酵|克隆|PCR|生物技术/ },
    { slug: "evolution", label: "进化", pattern: /进化|自然选择|物种|适应/ },
  ],
};

export const TAG_DIMENSIONS = [
  { key: "TOPIC", label: "知识主题", description: "由学科关键词规则生成，适合作为发现与复习入口。", sortOrder: 1 },
  { key: "SKILL", label: "能力维度", description: "题目主要训练的思维或实践能力。", sortOrder: 2 },
  { key: "FORMAT", label: "内容特征", description: "作答方式与内容呈现特征。", sortOrder: 3 },
] as const;

export function normalizeDifficulty(source: string): Difficulty {
  return ({ 容易: "EASY", 一般: "MEDIUM", 困难: "HARD" } as Record<string, Difficulty>)[source] ?? "MEDIUM";
}

export type NormalizedOption = { label: string; content: string; sortOrder: number };

export type NormalizedAsset = {
  role: string;
  kind: "DIAGRAM";
  path: string;
  altText: string;
  source: "GENERATED_REPLACEMENT";
  reviewStatus: "DRAFT" | "APPROVED";
  version: number;
};

function normalizeOptionLabel(label: string) {
  const codePoint = label.toUpperCase().charCodeAt(0);
  return codePoint >= 0xff21 && codePoint <= 0xff25 ? String.fromCharCode(codePoint - 0xfee0) : label.toUpperCase();
}

function extractEmbeddedChoice(question: SourceQuestion) {
  if (question.option_split || !/选择/.test(question.type)) return null;
  const title = String(question.question_info.raw_content.title ?? "");
  const markerPattern = /(?:^|[\s\u3000])(?:[（(]\s*([A-EＡ-Ｅ])\s*[）)]|([A-EＡ-Ｅ])\s*[.．、:：]|([A-EＡ-Ｅ])(?=\s+|[\u3400-\u9fff]))/gi;
  const markers = [...title.matchAll(markerPattern)].map((match) => ({
    label: normalizeOptionLabel(match[1] ?? match[2] ?? match[3]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  if (markers.length < 2 || markers.length > 5) return null;
  if (markers.some((marker, index) => marker.label !== String.fromCharCode(65 + index))) return null;
  const options: NormalizedOption[] = markers.map((marker, index) => ({
    label: marker.label,
    content: title.slice(marker.end, markers[index + 1]?.start ?? title.length).trim(),
    sortOrder: index,
  }));
  if (options.some((option) => !option.content)) return null;
  return { stem: title.slice(0, markers[0].start).trim(), options };
}

export function extractQuestionStem(question: SourceQuestion) {
  const update = curatedQuestionUpdates.get(question.id);
  if (update) return update.stem;
  const curated = curatedChoiceContent.get(question.id);
  if (curated) return curated.stem;
  const rawStem = String(question.question_info.raw_content.title ?? "").trim();
  return extractEmbeddedChoice(question)?.stem || rawStem;
}

export function extractOptions(question: SourceQuestion) {
  const update = curatedQuestionUpdates.get(question.id);
  if (update?.options) return update.options.map((content, sortOrder) => ({
    label: String.fromCharCode(65 + sortOrder), content, sortOrder,
  }));
  const curated = curatedChoiceContent.get(question.id);
  if (curated) return curated.options.map((content, sortOrder) => ({
    label: String.fromCharCode(65 + sortOrder), content, sortOrder,
  }));
  const raw = question.question_info.raw_content;
  const options: NormalizedOption[] = ["a", "b", "c", "d", "e"]
    .map((letter, index) => ({
      label: letter.toUpperCase(),
      content: String(raw[`option_${letter}`] ?? "").trim(),
      sortOrder: index,
    }))
    .filter((option) => option.content.length > 0);
  if (!options.length && /判断/.test(question.type)) return [
    { label: "A", content: "正确", sortOrder: 0 },
    { label: "B", content: "错误", sortOrder: 1 },
  ];
  return options.length ? options : extractEmbeddedChoice(question)?.options ?? [];
}

function directChoiceLabels(value: string) {
  const cleaned = value.replace(/\$|\\rm|[{}（）()\[\]]/g, " ").trim().toUpperCase();
  const direct = cleaned.match(/^(?:答案?[：:\s]*)?([A-E](?:[\s,，、;；|]*[A-E])*)[.。．]?$/);
  const selected = cleaned.match(/(?:故选|答案(?:为|是)?|正确选项(?:为|是)?)[：:\s]*([A-E](?:[\s,，、;；|]*[A-E])*)/);
  const match = direct ?? selected;
  return match ? [...new Set(match[1].match(/[A-E]/g) ?? [])].sort() : [];
}

export function extractCorrectLabels(question: SourceQuestion) {
  const raw = question.question_info.raw_content;
  if (/判断/.test(question.type)) {
    const answer1 = String(raw.answer1 ?? "").trim();
    const fullAnswer = String(question.answer_info.raw_content ?? "").trim();
    const candidate = answer1 && !answer1.includes("$###$") ? answer1 : fullAnswer;
    const unwrapped = candidate
      .replace(/^\s*【(?:答案|解答)】\s*/, "")
      .replace(/^\s*[（(]\s*\d+\s*[）)]\s*/, "")
      .trim();
    const finalMark = candidate.match(/(?:故答案为|答案为|答案是)[：:\s]*(√|×|正确|错误|对|错|A|B)/i);
    const directMark = unwrapped.match(/^\s*(√|×|正确|错误|对|错|A|B)[。．.\s]*$/i);
    const mark = finalMark?.[1] ?? directMark?.[1];
    if (mark) return /^(√|正确|对|A)$/i.test(mark) ? ["A"] : ["B"];
  }
  const fromAnswer1 = directChoiceLabels(String(raw.answer1 ?? ""));
  const labels = fromAnswer1.length ? fromAnswer1 : directChoiceLabels(String(question.answer_info.raw_content ?? ""));
  const available = new Set(extractOptions(question).map((option) => option.label));
  return labels.filter((label) => available.has(label));
}

export function normalizeQuestionType(question: SourceQuestion) {
  const updatedType = curatedQuestionUpdates.get(question.id)?.type;
  if (updatedType) return updatedType;
  if (selfAssessedCompositeIds.has(question.id)) return "WRITTEN_RESPONSE";
  const source = question.type;
  const labels = extractCorrectLabels(question);
  if (/多选|双选|不定项/.test(source) || (/选择题/.test(source) && labels.length > 1)) return "MULTIPLE_CHOICE";
  if (/单选|选择题/.test(source)) return "SINGLE_CHOICE";
  if (/判断/.test(source)) return "TRUE_FALSE";
  if (/填空|单空|多空/.test(source)) return "FILL_BLANK";
  if (/计算/.test(source)) return "COMPUTATION";
  if (/实验|探究/.test(source)) return "EXPERIMENT";
  return "WRITTEN_RESPONSE";
}

function addTag(tags: NormalizedTag[], tag: NormalizedTag) {
  if (!tags.some((item) => item.dimension === tag.dimension && item.slug === tag.slug)) tags.push(tag);
}

export function inferTags(question: SourceQuestion): NormalizedTag[] {
  const stem = extractQuestionStem(question);
  const combined = `${stem} ${question.solution_info.map((item) => item.solution_info).join(" ")}`;
  const type = normalizeQuestionType(question);
  const tags: NormalizedTag[] = [];

  for (const rule of TOPIC_RULES[question.course] ?? []) {
    if (rule.pattern.test(combined)) addTag(tags, { dimension: "TOPIC", slug: rule.slug, label: rule.label, confidence: 0.72, source: "RULE" });
  }
  if (question.course === "数学" && !tags.some((tag) => tag.dimension === "TOPIC")) {
    addTag(tags, { dimension: "TOPIC", slug: "mixed-problem-solving", label: "综合问题解决", confidence: 0.55, source: "RULE" });
  }

  if (/计算|求|多少|证明|推导|方程|\b(?:find|determine|calculate|compute|what is|how many|how much|smallest|largest|maximum|minimum|prove|equation)\b/i.test(stem) || type === "COMPUTATION")
    addTag(tags, { dimension: "SKILL", slug: "quantitative-reasoning", label: "计算推理", confidence: 0.76, source: "RULE" });
  if (/实验|探究|操作|仪器|步骤|现象/.test(combined) || type === "EXPERIMENT")
    addTag(tags, { dimension: "SKILL", slug: "scientific-inquiry", label: "科学探究", confidence: 0.8, source: "RULE" });
  if (/图象|图表|示意图|曲线|坐标系|识图|\b(?:figure|diagram|graph|chart|coordinate plane)\b/i.test(stem))
    addTag(tags, { dimension: "SKILL", slug: "visual-interpretation", label: "读图分析", confidence: 0.78, source: "RULE" });
  if (/解释|原因|说明|分析|判断/.test(stem))
    addTag(tags, { dimension: "SKILL", slug: "conceptual-reasoning", label: "概念推理", confidence: 0.7, source: "RULE" });
  if (/生活|实际|生活中|生产|应用|方案/.test(stem) || question.type === "应用题")
    addTag(tags, { dimension: "SKILL", slug: "real-world-application", label: "实际应用", confidence: 0.74, source: "RULE" });

  const labels = extractCorrectLabels(question);
  addTag(tags, {
    dimension: "FORMAT", slug: labels.length > 0 ? "auto-gradable" : "self-assessed",
    label: labels.length > 0 ? "可自动判分" : "自主评估", confidence: 1, source: "IMPORT",
  });
  if (/\$\$|\\frac|\\sqrt|\\rm/.test(stem))
    addTag(tags, { dimension: "FORMAT", slug: "latex", label: "含数学公式", confidence: 1, source: "IMPORT" });
  if (/（[1-9]）|\([1-9]\)|①|（一）/.test(stem))
    addTag(tags, { dimension: "FORMAT", slug: "multi-part", label: "多小问", confidence: 0.95, source: "RULE" });
  if (extractOptions(question).length > 0)
    addTag(tags, { dimension: "FORMAT", slug: "choice", label: "选择作答", confidence: 1, source: "IMPORT" });
  else
    addTag(tags, { dimension: "FORMAT", slug: "written-response", label: "书面作答", confidence: 1, source: "IMPORT" });

  return tags;
}

export function referencesMissingFigure(stem: string) {
  return /(?:如|见|观察|根据|分析|阅读|结合)(?:下列|下|右|左|上)?(?:图|图表)(?:所示|中|给出)?|(?:下列|下|右|左|上)图(?:所示|中)?|图\s*[0-9一二三四五六甲乙丙丁](?:所示|中)?|图中|图示|图略|示意图/.test(stem);
}

export function normalizeSourceQuestion(question: SourceQuestion, sourceFile: string) {
  const update = curatedQuestionUpdates.get(question.id);
  const stem = extractQuestionStem(question);
  const options = extractOptions(question);
  const correctLabels = extractCorrectLabels(question);
  const sourceType = question.type || "其他";
  const normalizedType = normalizeQuestionType(question);
  const sourceDifficulty = normalizeDifficulty(question.difficulty);
  const answer = update?.answer ?? String(question.answer_info.raw_content ?? "").trim();
  const explanation = update?.explanation ?? (
    question.solution_info.map((item) => item.solution_info?.trim()).filter(Boolean).join("\n\n") || null
  );
  const visualHeuristicMatch = /识图|填图/.test(sourceType) || referencesMissingFigure(stem);
  const requiresVisual = visualHeuristicMatch && !reviewedSelfContainedVisualIds.has(question.id);
  const hasUnparsedChoice = !selfAssessedCompositeIds.has(question.id) && /选择/.test(sourceType) && (
    options.length < 2 || options.some((option, index) => option.label !== String.fromCharCode(65 + index))
  );
  const normalized = applyQuestionReplacement({
    id: question.id,
    sourceId: question.id,
    sourceFile,
    sourceType,
    type: normalizedType,
    difficulty: sourceDifficulty,
    stem: stem || "题干缺失（需要内容审核）",
    answer,
    correctAnswer: correctLabels.length ? JSON.stringify(correctLabels) : null,
    explanation,
    quality: question.quality || null,
    status: update?.publish
      ? "PUBLISHED"
      : !stem || requiresVisual || hasUnparsedChoice || Boolean(question.children?.length) ? "NEEDS_REVIEW" : "PUBLISHED",
    isAutoGradable: correctLabels.length > 0 && options.length >= 2,
    onlineTest: Boolean(question.online_test),
    optionSplit: Boolean(question.option_split),
    subjectName: question.course,
    gradeBandName: question.grade_band,
    gradeName: question.grade,
    options,
    assets: [] as NormalizedAsset[],
    tags: inferTags(question),
  });
  const audit = auditQuestionDifficulty({
    sourceDifficulty,
    gradeOrder: GRADE_ORDER_BY_NAME.get(question.grade) ?? 7,
    type: normalized.type,
    stem: normalized.stem,
    answer: normalized.answer,
    explanation: normalized.explanation,
    options: normalized.options.map((option) => option.content),
  });
  return {
    ...normalized,
    difficulty: update?.difficulty ?? (/^amc(?:8|10|12)\.json$/.test(sourceFile) ? sourceDifficulty : audit.difficulty),
    sourceDifficulty: audit.sourceDifficulty,
    difficultyScore: audit.score,
    difficultyConfidence: update?.difficulty || /^amc(?:8|10|12)\.json$/.test(sourceFile) ? 1 : audit.confidence,
    difficultyReason: update?.difficulty
      ? `curated subject review; ${audit.reason}`
      : /^amc(?:8|10|12)\.json$/.test(sourceFile)
        ? `AMC contest position band retained after structural audit; ${audit.reason}`
        : audit.reason,
    difficultyAuditVersion: audit.version,
  };
}
