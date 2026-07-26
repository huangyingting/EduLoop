"use client";

import { Fragment } from "react";
import { InlineMath } from "react-katex";

export function MathText({ children, className = "" }: { children: string; className?: string }) {
  const parts = children.split(/(\$\$[\s\S]*?\$\$)/g);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          return <InlineMath key={index} math={part.slice(2, -2)} errorColor="#e85d75" />;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </span>
  );
}
