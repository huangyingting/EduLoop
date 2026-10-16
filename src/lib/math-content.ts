export type MathContentToken = {
  kind: "text" | "inline-math" | "display-math" | "figure";
  value: string;
};

const BARE_MATH_ENVIRONMENTS = "align\\*?|aligned|alignat\\*?|eqnarray\\*?|gather\\*?|array|cases|matrix|pmatrix|bmatrix|vmatrix";
const CONTENT_TOKEN_START = new RegExp(
  String.raw`(?<!\\)\$\$|(?<!\\)\$(?!\$)|(?<!\\)\\\[|(?<!\\)\\\(|\\begin\{(${BARE_MATH_ENVIRONMENTS})\}|\[Figure:\s*(?:https?:\/\/[^\]\s]+|\/question-assets\/(?:source\/amc|generated)\/[a-zA-Z0-9._/-]+)\]`,
  "gi",
);

function closingDollar(value: string, start: number) {
  const display = value.startsWith("$$", start);
  let braceDepth = 0;
  for (let index = start + (display ? 2 : 1); index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }
    if (value[index] === "{") braceDepth += 1;
    if (value[index] === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (value[index] !== "$" || braceDepth > 0) continue;
    if (!display) return index + 1;
    if (value[index + 1] === "$") return index + 2;
  }
  return -1;
}

function closingEnvironment(value: string, start: number, envName: string) {
  const openTag = `\\begin{${envName}}`;
  const closeTag = `\\end{${envName}}`;
  let depth = 1;
  let index = start + openTag.length;
  while (index < value.length) {
    const nextOpen = value.indexOf(openTag, index);
    const nextClose = value.indexOf(closeTag, index);
    if (nextClose < 0) return -1;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + openTag.length;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose + closeTag.length;
      index = nextClose + closeTag.length;
    }
  }
  return -1;
}

function isStandaloneDisplayMath(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextLineBreak = value.indexOf("\n", end);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  return value.slice(lineStart, start).trim() === ""
    && value.slice(end, lineEnd).trim() === "";
}

export function tokenizeMathContent(value: string): MathContentToken[] {
  const tokens: MathContentToken[] = [];
  let cursor = 0;
  CONTENT_TOKEN_START.lastIndex = 0;

  for (let match = CONTENT_TOKEN_START.exec(value); match; match = CONTENT_TOKEN_START.exec(value)) {
    const start = match.index;
    const tokenText = match[0];
    const isFigure = tokenText.startsWith("[Figure:");
    const isBracketDisplay = tokenText === "\\[";
    const isParenInline = tokenText === "\\(";
    const bareEnvName = match[1];
    let end = -1;
    if (isFigure) {
      end = start + tokenText.length;
    } else if (isBracketDisplay) {
      const closeIndex = value.indexOf("\\]", start + 2);
      if (closeIndex >= 0) end = closeIndex + 2;
    } else if (isParenInline) {
      const closeIndex = value.indexOf("\\)", start + 2);
      if (closeIndex >= 0) end = closeIndex + 2;
    } else if (bareEnvName) {
      end = closingEnvironment(value, start, bareEnvName);
    } else {
      end = closingDollar(value, start);
    }
    if (end < 0) continue;
    if (start > cursor) tokens.push({ kind: "text", value: value.slice(cursor, start) });
    if (isFigure) {
      tokens.push({ kind: "figure", value: tokenText });
    } else if (isBracketDisplay) {
      tokens.push({
        kind: "display-math",
        value: value.slice(start + 2, end - 2),
      });
    } else if (isParenInline) {
      tokens.push({
        kind: "inline-math",
        value: value.slice(start + 2, end - 2),
      });
    } else if (bareEnvName) {
      const isDisplayEnv = /^(?:align\*?|alignat\*?|eqnarray\*?|gather\*?)$/i.test(bareEnvName)
        || isStandaloneDisplayMath(value, start, end);
      tokens.push({
        kind: isDisplayEnv ? "display-math" : "inline-math",
        value: value.slice(start, end),
      });
    } else {
      const usesDisplayDelimiters = value.startsWith("$$", start);
      const delimiterLength = usesDisplayDelimiters ? 2 : 1;
      tokens.push({
        kind: usesDisplayDelimiters && isStandaloneDisplayMath(value, start, end)
          ? "display-math"
          : "inline-math",
        value: value.slice(start + delimiterLength, end - delimiterLength),
      });
    }
    cursor = end;
    CONTENT_TOKEN_START.lastIndex = end;
  }

  if (cursor < value.length) tokens.push({ kind: "text", value: value.slice(cursor) });
  return tokens;
}
