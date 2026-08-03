export function normalizeOption(value) {
  return String(value)
    .replace(/\n\n💬 Join the Discussion[\s\S]*$/iu, "")
    .replace(/(?<!\\)\$/g, "")
    .replace(/\\(?:displaystyle|,|;|!| |quad|qquad)/g, "")
    .replace(/\\(?:d|t)?frac/g, "\\frac")
    .replace(/[{}\s]/g, "")
    .trim()
    .toLowerCase();
}

export function isChoiceQuestionType(value) {
  return /^(?:单选题|多选题|双选题|不定项选择题|选择题)$/u.test(String(value).trim());
}

export function directChoiceLabels(value) {
  const cleaned = String(value ?? "")
    .replace(/\$|\\(?:rm|text|mathrm|mathbf)|[{}（）()\[\]]/gu, " ")
    .trim()
    .toUpperCase();
  const match = cleaned.match(/^(?:【?(?:答案|解答)】?[：:\s]*)?([A-E](?:[\s,，、;；|]*[A-E])*)[.。．]?$/u);
  return match ? [...new Set(match[1].match(/[A-E]/gu) ?? [])].sort() : [];
}

export function terminalChoiceLabels(value) {
  const cleaned = String(value ?? "")
    .replace(/\$+/gu, "")
    .replace(/\\(?:rm|text|mathrm|mathbf)/gu, "")
    .replace(/[{}]/gu, "")
    .toUpperCase();
  const matches = [...cleaned.matchAll(/(?:故[选先]|答案(?:为|是)|正确答案(?:为|是)?|只有(?:选项)?)[：:\s]*([A-E](?:[、,，|和及\s]*[A-E])*)(?:项?正确)?(?=[。．.，,；;\s]|$)/gu)];
  if (!matches.length) return directChoiceLabels(value);
  return [...new Set(matches.at(-1)[1].match(/[A-E]/gu) ?? [])].sort();
}

export function hasBalancedBraces(value) {
  let depth = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function hasBalancedEnvironments(value) {
  const text = String(value);
  const begins = [...text.matchAll(/\\begin\{([^{}]+)\}/g)].map((match) => match[1]).sort();
  const ends = [...text.matchAll(/\\end\{([^{}]+)\}/g)].map((match) => match[1]).sort();
  return JSON.stringify(begins) === JSON.stringify(ends);
}

const JSON_ESCAPABLE_LATEX_COMMANDS = new Set([
  "begin", "bmod", "boxed",
  "frac",
  "neq", "notin",
  "right", "rm",
  "text", "textbf", "textit", "tilde", "times", "triangle",
]);

export function invalidJsonLatexEscapes(value) {
  const text = String(value);
  const invalid = [];
  for (let index = 0; index < text.length;) {
    if (text[index] !== "\\") {
      index += 1;
      continue;
    }
    let end = index;
    while (text[end] === "\\") end += 1;
    const command = text.slice(end).match(/^[A-Za-z]+/u)?.[0] ?? "";
    if ((end - index) % 2 === 1 && JSON_ESCAPABLE_LATEX_COMMANDS.has(command)) {
      invalid.push({ offset: index, command });
    }
    index = end;
  }
  return invalid;
}

export function hasForbiddenControlCharacter(value) {
  return /[\u0000-\u0009\u000b-\u001f\u007f\u200b\ufffd]/u.test(String(value));
}

export function hasBareLatexCommand(value) {
  return /(?<![\\A-Za-z])(?:cdot|dfrac|frac|geqslant|leqslant|overrightarrow|qquad|quad|sqrt)(?![A-Za-z])/u.test(String(value));
}

function boxedContents(value) {
  const results = [];
  const text = String(value);
  let cursor = 0;
  while ((cursor = text.indexOf("\\boxed{", cursor)) >= 0) {
    const start = cursor + 7;
    let depth = 1;
    let end = start;
    for (; end < text.length && depth > 0; end += 1) {
      if (text[end] === "\\") {
        end += 1;
      } else if (text[end] === "{") {
        depth += 1;
      } else if (text[end] === "}") {
        depth -= 1;
      }
    }
    if (depth === 0) results.push(text.slice(start, end - 1));
    cursor = Math.max(end, cursor + 7);
  }
  return results;
}

export function terminalLabeledChoice(value) {
  const boxes = boxedContents(value);
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index];
    const exact = box.match(/^\s*([A-E])\s*$/);
    if (exact) return exact[1];
    const parenthesized = box.match(/^\s*\(([A-E])\)(?:\s|$)/);
    if (parenthesized) return parenthesized[1];
    const formatted = box.match(/^\s*\\(?:textbf|text|mathrm)\s*\{\s*\(([A-E])\)/);
    if (formatted) return formatted[1];
  }
  return null;
}

