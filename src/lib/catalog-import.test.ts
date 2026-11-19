import { describe, expect, it } from "vitest";
import {
  CatalogImportRefused,
  assertCatalogImportAllowed,
  automaticRetireAllowance,
  planCatalogRetirement,
  validateSupersededSourceIds,
} from "./catalog-import";

const existing = [
  { id: "q1", sourceId: "q1", retiredAt: null, supersededById: null },
  { id: "q2", sourceId: "q2", retiredAt: null, supersededById: null },
  { id: "q3", sourceId: "q3", retiredAt: new Date("2026-11-01"), supersededById: null },
];

describe("catalog retirement planning", () => {
  it("retires missing active questions and revives returning retired ones", () => {
    const plan = planCatalogRetirement(existing, new Set(["q1", "q3"]));
    expect(plan.retire.map(({ id }) => id)).toEqual(["q2"]);
    expect(plan.revive.map(({ id }) => id)).toEqual(["q3"]);
  });

  it("does not retire an already retired question again", () => {
    expect(planCatalogRetirement(existing, new Set(["q1", "q2"])).retire).toEqual([]);
  });

  it("allows small retirements automatically and scales with the catalog", () => {
    expect(automaticRetireAllowance(0)).toBe(5);
    expect(automaticRetireAllowance(16_022)).toBe(160);
  });

  it("refuses an empty source catalog", () => {
    expect(() => assertCatalogImportAllowed({ sourceCount: 0, activeQuestionCount: 10, retireCount: 10 }))
      .toThrow(CatalogImportRefused);
  });

  it("requires an explicit allowance for mass retirement", () => {
    expect(() => assertCatalogImportAllowed({ sourceCount: 10, activeQuestionCount: 100, retireCount: 6 }))
      .toThrow(/--allow-retire=6/);
    expect(() => assertCatalogImportAllowed({
      sourceCount: 10, activeQuestionCount: 100, retireCount: 6, allowRetire: 6,
    })).not.toThrow();
  });

  it("validates superseded mappings against the active source", () => {
    const active = new Set(["new-question"]);
    expect(() => validateSupersededSourceIds({ "old-question": "new-question" }, active)).not.toThrow();
    expect(() => validateSupersededSourceIds({ "new-question": "new-question" }, active)).toThrow(/still present/);
    expect(() => validateSupersededSourceIds({ "old-question": "missing-question" }, active)).toThrow(/not in the source/);
  });
});
