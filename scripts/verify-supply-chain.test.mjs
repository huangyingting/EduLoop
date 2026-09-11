import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertSupplyChain } from "./verify-supply-chain.mjs";

const actionSha = "a".repeat(40);
const imageDigest = `sha256:${"b".repeat(64)}`;

async function createFixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "eduloop-supply-chain-"));
  t.after(() => rm(root, { force: true, recursive: true }));

  const files = {
    ".github/dependabot.yml": [
      "version: 2",
      "updates:",
      "  - package-ecosystem: npm",
      "  - package-ecosystem: github-actions",
      "  - package-ecosystem: docker",
    ].join("\n"),
    ".github/workflows/ci.yml": [
      "steps:",
      `  - uses: actions/checkout@${actionSha}`,
      "services:",
      `  postgres:\n    image: postgres:17-alpine@${imageDigest}`,
    ].join("\n"),
    ".node-version": "24.18.1\n",
    ".npmrc": "ignore-scripts=true\n",
    Dockerfile: [
      `FROM node:24.18.1-alpine@${imageDigest} AS builder`,
      "COPY package.json package-lock.json .npmrc ./",
      "COPY scripts/verify-install-scripts.mjs ./scripts/",
      "RUN npm ci && npm run dependencies:activate",
      `FROM node:24.18.1-alpine@${imageDigest} AS runner`,
    ].join("\n"),
    "package.json": JSON.stringify({
      packageManager: "npm@11.16.0",
      engines: { node: ">=24 <25" },
      scripts: {
        "dependencies:activate": "node scripts/verify-install-scripts.mjs && npm rebuild --ignore-scripts=false",
      },
      allowScripts: { "example-installer@1.2.3": true },
    }),
    "package-lock.json": JSON.stringify({
      packages: {
        "": { engines: { node: ">=24 <25" } },
        "node_modules/example-installer": { version: "1.2.3", hasInstallScript: true },
      },
    }),
    ...overrides,
  };

  for (const [filename, contents] of Object.entries(files)) {
    const destination = path.join(root, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }

  return root;
}

test("accepts immutable and version-aligned build inputs", async (t) => {
  const root = await createFixture(t);
  const summary = await assertSupplyChain(root);

  assert.equal(summary.pinnedActions, 1);
  assert.equal(summary.pinnedServiceImages, 1);
  assert.equal(summary.pinnedBaseImages, 2);
});

test("rejects mutable action and service image references", async (t) => {
  const root = await createFixture(t, {
    ".github/workflows/ci.yml": [
      "steps:",
      "  - uses: actions/checkout@v7",
      "services:",
      "  postgres:\n    image: postgres:17-alpine",
    ].join("\n"),
  });

  await assert.rejects(
    assertSupplyChain(root),
    /action is not pinned[\s\S]*service image is not digest-pinned/,
  );
});

test("rejects Docker actions without a SHA-256 image digest", async (t) => {
  const root = await createFixture(t, {
    ".github/workflows/ci.yml": [
      "steps:",
      `  - uses: docker://example/action@${actionSha}`,
      "services:",
      `  postgres:\n    image: postgres:17-alpine@${imageDigest}`,
    ].join("\n"),
  });

  await assert.rejects(assertSupplyChain(root), /action is not pinned to an immutable revision/);
});

test("rejects any Node Docker stage that drifts from .node-version", async (t) => {
  const root = await createFixture(t, {
    Dockerfile: [
      `FROM node:24.18.1-alpine@${imageDigest} AS builder`,
      "COPY package.json package-lock.json .npmrc ./",
      "RUN npm ci",
      `FROM node:24.17.0-alpine@${imageDigest} AS runner`,
    ].join("\n"),
  });

  await assert.rejects(assertSupplyChain(root), /does not match \.node-version 24\.18\.1/);
});

test("requires the Docker install layer to enforce reviewed dependency scripts", async (t) => {
  const root = await createFixture(t, {
    Dockerfile: [
      `FROM node:24.18.1-alpine@${imageDigest} AS builder`,
      "RUN npm ci",
      "COPY package.json package-lock.json .npmrc ./",
      "COPY scripts/verify-install-scripts.mjs ./scripts/",
      `FROM node:24.18.1-alpine@${imageDigest} AS runner`,
    ].join("\n"),
  });

  await assert.rejects(assertSupplyChain(root), /activate only reviewed dependency scripts/);
});

test("rejects package metadata that drifts from the pinned Node major", async (t) => {
  const root = await createFixture(t, {
    "package.json": JSON.stringify({
      packageManager: "npm@11.16.0",
      engines: { node: ">=24" },
      scripts: {
        "dependencies:activate": "node scripts/verify-install-scripts.mjs && npm rebuild --ignore-scripts=false",
      },
      allowScripts: { "example-installer@1.2.3": true },
    }),
  });

  await assert.rejects(assertSupplyChain(root), /package\.json engines\.node must be >=24 <25/);
});

test("rejects broad or missing install-script review entries", async (t) => {
  const root = await createFixture(t, {
    "package.json": JSON.stringify({
      packageManager: "npm@11.16.0",
      engines: { node: ">=24 <25" },
      scripts: {
        "dependencies:activate": "node scripts/verify-install-scripts.mjs && npm rebuild --ignore-scripts=false",
      },
      allowScripts: { "example-installer": true },
    }),
  });

  await assert.rejects(
    assertSupplyChain(root),
    /allowScripts must review install scripts for exact package example-installer@1\.2\.3/,
  );
});

test("requires npm to disable dependency scripts by default", async (t) => {
  const root = await createFixture(t, { ".npmrc": "audit=true\n" });

  await assert.rejects(assertSupplyChain(root), /\.npmrc must set ignore-scripts=true/);
});

test("does not count commented Dependabot ecosystems", async (t) => {
  const root = await createFixture(t, {
    ".github/dependabot.yml": [
      "version: 2",
      "updates:",
      "  - package-ecosystem: npm",
      "  - package-ecosystem: github-actions",
      "  # - package-ecosystem: docker",
    ].join("\n"),
  });

  await assert.rejects(assertSupplyChain(root), /Dependabot does not cover docker/);
});
