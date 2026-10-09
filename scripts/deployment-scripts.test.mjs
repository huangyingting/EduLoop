import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("VM deployment script integrates with Webstack isolation and rollback", async () => {
  const script = new URL("./deploy-vm.sh", import.meta.url);
  const syntax = spawnSync("bash", ["-n", script.pathname], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const source = await readFile(script, "utf8");
  assert.match(source, /webstack-create-app/);
  assert.match(source, /webstack-deploy/);
  assert.match(source, /\/data\/apps\/\$app_name/);
  assert.match(source, /webstack-apps/);
  assert.match(source, /\/run\/lock\/eduloop-release-\$app_name\.lock/);
  assert.doesNotMatch(source, /lock_file="\/run\/lock\/webstack-deploy-/);
  assert.match(source, /flock -w 600 9/);
  assert.match(source, /npm run db:deploy:postgres/);
  assert.match(source, /npm run db:seed/);
  assert.match(source, /http:\/\/127\.0\.0\.1:3000\/api\/health/);
  assert.match(source, /Restoring the previous EduLoop environment/);
  assert.match(source, /127\.0\.0\.1:\$\{host_port\}:3000/);
  assert.match(source, /sslmode/);
  assert.match(source, /trap cleanup EXIT/);
  assert.match(source, /rm -f "\$incoming_env" "\$next_env"/);
});

test("VM deployment environment merger preserves Webstack credentials", async () => {
  const source = await readFile(new URL("./deploy-vm.sh", import.meta.url), "utf8");
  const match = source.match(/<<'PY'\n([\s\S]*?)\nPY/);
  assert.ok(match, "embedded environment merger was not found");

  const directory = await mkdtemp(join(tmpdir(), "eduloop-vm-deploy-"));
  try {
    const current = join(directory, "current.env");
    const incoming = join(directory, "incoming.env");
    const output = join(directory, "output.env");
    await writeFile(
      current,
      [
        "PGHOST=172.30.0.1",
        "PGPORT=5432",
        "PGDATABASE=app_eduloop",
        "PGUSER=app_eduloop",
        "PGPASSWORD=database-secret",
        "DATABASE_URL=postgresql://app_eduloop:database-secret@172.30.0.1:5432/app_eduloop",
        "",
      ].join("\n"),
    );
    await writeFile(
      incoming,
      "AUTH_SECRET=application-secret\nAUTH_URL=https://eduloop.genisisiq.com\n",
    );

    const result = spawnSync(
      "python3",
      ["-", current, incoming, output, "a".repeat(40)],
      { encoding: "utf8", input: match[1] },
    );
    assert.equal(result.status, 0, result.stderr);
    const environment = await readFile(output, "utf8");
    assert.match(environment, /^PGPASSWORD=database-secret$/m);
    assert.match(environment, /^AUTH_SECRET=application-secret$/m);
    assert.match(environment, /^AUTH_URL=https:\/\/eduloop\.genisisiq\.com$/m);
    assert.match(environment, /^APP_VERSION=a{40}$/m);
    assert.match(
      environment,
      /^DATABASE_URL=.*schema=public.*sslmode=require.*connection_limit=8.*pool_timeout=10.*connect_timeout=5$/m,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("VM workflow pins actions and keeps SSH host verification enabled", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-vm.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40}/);
  assert.match(workflow, /StrictHostKeyChecking=yes/g);
  assert.match(workflow, /VM_SSH_PRIVATE_KEY/);
  assert.match(workflow, /VM_KNOWN_HOSTS/);
  assert.match(workflow, /VM_APP_DOMAIN/);
  assert.match(workflow, /sudo docker login/);
  assert.match(workflow, /docker push "\$APP_IMAGE"/);
  assert.match(workflow, /--file Dockerfile\.ops/);
  assert.match(workflow, /scripts\/deploy-vm\.sh/);
  assert.doesNotMatch(workflow, /ssh-keyscan/);
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
