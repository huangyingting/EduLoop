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

export function contentDamageIssues(value, { solution = false } = {}) {
  const text = String(value);
  const issues = [];
  if (/💬\s*Join the Discussion|Stuck on this problem|View Forum Thread/iu.test(text)) issues.push("forum residue");
  if (/�|Â|Ã|â€|â€™|â€œ|â€˜|ï»¿/u.test(text)) issues.push("encoding damage");
  if (!hasBalancedBraces(text)) issues.push("unbalanced braces");
  if (!hasBalancedEnvironments(text)) issues.push("unbalanced environment");
  if (/\b(?:teh|gmae|is is|the the|ta ken|inte-ger|inegers)\b/iu.test(text)) issues.push("obvious text corruption");
  if (solution && /^\s*https?:\/\/\S+\s*$/iu.test(text)) issues.push("URL-only solution");
  return issues;
}
