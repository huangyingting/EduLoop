import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Persisted status, role, and action values must come from
// src/lib/domain-constants.ts so a typo cannot compile and silently match nothing.
const DOMAIN_VALUE_PATTERN = "^(PUBLISHED|NEEDS_REVIEW|RETIRED|ACTIVE|MASTERED|DISMISSED|OPEN|RESOLVED|COMPLETED|ABANDONED|SUBMITTING|SUBMITTED|APPROVED|DRAFT|REJECTED|SUPERSEDED|CURATED|DERIVED|LEARNER|CONTENT_EDITOR|ADMIN|QUARANTINE|RESOLVE|REOPEN)$";

const DOMAIN_VALUE_RULE = {
  selector: `Literal[value=/${DOMAIN_VALUE_PATTERN}/]`,
  message: "Use the matching constant from @/lib/domain-constants instead of a status, role, or action literal.",
};

// Learner-facing UI text lives in the message catalogs under src/i18n/messages
// so every interface language can translate it.
const CJK_PATTERN = "[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]";
const UI_TEXT_MESSAGE = "Move learner-facing text into src/i18n/messages and render it with t().";
const UI_TEXT_RULES = [
  { selector: `Literal[value=/${CJK_PATTERN}/]`, message: UI_TEXT_MESSAGE },
  { selector: `TemplateElement[value.raw=/${CJK_PATTERN}/]`, message: UI_TEXT_MESSAGE },
  { selector: `JSXText[value=/${CJK_PATTERN}/]`, message: UI_TEXT_MESSAGE },
];

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/integration/**", "src/lib/domain-constants.ts"],
    rules: {
      "no-restricted-syntax": ["error", DOMAIN_VALUE_RULE],
    },
  },
  {
    // The content studio is an operator tool and the legal pages are
    // authoritative in Chinese only, so both stay out of the catalogs.
    files: ["src/components/**/*.ts", "src/components/**/*.tsx", "src/app/**/*.ts", "src/app/**/*.tsx"],
    ignores: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/components/studio/**",
      "src/components/content-studio.tsx",
      "src/components/learning-health-panel.tsx",
      "src/app/studio/**",
      "src/app/terms/**",
      "src/app/privacy-policy/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", DOMAIN_VALUE_RULE, ...UI_TEXT_RULES],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
