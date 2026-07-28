"use client";

import { Fragment } from "react";
import Image from "next/image";
import { InlineMath } from "react-katex";

const CONTENT_TOKEN = /(\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$\n])+?(?<!\\)\$|\[Figure:\s*(?:https?:\/\/[^\]\s]+|\/question-assets\/source\/amc\/[a-z0-9._/-]+)\])/gi;
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

export function MathText({ children, className = "" }: { children: string; className?: string }) {
  const parts = children.split(CONTENT_TOKEN);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          return <InlineMath key={index} math={part.slice(2, -2)} errorColor="#e85d75" />;
        }
        if (part.startsWith("$") && part.endsWith("$")) {
          return <InlineMath key={index} math={part.slice(1, -1)} errorColor="#e85d75" />;
        }
        const src = figureUrl(part);
        if (src) return (
          <span key={index} className="my-4 flex justify-center">
            <Image src={src} alt="Question figure" width={900} height={600} className="h-auto max-h-96 w-auto max-w-full rounded-xl object-contain" />
          </span>
        );
        return <Fragment key={index}>{part.replaceAll("\\$", "$")}</Fragment>;
      })}
    </span>
  );
}
