import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("VM deployment delegates to the pinned Webstack workflow", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-vm.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /uses: huangyingting\/webstack\/\.github\/workflows\/webstack-deploy\.yml@[a-f0-9]{40}/,
  );
  assert.match(workflow, /mode: deploy-webapp/);
  assert.match(workflow, /app_name: \$\{\{ vars\.VM_APP_NAME \|\| 'eduloop' \}\}/);
  assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /operations_dockerfile: Dockerfile\.ops/);
  assert.match(workflow, /operations_command: npm run db:deploy:postgres && npm run db:seed/);
  assert.match(workflow, /release_env_var: APP_VERSION/);
  assert.match(workflow, /secrets: inherit/);
  assert.doesNotMatch(workflow, /\bssh\b|\bscp\b|VM_SSH_PRIVATE_KEY|VM_KNOWN_HOSTS/);
});

test("VM images exclude local caches and secrets", async () => {
  const dockerignore = await readFile(
    new URL("../.dockerignore", import.meta.url),
    "utf8",
  );
  const operationsDockerfile = await readFile(
    new URL("../Dockerfile.ops", import.meta.url),
    "utf8",
  );
  const operationsPackage = JSON.parse(await readFile(
    new URL("../ops/package.json", import.meta.url),
    "utf8",
  ));
  assert.match(dockerignore, /^\.cache$/m);
  assert.match(dockerignore, /^\*\.pem$/m);
  assert.match(operationsDockerfile, /npm ci/);
  assert.doesNotMatch(operationsDockerfile, /^COPY \. \.$/m);
  assert.equal(operationsPackage.devDependencies, undefined);
});

test("VM builds generate the native PostgreSQL Prisma engine", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ));
  const schema = await readFile(
    new URL("../prisma/postgresql/schema.prisma", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(schema, /engineType\s*=\s*"client"/);
  assert.match(packageJson.scripts["db:generate:postgres"], /prisma generate/);
  assert.equal(packageJson.scripts["db:generate:postgres:cloudflare"], undefined);
  assert.equal(packageJson.scripts["build:cloudflare"], undefined);
});
