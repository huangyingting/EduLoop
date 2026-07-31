import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import katex from "katex";
import { tokenizeMathContent } from "../src/lib/math-content";
import { normalizeMathExpression, requiresDisplayMath } from "../src/lib/math-expression";

// Legacy $$ fragments now use their real inline/display context. A same-archive
// comparison rebased this count from 1043 to 1054 without new warning families.
const MAX_STRICT_WARNINGS = 1054;
const MAX_CONSOLE_WARNINGS = 136;
const dataDirectory = path.join(process.cwd(), "data", "zh-CN");
const formulas = new Map<string, { expression: string; display: boolean; filename: string }>();

function collectFormulas(value: unknown, filename: string) {
  if (typeof value === "string") {
    for (const token of tokenizeMathContent(value)) {
      if (token.kind !== "inline-math" && token.kind !== "display-math") continue;
      const key = `${token.kind}\0${token.value}`;
      if (!formulas.has(key)) formulas.set(key, {
        expression: token.value,
        display: token.kind === "display-math",
        filename,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFormulas(item, filename);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectFormulas(item, filename);
  }
}

async function main() {
  const filenames = (await readdir(dataDirectory)).filter((filename) => filename.endsWith(".json"));
  for (const filename of filenames) {
    const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
    collectFormulas(JSON.parse(body) as unknown, filename);
  }

  const parseErrors: Array<{ filename: string; expression: string; error: string }> = [];
  const warningFamilies = new Map<string, number>();
  const consoleWarningFamilies = new Map<string, number>();
  let strictWarnings = 0;
  let consoleWarnings = 0;
  let displayFormulas = 0;
  const originalConsoleWarn = console.warn;
  console.warn = (message?: unknown) => {
    consoleWarnings += 1;
    const family = String(message ?? "Unknown KaTeX console warning");
    consoleWarningFamilies.set(family, (consoleWarningFamilies.get(family) ?? 0) + 1);
  };

  try {
    for (const formula of formulas.values()) {
      const expression = normalizeMathExpression(formula.expression);
      if (!expression.trim()) continue;
      const displayMode = formula.display || requiresDisplayMath(expression);
      if (displayMode) displayFormulas += 1;
      try {
        katex.renderToString(expression, {
          displayMode,
          strict: (code) => {
            strictWarnings += 1;
            warningFamilies.set(code, (warningFamilies.get(code) ?? 0) + 1);
            return "ignore";
          },
          throwOnError: true,
        });
      } catch (error) {
        parseErrors.push({
          filename: formula.filename,
          expression: formula.expression.slice(0, 500),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    console.warn = originalConsoleWarn;
  }

  const report = {
    files: filenames.length,
    uniqueFormulas: formulas.size,
    displayFormulas,
    strictWarnings,
    consoleWarnings,
    consoleWarningFamilies: Object.fromEntries(
      [...consoleWarningFamilies.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10),
    ),
    warningFamilies: Object.fromEntries(
      [...warningFamilies.entries()].sort((left, right) => right[1] - left[1]),
    ),
    parseErrors: parseErrors.slice(0, 10),
  };
  console.log(JSON.stringify(report, null, 2));

  if (
    parseErrors.length > 0
    || strictWarnings > MAX_STRICT_WARNINGS
    || consoleWarnings > MAX_CONSOLE_WARNINGS
  ) {
    process.exitCode = 1;
  }
}

void main();
