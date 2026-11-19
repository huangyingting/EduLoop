import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Persisted status, role, and action values must come from
// src/lib/domain-constants.ts so a typo cannot compile and silently match nothing.
const DOMAIN_VALUE_PATTERN = "^(PUBLISHED|NEEDS_REVIEW|RETIRED|ACTIVE|MASTERED|DISMISSED|OPEN|RESOLVED|COMPLETED|ABANDONED|APPROVED|DRAFT|CURATED|LEARNER|CONTENT_EDITOR|ADMIN|QUARANTINE|RESOLVE|REOPEN)$";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/integration/**", "src/lib/domain-constants.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: `Literal[value=/${DOMAIN_VALUE_PATTERN}/]`,
        message: "Use the matching constant from @/lib/domain-constants instead of a status, role, or action literal.",
      }],
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
