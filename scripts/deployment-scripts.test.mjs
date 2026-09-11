import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Azure deployment script is valid Bash and cleans probe temp files", async () => {
  const script = new URL("./deploy-azure.sh", import.meta.url);
  const syntax = spawnSync("bash", ["-n", script.pathname], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const source = await readFile(script, "utf8");
  const start = source.indexOf("configure_health_probes() (");
  const end = source.indexOf("\n)\n\nrequire_command az", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(
    source.slice(start, end),
    /trap 'rm -f "\$template_file" "\$patch_file"' EXIT/,
  );
});
