import assert from "node:assert/strict";
import test from "node:test";
import { amcLevelForFilename, normalizeAmcGrades } from "./set-amc-grade-levels.mjs";

test("maps AMC filenames to their competition levels", () => {
  assert.equal(amcLevelForFilename("amc8.json"), "AMC-8");
  assert.equal(amcLevelForFilename("amc10.json"), "AMC-10");
  assert.equal(amcLevelForFilename("amc12.json"), "AMC-12");
  assert.throws(() => amcLevelForFilename("mathematics.json"), /Unsupported AMC filename/);
});

test("sets grade_band and grade without mutating source records", () => {
  const records = [
    { id: "one", grade_band: "初中", grade: "八年级", stem: "First" },
    { id: "two", grade_band: "AMC-8", grade: "八年级", stem: "Second" },
  ];
  const { questions, changed } = normalizeAmcGrades(records, "AMC-8", "amc8.json");

  assert.equal(changed, 2);
  assert.deepEqual(questions, [
    { id: "one", grade_band: "AMC-8", grade: "AMC-8", stem: "First" },
    { id: "two", grade_band: "AMC-8", grade: "AMC-8", stem: "Second" },
  ]);
  assert.equal(records[0].grade_band, "初中");
  assert.equal(records[1].grade, "八年级");
});

test("is idempotent for records already assigned to the level", () => {
  const record = { id: "one", grade_band: "AMC-10", grade: "AMC-10" };
  const { questions, changed } = normalizeAmcGrades([record], "AMC-10");

  assert.equal(changed, 0);
  assert.equal(questions[0], record);
});