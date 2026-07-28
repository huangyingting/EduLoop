import { validateEnvironment } from "./environment.mjs";

const result = validateEnvironment(process.env);
for (const warning of result.warnings) console.warn(`Environment warning: ${warning}`);

if (result.errors.length) {
  for (const error of result.errors) console.error(`Environment error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Environment is valid for ${result.provider}.`);
}
