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
  "\u2061": "",
  "\u200b": "",
};

const REPLACEABLE_MATH_SYMBOL = /[⊥∆∶︰﹕〈〉％℃□\u2061\u200b]/gu;
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
  let normalized = "";
  let segmentStart = 0;
  let index = 0;

  while (index < expression.length) {
    if (expression[index] !== "\\") {
      index += 1;
      continue;
    }
    if (expression[index + 1] === "\\") {
      index += 2;
      continue;
    }
    const argumentEnd = textModeArgumentEnd(expression, index);
    if (argumentEnd === null) {
      index += 1;
      continue;
    }
    normalized += normalizeMathModeSegment(expression.slice(segmentStart, index));
    normalized += expression.slice(index, argumentEnd);
    segmentStart = argumentEnd;
    index = argumentEnd;
  }

  return normalized + normalizeMathModeSegment(expression.slice(segmentStart));
}
