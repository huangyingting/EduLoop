type HintQuestion = {
  type: string;
  difficulty: string;
  tags?: Array<{ tag: { label: string; dimension: { key: string } } }>;
};

const TYPE_STRATEGIES: Record<string, string> = {
  SINGLE_CHOICE: "先独立判断每个选项，再用题干条件逐项排除；不要只凭熟悉感作答。",
  MULTIPLE_CHOICE: "逐项判断并分别记录理由，最后再组合答案；不要因为一个选项确定就停止检查。",
  TRUE_FALSE: "圈出题目中的范围词和绝对词，再尝试寻找一个反例；找不到反例时再回到定义核对。",
  FILL_BLANK: "先判断空格需要的是概念、数值还是单位，再从题干已知条件反推。",
  COMPUTATION: "先写出已知量、所求量和单位，再选择关系式；计算结束后检查数量级。",
  EXPERIMENT: "按“实验目的—控制变量—操作步骤—现象—结论”整理信息，注意安全与误差来源。",
  WRITTEN_RESPONSE: "把问题拆成几个小结论，每一步都写出依据；先完成最确定的部分。",
};

export function buildQuestionHint(question: HintQuestion) {
  const topic = question.tags?.find(({ tag }) => tag.dimension.key === "TOPIC")?.tag.label;
  const topicLead = topic ? `先回忆“${topic}”的核心定义或基本关系。` : "先圈出题干中的已知条件和真正要回答的问题。";
  const strategy = TYPE_STRATEGIES[question.type] ?? TYPE_STRATEGIES.WRITTEN_RESPONSE;
  const challenge = question.difficulty === "HARD"
    ? "如果卡住，尝试画简图、列中间量，或从选项反向验证。"
    : "完成后把结论代回题干检查一次。";
  return `${topicLead}${strategy}${challenge}`;
}
