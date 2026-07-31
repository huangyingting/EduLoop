import katex from "katex";
import { describe, expect, it } from "vitest";
import { normalizeMathExpression, requiresDisplayMath } from "./math-expression";

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
    expect(normalizeMathExpression("\\rm{①}+5¢")).toBe(
      "\\rm{\\text{\\textcircled{1}}}+5\\,\\mathrm{cent}",
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

  it("repairs legacy currency, subscript, and overlay commands", () => {
    expect(normalizeMathExpression(
      "\\textdollar50+a\\textsubscript{1}+4\\cent+SO\\rlap{_{4}}{^{2-}}",
    )).toBe(
      "\\$50+a_{1}+4\\,\\mathrm{cent}+SO_{4}^{2-}",
    );
  });

  it("converts legacy table syntax and row spacing", () => {
    expect(normalizeMathExpression(
      "\\begin{tabular}[t]{c}x\\\\ [-2.5ex]y\\end{tabular}",
    )).toBe(
      "\\begin{array}{c}x\\\\[-2.5ex]y\\end{array}",
    );
  });

  it("repairs deterministic source and command artifacts", () => {
    expect(normalizeMathExpression(
      "\u000crac12+\\wideparen{AB}+m\\inN+S\\subseteqN+b_{n}_{+1}+left(x)+###",
    )).toBe(
      "\\frac12+\\overgroup{AB}+m\\in N+S\\subseteq N+b_{n+1}+\\left(x)+\\#\\#\\#",
    );
    expect(normalizeMathExpression("\\mathrm{\\text{·}}+A═B―→C\ue004\ue007\uef01")).toBe(
      "\\cdot+A=B\\longrightarrow{}C",
    );
  });

  it("removes nested math delimiters from an extracted expression", () => {
    expect(normalizeMathExpression(
      "\\boxed{{\\textbf{(E)~$\\dfrac{1}{97}$}}}",
    )).toBe(
      "\\boxed{{\\mathbf{(E)~\\dfrac{1}{97}}}}",
    );
  });

  it("promotes display-only LaTeX constructs", () => {
    expect(requiresDisplayMath("x+y")).toBe(false);
    expect(requiresDisplayMath("a+b=3x \\tag{1}")).toBe(true);
    expect(requiresDisplayMath("\\begin{split}x&=1\\\\y&=2\\end{split}")).toBe(true);
    expect(requiresDisplayMath("\\begin{align*}x&=1\\end{align*}")).toBe(true);
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
