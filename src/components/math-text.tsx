"use client";

import { Fragment, useMemo } from "react";
import Image from "next/image";
import katex from "katex";
import { tokenizeMathContent } from "@/lib/math-content";
import { normalizeMathExpression, requiresDisplayMath } from "@/lib/math-expression";

const TRUSTED_FIGURE_HOSTS = new Set([
  "artofproblemsolving.com",
  "latex.artofproblemsolving.com",
  "live.poshenloh.com",
  "wiki-images.artofproblemsolving.com",
  "wiki.randommath.com",
]);

function figureUrl(part: string) {
  const match = part.match(/^\[Figure:\s*([^\]\s]+)\]$/);
  if (!match) return null;
  if (/^\/question-assets\/source\/amc\/[a-z0-9._/-]+$/i.test(match[1])) return match[1];
  try {
    const url = new URL(match[1]);
    return url.protocol === "https:" && TRUSTED_FIGURE_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function RenderedMath({ math, displayMode }: { math: string; displayMode: boolean }) {
  const html = useMemo(() => katex.renderToString(math, {
    displayMode,
    errorColor: "#e85d75",
    strict: "ignore",
    throwOnError: false,
  }), [displayMode, math]);
  return (
    <span
      className={displayMode ? "my-4 block max-w-full overflow-x-auto" : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({ children, className = "" }: { children: string; className?: string }) {
  const tokens = tokenizeMathContent(children);
  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.kind === "inline-math" || token.kind === "display-math") {
          const math = normalizeMathExpression(token.value);
          if (!math.trim()) return null;
          const displayMode = token.kind === "display-math" || requiresDisplayMath(math);
          return <RenderedMath key={index} math={math} displayMode={displayMode} />;
        }
        if (token.kind === "figure") {
          const src = figureUrl(token.value);
          if (!src) return <Fragment key={index}>{token.value}</Fragment>;
          return (
            <span key={index} className="my-4 flex justify-center">
              <Image src={src} alt="Question figure" width={900} height={600} className="h-auto max-h-96 w-auto max-w-full rounded-xl object-contain" />
            </span>
          );
        }
        return <Fragment key={index}>{token.value.replaceAll("\\$", "$")}</Fragment>;
      })}
    </span>
  );
}
