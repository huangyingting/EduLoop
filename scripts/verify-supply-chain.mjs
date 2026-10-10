import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyInstallScriptPolicy } from "./verify-install-scripts.mjs";

export async function verifySupplyChain(root = process.cwd()) {
  const failures = [];

  const workflowDirectory = path.join(root, ".github", "workflows");
  const workflowFiles = (await readdir(workflowDirectory))
    .filter((filename) => /\.ya?ml$/i.test(filename))
    .sort();
  const actionReferences = [];
  const serviceImages = [];

  for (const filename of workflowFiles) {
    const source = await readFile(path.join(workflowDirectory, filename), "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      const action = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/)?.[1];
      if (action) {
        actionReferences.push(action);
        const protectedWebstackRelease = /^huangyingting\/webstack\/\.github\/workflows\/webstack-deploy\.yml@v\d+\.\d+\.\d+$/.test(action);
        const immutable = action.startsWith("./")
          || protectedWebstackRelease
          || (action.startsWith("docker://")
            ? /^docker:\/\/.+@sha256:[a-f0-9]{64}$/.test(action)
            : /^[^@\s]+@[a-f0-9]{40}$/.test(action));
        if (!immutable) failures.push(`${filename}:${index + 1} action is not pinned to an immutable revision: ${action}`);
      }

      const serviceImage = line.match(/^\s+image:\s*([^\s#]+)/)?.[1];
      if (serviceImage) {
        serviceImages.push(serviceImage);
        if (!/@sha256:[a-f0-9]{64}$/.test(serviceImage)) {
          failures.push(`${filename}:${index + 1} service image is not digest-pinned: ${serviceImage}`);
        }
      }
    }
  }

  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  const baseImages = [...dockerfile.matchAll(/^FROM(?:\s+--platform=\S+)?\s+([^\s]+)(?:\s+AS\s+\S+)?\s*(?:#.*)?$/gim)]
    .map((match) => match[1]);
  for (const image of baseImages) {
    if (image !== "scratch" && !/@sha256:[a-f0-9]{64}$/.test(image)) {
      failures.push(`Dockerfile base image is not digest-pinned: ${image}`);
    }
  }
  const dependencyPolicyCopy = dockerfile.search(/^COPY\s+package\.json\s+package-lock\.json\s+\.npmrc\s+\.\/$/m);
  const verifierCopy = dockerfile.search(/^COPY\s+scripts\/verify-install-scripts\.mjs\s+\.\/scripts\/$/m);
  const dependencyInstall = dockerfile.search(/^RUN\s+npm ci\s+&&\s+npm run dependencies:activate$/m);
  if (
    dependencyPolicyCopy < 0
    || verifierCopy < 0
    || dependencyInstall < 0
    || dependencyPolicyCopy > dependencyInstall
    || verifierCopy > dependencyInstall
  ) {
    failures.push("Dockerfile must install with scripts disabled, then activate only reviewed dependency scripts.");
  }

  const nodeVersion = (await readFile(path.join(root, ".node-version"), "utf8")).trim();
  const exactNodeVersion = /^\d+\.\d+\.\d+$/.test(nodeVersion);
  if (!exactNodeVersion) failures.push(".node-version must contain an exact semantic version.");
  const nodeImages = baseImages.filter((image) => image.startsWith("node:"));
  if (nodeImages.length === 0) failures.push("Dockerfile must use a Node base image.");
  for (const image of nodeImages) {
    if (!image.startsWith(`node:${nodeVersion}-`)) {
      failures.push(`Dockerfile Node base image does not match .node-version ${nodeVersion}: ${image}`);
    }
  }

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  if (!/^npm@\d+\.\d+\.\d+$/.test(packageJson.packageManager ?? "")) {
    failures.push("packageManager must pin an exact npm version.");
  }
  const nodeMajor = exactNodeVersion ? Number.parseInt(nodeVersion, 10) : undefined;
  const expectedNodeEngine = nodeMajor === undefined ? undefined : `>=${nodeMajor} <${nodeMajor + 1}`;
  if (expectedNodeEngine && packageJson.engines?.node !== expectedNodeEngine) {
    failures.push(`package.json engines.node must be ${expectedNodeEngine}.`);
  }

  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  if (expectedNodeEngine && packageLock.packages?.[""]?.engines?.node !== expectedNodeEngine) {
    failures.push(`package-lock.json root engines.node must be ${expectedNodeEngine}.`);
  }

  const installScriptPolicy = await verifyInstallScriptPolicy(root);
  failures.push(...installScriptPolicy.failures);

  const dependabot = await readFile(path.join(root, ".github", "dependabot.yml"), "utf8");
  const ecosystems = new Set([...dependabot.matchAll(/^\s*-\s+package-ecosystem:\s*['"]?([\w-]+)['"]?\s*(?:#.*)?$/gm)]
    .map((match) => match[1]));
  for (const ecosystem of ["npm", "github-actions", "docker"]) {
    if (!ecosystems.has(ecosystem)) failures.push(`Dependabot does not cover ${ecosystem}.`);
  }

  return {
    failures,
    summary: {
      workflowFiles: workflowFiles.length,
      pinnedActions: actionReferences.length,
      pinnedServiceImages: serviceImages.length,
      pinnedBaseImages: baseImages.length,
      nodeVersion,
      packageManager: packageJson.packageManager,
      reviewedInstallScripts: installScriptPolicy.summary.reviewedInstallScripts,
      dependabotEcosystems: [...ecosystems].sort(),
    },
  };
}

export async function assertSupplyChain(root = process.cwd()) {
  const result = await verifySupplyChain(root);
  if (result.failures.length) {
    throw new Error(`Supply-chain verification failed:\n${result.failures.map((failure) => `- ${failure}`).join("\n")}`);
  }
  return result.summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedPath) {
  console.log(JSON.stringify(await assertSupplyChain(), null, 2));
}
