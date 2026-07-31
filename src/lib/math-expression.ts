const MATH_SYMBOL_REPLACEMENTS: Readonly<Record<string, string>> = {
  "⊥": "\\perp{}",
  "∆": "\\triangle{}",
  "∶": "\\mathbin{:}",
  "︰": "\\mathbin{:}",
  "﹕": "\\mathbin{:}",
  "〈": "\\langle{}",
  "〉": "\\rangle{}",
  "％": "\\%",
  "℃": "{}^{\\circ}\\mathrm{C}",
  "□": "\\square{}",
  "═": "=",
  "¢": "\\,\\mathrm{cent}",
  "①": "\\text{\\textcircled{1}}",
  "②": "\\text{\\textcircled{2}}",
  "③": "\\text{\\textcircled{3}}",
  "④": "\\text{\\textcircled{4}}",
  "⑤": "\\text{\\textcircled{5}}",
  "⑥": "\\text{\\textcircled{6}}",
  "⑦": "\\text{\\textcircled{7}}",
  "⑧": "\\text{\\textcircled{8}}",
  "⑨": "\\text{\\textcircled{9}}",
  "⑩": "\\text{\\textcircled{10}}",
  "\u2061": "",
  "\u200b": "",
  "\ue004": "",
  "\ue007": "",
  "\uef01": "",
};

const REPLACEABLE_MATH_SYMBOL = /[⊥∆∶︰﹕〈〉％℃□═¢①②③④⑤⑥⑦⑧⑨⑩\u2061\u200b\ue004\ue007\uef01]/gu;
const DISPLAY_ONLY_MATH = /\\tag(?![A-Za-z])|\\begin\{(?:align\*?|split)\}/u;
const TEXT_MODE_COMMANDS = [
  "\\textnormal",
  "\\textrm",
  "\\textsf",
  "\\texttt",
  "\\textbf",
  "\\textmd",
  "\\textit",
  "\\textup",
  "\\textsl",
  "\\textsc",
  "\\text",
  "\\mbox",
] as const;

function normalizeMathModeSegment(segment: string) {
  return segment
    .replace(/″/gu, "''")
    .replace(/′/gu, "'")
    .replace(REPLACEABLE_MATH_SYMBOL, (symbol) => MATH_SYMBOL_REPLACEMENTS[symbol]);
}

function normalizeLegacyLatex(expression: string) {
  return expression
    .replace(/\\textbf\{([^$]*)\$([^$]+)\$\}/gu, "\\mathbf{$1$2}")
    .replace(/(?<!\\)\$/gu, "")
    .replace(/\u000crac/gu, "\\frac")
    .replace(/\\(?:text|math)dollar(?![A-Za-z])/gu, "\\$")
    .replace(/\\textsubscript\s*\{([^{}]*)\}/gu, "_{$1}")
    .replace(/\\begin\{tabular\}/gu, "\\begin{array}")
    .replace(/\\end\{tabular\}/gu, "\\end{array}")
    .replace(/\\begin\{array\}\s*\[(?:t|b|c)\]/gu, "\\begin{array}")
    .replace(
      /\\\\\s+\[([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|mu|pt|mm|cm|in|bp|pc|dd|cc|nd|nc|sp|px))\]/gu,
      "\\\\[$1]",
    )
    .replace(/\\rlap\{_\{([^{}]*)\}\}\{\^\{([^{}]*)\}\}/gu, "_{$1}^{$2}")
    .replace(/\\cent(?![A-Za-z])/gu, "\\,\\mathrm{cent}")
    .replace(/\\wideparen(?![A-Za-z])/gu, "\\overgroup")
    .replace(/\\inN(?![A-Za-z])/gu, "\\in N")
    .replace(/\\subseteqN(?![A-Za-z])/gu, "\\subseteq N")
    .replace(/\\mathrm\{\s*\\text\{·\}\s*\}/gu, "\\cdot")
    .replace(/b_\{n\}_\{\+1\}/gu, "b_{n+1}")
    .replace(/(?<!\\)left(?=\s*\()/gu, "\\left")
    .replace(/(?<!\\)#/gu, "\\#")
    .replace(/―→/gu, "\\longrightarrow{}");
}

function textModeArgumentEnd(expression: string, start: number) {
  const command = TEXT_MODE_COMMANDS.find((candidate) => expression.startsWith(candidate, start));
  if (!command) return null;

  let openingBrace = start + command.length;
  if (/[A-Za-z]/.test(expression[openingBrace] ?? "")) return null;
  while (/\s/.test(expression[openingBrace] ?? "")) openingBrace += 1;
  if (expression[openingBrace] !== "{") return null;

  let depth = 1;
  for (let index = openingBrace + 1; index < expression.length; index += 1) {
    if (expression[index] === "\\") {
      index += 1;
    } else if (expression[index] === "{") {
      depth += 1;
    } else if (expression[index] === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

export function normalizeMathExpression(expression: string) {
  const compatibleExpression = normalizeLegacyLatex(expression);
  let normalized = "";
  let segmentStart = 0;
  let index = 0;

  while (index < compatibleExpression.length) {
    if (compatibleExpression[index] !== "\\") {
      index += 1;
      continue;
    }
    if (compatibleExpression[index + 1] === "\\") {
      index += 2;
      continue;
    }
    const argumentEnd = textModeArgumentEnd(compatibleExpression, index);
    if (argumentEnd === null) {
      index += 1;
      continue;
    }
    normalized += normalizeMathModeSegment(compatibleExpression.slice(segmentStart, index));
    normalized += compatibleExpression.slice(index, argumentEnd);
    segmentStart = argumentEnd;
    index = argumentEnd;
  }

  return normalized + normalizeMathModeSegment(compatibleExpression.slice(segmentStart));
}

export function requiresDisplayMath(expression: string) {
  return DISPLAY_ONLY_MATH.test(expression);
}
