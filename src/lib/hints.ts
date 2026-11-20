import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

type HintQuestion = {
  type: string;
  difficulty: string;
  tags?: Array<{ tag: { label: string; dimension: { key: string } } }>;
};

type StrategyText = {
  types: Record<string, string>;
  topicLead: (topic: string) => string;
  genericLead: string;
  hard: string;
  check: string;
};

const STRATEGY_TEXT: Record<Locale, StrategyText> = {
  "zh-CN": {
    types: {
      SINGLE_CHOICE: "先独立判断每个选项，再用题干条件逐项排除；不要只凭熟悉感作答。",
      MULTIPLE_CHOICE: "逐项判断并分别记录理由，最后再组合答案；不要因为一个选项确定就停止检查。",
      TRUE_FALSE: "圈出题目中的范围词和绝对词，再尝试寻找一个反例；找不到反例时再回到定义核对。",
      FILL_BLANK: "先判断空格需要的是概念、数值还是单位，再从题干已知条件反推。",
      COMPUTATION: "先写出已知量、所求量和单位，再选择关系式；计算结束后检查数量级。",
      EXPERIMENT: "按“实验目的—控制变量—操作步骤—现象—结论”整理信息，注意安全与误差来源。",
      WRITTEN_RESPONSE: "把问题拆成几个小结论，每一步都写出依据；先完成最确定的部分。",
    },
    topicLead: (topic) => `先回忆“${topic}”的核心定义或基本关系。`,
    genericLead: "先圈出题干中的已知条件和真正要回答的问题。",
    hard: "如果卡住，尝试画简图、列中间量，或从选项反向验证。",
    check: "完成后把结论代回题干检查一次。",
  },
  en: {
    types: {
      SINGLE_CHOICE: "Judge each option on its own, then rule options out with the conditions in the question; don't answer on familiarity alone. ",
      MULTIPLE_CHOICE: "Judge every option separately and note why, then combine your answer; don't stop checking once one option looks right. ",
      TRUE_FALSE: "Mark the scope words and absolute words, then look for a counterexample; if none exists, check the definition again. ",
      FILL_BLANK: "Decide whether the blank needs a concept, a number, or a unit, then work back from what the question gives. ",
      COMPUTATION: "Write down the known quantities, the unknown, and the units before choosing a relationship; check the order of magnitude at the end. ",
      EXPERIMENT: "Organize the information as aim, controlled variables, steps, observations, and conclusion, and watch for safety and error sources. ",
      WRITTEN_RESPONSE: "Split the problem into small claims and justify each step; finish the part you are surest of first. ",
    },
    // Topic labels are catalog content in the default language, so English
    // strategies do not quote them.
    topicLead: () => "Start by recalling the core definitions and relationships for this topic. ",
    genericLead: "Start by marking the given facts and what the question actually asks. ",
    hard: "If you get stuck, draw a sketch, introduce an intermediate quantity, or test the options backwards.",
    check: "When you finish, plug your result back into the question to check it.",
  },
};

// A generic solving strategy built from type, difficulty, and topic. It is
// offered as the solving strategy when a question has no question-specific hint.
export function buildSolvingStrategy(question: HintQuestion, locale: Locale = DEFAULT_LOCALE) {
  const text = STRATEGY_TEXT[locale];
  const topic = question.tags?.find(({ tag }) => tag.dimension.key === "TOPIC")?.tag.label;
  const topicLead = topic ? text.topicLead(topic) : text.genericLead;
  const strategy = text.types[question.type] ?? text.types.WRITTEN_RESPONSE;
  const challenge = question.difficulty === "HARD" ? text.hard : text.check;
  return `${topicLead}${strategy}${challenge}`;
}
