import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ACTIVATE_COMMAND = "node scripts/verify-install-scripts.mjs && npm rebuild --ignore-scripts=false";

export async function verifyInstallScriptPolicy(root = process.cwd()) {
  const failures = [];
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const installScriptPackages = new Set();

  for (const [location, metadata] of Object.entries(packageLock.packages ?? {})) {
    if (!metadata.hasInstallScript || !metadata.version || !location.includes("node_modules/")) continue;
    const name = location.split("node_modules/").at(-1);
    installScriptPackages.add(`${name}@${metadata.version}`);
  }

  const reviewedInstallScripts = packageJson.allowScripts && typeof packageJson.allowScripts === "object"
    ? packageJson.allowScripts
    : {};
  for (const packageId of installScriptPackages) {
    if (typeof reviewedInstallScripts[packageId] !== "boolean") {
      failures.push(`allowScripts must review install scripts for exact package ${packageId}.`);
    }
  }
  for (const [packageId, decision] of Object.entries(reviewedInstallScripts)) {
    if (typeof decision !== "boolean") {
      failures.push(`allowScripts decision for ${packageId} must be true or false.`);
    }
    if (!installScriptPackages.has(packageId)) {
      failures.push(`allowScripts entry does not match an install-script package in package-lock.json: ${packageId}`);
    }
  }
  if (packageJson.scripts?.["dependencies:activate"] !== ACTIVATE_COMMAND) {
    failures.push("dependencies:activate must verify the allowlist before rebuilding dependency scripts.");
  }

  const npmConfig = await readFile(path.join(root, ".npmrc"), "utf8");
  const ignoreScripts = npmConfig.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((line) => /^ignore-scripts\s*=\s*true$/i.test(line));
  if (!ignoreScripts) failures.push(".npmrc must set ignore-scripts=true.");

  return {
    failures,
    summary: { reviewedInstallScripts: installScriptPackages.size },
  };
}

export async function assertInstallScriptPolicy(root = process.cwd()) {
  const result = await verifyInstallScriptPolicy(root);
  if (result.failures.length) {
    throw new Error(`Install-script verification failed:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}`);
  }
  return result.summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedPath) {
  console.log(JSON.stringify(await assertInstallScriptPolicy(), null, 2));
}
