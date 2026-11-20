import assert from "node:assert/strict";
import test from "node:test";
import { checkDocument, formatStat, rewriteDocument, statValues } from "./doc-stats.mjs";

const stats = {
  seed: { published: 16022, autoGradable: 10130, contestPapers: 143 },
  repository: { generatedDiagrams: 24 },
};
const values = statValues(stats);

test("formats stats with grouping and derives self-assessed questions", () => {
  assert.equal(formatStat(16022), "16,022");
  assert.equal(values["derived.selfAssessed"], 5892);
});

test("accepts marked numbers that match and rejects drift or unknown keys", () => {
  assert.deepEqual(checkDocument("All <!-- stat:seed.published -->16,022<!-- /stat --> questions.", values), []);
  assert.deepEqual(checkDocument("<!-- stat:seed.published -->16,537<!-- /stat -->", values), ['stat "seed.published" shows 16,537, expected 16,022']);
  assert.deepEqual(checkDocument("<!-- stat:seed.missing -->1<!-- /stat -->", values), ['unknown stat "seed.missing"']);
});

test("flags unmarked catalog totals and generated diagram counts only", () => {
  assert.equal(checkDocument("Of the 16,537 bundled questions, most are live.", values).length, 1);
  assert.equal(checkDocument("All 12 generated diagrams are approved.", values).length, 1);
  assert.deepEqual(checkDocument("The AMC files hold 2,984 unique questions and 24 hours of review.", values), []);
});

test("rewrites marked numbers in place", () => {
  assert.equal(
    rewriteDocument("<!-- stat:seed.contestPapers -->140<!-- /stat --> papers", values),
    "<!-- stat:seed.contestPapers -->143<!-- /stat --> papers",
  );
});
