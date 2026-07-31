export type MathContentToken = {
  kind: "text" | "inline-math" | "display-math" | "figure";
  value: string;
};

const CONTENT_TOKEN_START = /(?<!\\)\$\$|(?<!\\)\$(?!\$)|\[Figure:\s*(?:https?:\/\/[^\]\s]+|\/question-assets\/source\/amc\/[a-z0-9._/-]+)\]/gi;

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
    const isFigure = match[0].startsWith("[Figure:");
    const end = isFigure ? start + match[0].length : closingDollar(value, start);
    if (end < 0) continue;
    if (start > cursor) tokens.push({ kind: "text", value: value.slice(cursor, start) });
    if (isFigure) {
      tokens.push({ kind: "figure", value: match[0] });
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
