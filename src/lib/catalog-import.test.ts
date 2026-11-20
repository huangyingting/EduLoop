import { describe, expect, it } from "vitest";
import {
  CatalogImportRefused,
  assertCatalogImportAllowed,
  automaticDeleteAllowance,
  planCatalogDeletion,
} from "./catalog-import";

const existing = [
  { id: "q1", sourceId: "q1" },
  { id: "q2", sourceId: "q2" },
  { id: "q3", sourceId: "q3" },
];

describe("catalog deletion planning", () => {
  it("deletes stored questions that are missing from the source", () => {
    expect(planCatalogDeletion(existing, new Set(["q1", "q3", "q4"])).map(({ id }) => id)).toEqual(["q2"]);
    expect(planCatalogDeletion(existing, new Set(["q1", "q2", "q3"]))).toEqual([]);
  });

  it("allows small deletions automatically and scales with the catalog", () => {
    expect(automaticDeleteAllowance(0)).toBe(5);
    expect(automaticDeleteAllowance(16_022)).toBe(160);
  });

  it("refuses an empty source catalog", () => {
    expect(() => assertCatalogImportAllowed({ sourceCount: 0, storedQuestionCount: 10, deleteCount: 10 }))
      .toThrow(CatalogImportRefused);
  });

  it("requires an explicit allowance for mass deletion", () => {
    expect(() => assertCatalogImportAllowed({ sourceCount: 10, storedQuestionCount: 100, deleteCount: 6 }))
      .toThrow(/--allow-delete=6/);
    expect(() => assertCatalogImportAllowed({
      sourceCount: 10, storedQuestionCount: 100, deleteCount: 6, allowDelete: 6,
    })).not.toThrow();
  });
});
