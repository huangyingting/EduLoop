// Derives conservative, question-specific hints from a source solution at
// import time. A hint must help a learner start without revealing the result:
// - FOCUS: the solution's own "本题考查…" statement of what is being tested;
// - FIRST_STEP (contest sources only): the setup of the first solution
//   sentence, clipped before the first computation or conclusion cue.
// Anything that names an option, a conclusion, or the answer text is dropped.

export type DerivedHint = { kind: "FOCUS" | "FIRST_STEP"; content: string };

const LEAK = /故|答案|所以|因此|选项|选\s*[A-EＡ-Ｅ](?![a-z])|[（(]\s*[A-E]\s*[）)]|\\boxed|\\textbf|即为|结论|正确|错误|√|×|Figure|\[图/u;
const RESULT_CUE = /可得|得到|解得|等于|求得|算得|即|则|所以|因此|故|=|＝|≈/u;
const OPTION_START = /^(?:[A-EＡ-Ｅ]+\s*[、.．:：]|选项|[（(]\s*\d+\s*[）)]|①)/u;
const SOLUTION_LABEL = /^\s*(?:【(?:解析|分析|解答|详解)】|(?:解析|分析|解答|详解|解)\s*[:：])\s*/u;
const FOCUS = /本题(?:主要)?考查(?:的(?:知识点|是))?(?:是|了)?[:：]?\s*([^。；;\n]{2,60})/u;
const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$|\\\([\s\S]+?\\\))/gu;

function splitMath(sentence: string) {
  const parts: Array<{ math: boolean; text: string }> = [];
  let last = 0;
  for (const match of sentence.matchAll(MATH_SEGMENT)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ math: false, text: sentence.slice(last, index) });
    parts.push({ math: true, text: match[0] });
    last = index + match[0].length;
  }
  if (last < sentence.length) parts.push({ math: false, text: sentence.slice(last) });
  return parts;
}

// Keep the setup of a sentence and drop everything from the first computation
// onward. Formulas are kept whole or dropped whole, never cut in the middle.
export function clipBeforeResult(sentence: string) {
  let kept = "";
  for (const part of splitMath(sentence)) {
    if (part.math) {
      if (/[=＝≈]/u.test(part.text)) break;
      kept += part.text;
      continue;
    }
    const cue = part.text.search(RESULT_CUE);
    if (cue !== -1) {
      kept += part.text.slice(0, cue);
      break;
    }
    kept += part.text;
  }
  // Trim dangling punctuation and connectives until nothing more changes.
  let previous = "";
  while (previous !== kept) {
    previous = kept;
    kept = kept.replace(/[，,、；;：:。.\s]+$/u, "").replace(/(?:当且仅当|并且|且|而|由|将)$/u, "");
  }
  return kept.trim();
}

function visibleLength(text: string) {
  return text.replace(/\$[^$]*\$/gu, "式").replace(/\s+/gu, "").length;
}

export function deriveQuestionHints(input: {
  solutions: string[];
  answer: string;
  isContestSource: boolean;
}): DerivedHint[] {
  const solution = input.solutions.find((value) => value?.trim()) ?? "";
  if (!solution) return [];
  const hints: DerivedHint[] = [];

  const focus = solution.match(FOCUS)?.[1]?.replace(/[，,]\s*$/u, "");
  if (focus && !LEAK.test(focus)) hints.push({ kind: "FOCUS", content: `这道题考查：${focus}。` });

  if (input.isContestSource) {
    const first = solution.replace(SOLUTION_LABEL, "").split(/(?<=[。！？；;])|\n+/u).map((value) => value.trim()).find(Boolean) ?? "";
    const clipped = OPTION_START.test(first) ? "" : clipBeforeResult(first);
    const answer = input.answer.trim();
    const revealsAnswer = answer.length > 1 && answer.length <= 20 && clipped.includes(answer);
    if (visibleLength(clipped) >= 6 && clipped.length <= 160 && !LEAK.test(clipped) && !revealsAnswer) {
      hints.push({ kind: "FIRST_STEP", content: `可以先从这里入手：${clipped}……` });
    }
  }
  return hints;
}