const OBVIOUS_TEXT_CORRUPTION = [
  /\b(?:teh|gmae|is is|the the|ta ken|inte-ger|inegers)\b/iu,
  /\b(?:more more|to to|both both|out out|of of|and and|can can|many many|valid valid|are are|cases cases|less than than)\b|there's are/iu,
  /\b(?:an an|odd odd)\b|Note\s+Note\s+that/u,
  /\[object Object\]/u,
  /j色|传人神经|面积相筹|由指受|下列于因|污染物进人海洋|并发的生长素|含义碳碳双键|(?<!三)角形的一个外角|如果xy＜，|没有谁和氧气/u,
  /下丘脑的的|个体间在在|才能使使|可能能分解|所形成的的|都都是|场所所是|离子的的|可能是是|能能分解|血斑的的|基因型为为|是不否|运用所以|不能能|元素符号与与|说说法|水是由由|有有色的|不不能|不加热的的|化合价由由|对应的的|都比溶于水|二是是|的的2倍|可能能摸|共有有|该该贫困户|率在在|不存在在|方程的的|点是是|三边为为|最小的的|均为为|统称为为|法得得|段段占|银铁丝|兵兵球|容器底底|不能象|准确的测出|下列有说法|进人大气层|做功功|苹果的的|只在在只|同理在在|站在在|高度为为|之前的的|电源的的|标标注|消灭尽尽|虚幻幻境|大概概要|英语言|最珍惜的自然资源|一的的萧条|奈何不了了|耐4~6中抗生素|次前3个月|会是牲畜/u,
  /生物膜系系统|增殖的高高峰|初生演替替|溶酶体体内|基基因|供上上述|经经汽化|应用用酒精灯|体温计计打破|物质质表示|气气体|可以用用盐酸|则则稀释后|包装装箱|面积积单位|即即从|最大值值|不等式式|恒等变变换|除法法，底数|红字字只能|接触触电人|持续续放热|入入射角|理解解答|制冷系系统|建筑物物等|本题题考查|加速速度方向|动能增增大|求出出角速度|通电电线|物体体间/u,
];

export function contentDamageIssues(value, { solution = false } = {}) {
  const text = String(value);
  const issues = [];
  if (/💬\s*Join the Discussion|Stuck on this problem|View Forum Thread/iu.test(text)) issues.push("forum residue");
  if (/�|Â|Ã|â€|â€™|â€œ|â€˜|ï»¿/u.test(text)) issues.push("encoding damage");
  if (hasForbiddenControlCharacter(text)) issues.push("forbidden control character");
  if (hasBareLatexCommand(text)) issues.push("LaTeX command missing backslash");
  if (!hasBalancedBraces(text)) issues.push("unbalanced braces");
  if (!hasBalancedEnvironments(text)) issues.push("unbalanced environment");
  if (OBVIOUS_TEXT_CORRUPTION.some((pattern) => pattern.test(text))) {
    issues.push("obvious text corruption");
  }
  if (solution && /^\s*https?:\/\/\S+\s*$/iu.test(text)) issues.push("URL-only solution");
  if (solution && /\b(?:fake\s*solve|fakesolve)\b|\bthis solution\b.{0,120}\b(?:wrong|incorrect|invalid|flawed|not rigorous)\b/iu.test(text)) {
    issues.push("self-identified invalid solution");
  }
  return issues;
}
