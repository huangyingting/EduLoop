import katex from "katex";
import { describe, expect, it } from "vitest";
import { normalizeMathExpression } from "./math-expression";

describe("normalizeMathExpression", () => {
  it("converts unsupported geometry notation to canonical LaTeX", () => {
    expect(normalizeMathExpression("∆A′B′C′⊥BD")).toBe(
      "\\triangle{}A'B'C'\\perp{}BD",
    );
    expect(normalizeMathExpression("〈\\overrightarrow a,\\overrightarrow b〉")).toBe(
      "\\langle{}\\overrightarrow a,\\overrightarrow b\\rangle{}",
    );
  });

  it("normalizes measurements, ratios, placeholders, and invisible marks", () => {
    expect(normalizeMathExpression("-95℃, 0.1％, 3∶5, 6□0, f\u2061(x)\u200b")).toBe(
      "-95{}^{\\circ}\\mathrm{C}, 0.1\\%, 3\\mathbin{:}5, 6\\square{}0, f(x)",
    );
    expect(normalizeMathExpression("19′40″")).toBe(
      "19'40''",
    );
  });

  it("leaves existing LaTeX and text-mode prose unchanged", () => {
    const expression = "\\dfrac{1}{2} + \\text{保留 AC⊥BD 和 95℃} + AC⊥BD";
    expect(normalizeMathExpression(expression)).toBe(
      "\\dfrac{1}{2} + \\text{保留 AC⊥BD 和 95℃} + AC\\perp{}BD",
    );
  });

  it("preserves nested and whitespace-separated text-mode arguments", () => {
    const expression = "\\text {outer \\textbf{inner ⊥} ℃} + A′";
    expect(normalizeMathExpression(expression)).toBe(
      "\\text {outer \\textbf{inner ⊥} ℃} + A'",
    );
  });

  it("does not mistake an escaped backslash for a text-mode command", () => {
    expect(normalizeMathExpression("\\\\text{A⊥B} + \\text{C⊥D}")).toBe(
      "\\\\text{A\\perp{}B} + \\text{C⊥D}",
    );
  });

  it("keeps a power on a primed variable parseable", () => {
    const expression = normalizeMathExpression("v′^{2}");
    expect(expression).toBe("v'^{2}");
    expect(() => katex.renderToString(expression, { throwOnError: true })).not.toThrow();
  });

  it("produces strict-compatible KaTeX for normalized notation", () => {
    const warnings: string[] = [];
    const expression = normalizeMathExpression(
      "∆A′B′C′⊥BD, 3∶5, -95℃, 0.1％, 6□0",
    );

    expect(() => katex.renderToString(expression, {
      strict: (code, message) => {
        warnings.push(`${code}: ${message}`);
        return "warn";
      },
      throwOnError: true,
    })).not.toThrow();
    expect(warnings).toEqual([]);
  });
});
