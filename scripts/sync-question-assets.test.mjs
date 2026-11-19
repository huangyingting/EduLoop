import assert from "node:assert/strict";
import test from "node:test";
import { syncArguments } from "./sync-question-assets.mjs";

test("builds a non-overwriting, login-authenticated upload", () => {
  const args = syncArguments({ account: "eduloopassets", container: "content", source: "/repo/public/question-assets", dryRun: true });
  assert.deepEqual(args.slice(0, 3), ["storage", "blob", "upload-batch"]);
  assert.ok(args.includes("--dryrun"));
  assert.equal(args[args.indexOf("--overwrite") + 1], "false");
  assert.equal(args[args.indexOf("--auth-mode") + 1], "login");
  assert.equal(args[args.indexOf("--destination-path") + 1], "question-assets");
});

test("rejects malformed account and container names", () => {
  assert.throws(() => syncArguments({ account: "Bad_Account", container: "content", source: "/x" }), /AZURE_STORAGE_ACCOUNT/);
  assert.throws(() => syncArguments({ account: "eduloopassets", container: "-bad", source: "/x" }), /ASSET_CONTAINER/);
});
