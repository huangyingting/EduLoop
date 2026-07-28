const TRANSLATABLE_TEXT_COMMAND = /\\(text|textbf|textrm|textit|textnormal|mbox|emph)\s*\{([^{}]*)\}/g;
const PROTECTED_START = /\[Figure:\s*[^\]]+\]|\[asy\]|\\begin\{([^{}]+)\}|(?<!\\)\$\$|(?<!\\)\$/g;

const KNOWN_MATH_TRANSLATIONS = new Map([
  ["OR", "或"],
  ["and", "和"],
  ["or", "或"],
  ["Area", "面积"],
  ["Area of", "面积"],
  ["Area of semicircle", "半圆面积"],
  ["Volume", "体积"],
  ["LCM", "最小公倍数"],
  ["Remaining Die", "剩余骰子"],
  ["SIDE", "边"],
  ["Tot", "总计"],
  ["Blond", "金发"],
  ["original", "原始"],
  ["new perimeter", "新周长"],
  ["infinitely many", "无穷多个"],
  ["worker days", "人日"],
  ["fours", "数字4"],
  ["zeros", "数字0"],
  ["nines", "数字9"],
  ["feet", "英尺"],
  ["foot", "英尺"],
  ["miles", "英里"],
  ["mile", "英里"],
  ["inradius", "内切圆半径"],
  ["base", "底"],
  ["where", "其中"],
  ["is divisible by", "可被整除"],
  ["three rays with a common endpoint", "三条具有共同端点的射线"],
  ["sin", "sin"],
  ["cos", "cos"],
  ["arcsin", "arcsin"],
  ["cis", "cis"],
  ["lcm", "lcm"],
  ["mod", "mod"],
  ["Pr", "Pr"],
]);

export function transformLatexText(value, transform) {
  return String(value).replace(
    TRANSLATABLE_TEXT_COMMAND,
    (match, command, content) => `\\${command}{${transform(content, command, match)}}`,
  );
}

export function latexMathStructure(value) {
  return transformLatexText(value, () => "<translated-text>");
}

export function latexTextContents(value) {
  return [...String(value).matchAll(TRANSLATABLE_TEXT_COMMAND)].map((match) => match[2]);
}

export function knownMathTranslation(value) {
  const source = String(value);
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = source.slice(leading.length, source.length - trailing.length || undefined);
  const known = KNOWN_MATH_TRANSLATIONS.get(core);
  if (known !== undefined) return `${leading}${known}${trailing}`;
  const numberedCase = core.match(/^Case ([0-9.]+)(:)?$/);
  if (numberedCase) return `${leading}情形 ${numberedCase[1]}${numberedCase[2] ?? ""}${trailing}`;
  return undefined;
}

function closingDollar(value, start) {
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
    if (display) {
      if (value[index + 1] === "$") return index + 2;
      continue;
    }
    return index + 1;
  }
  return -1;
}

export function protectedLatexSegments(value) {
  const source = String(value);
  const segments = [];
  PROTECTED_START.lastIndex = 0;
  for (let match = PROTECTED_START.exec(source); match; match = PROTECTED_START.exec(source)) {
    const start = match.index;
    let end;
    let kind;
    if (match[0].startsWith("[Figure:")) {
      end = start + match[0].length;
      kind = "figure";
    } else if (match[0] === "[asy]") {
      const close = source.indexOf("[/asy]", PROTECTED_START.lastIndex);
      if (close < 0) continue;
      end = close + "[/asy]".length;
      kind = "asy";
    } else if (match[0].startsWith("\\begin{")) {
      const closeToken = `\\end{${match[1]}}`;
      const close = source.indexOf(closeToken, PROTECTED_START.lastIndex);
      if (close < 0) continue;
      end = close + closeToken.length;
      kind = "environment";
    } else {
      end = closingDollar(source, start);
      if (end < 0) continue;
      kind = "math";
    }
    segments.push({ start, end, kind, value: source.slice(start, end) });
    PROTECTED_START.lastIndex = end;
  }
  return segments;
}

export function replaceProtectedLatex(value, transform) {
  const source = String(value);
  const segments = protectedLatexSegments(source);
  let cursor = 0;
  let result = "";
  for (const segment of segments) {
    result += source.slice(cursor, segment.start);
    result += transform(segment.value, segment.kind);
    cursor = segment.end;
  }
  return result + source.slice(cursor);
}
