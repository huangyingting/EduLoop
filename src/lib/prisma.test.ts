import { describe, expect, it } from "vitest";
import { prismaLogLevels } from "./prisma";

describe("Prisma logging", () => {
  it("keeps provider exception messages out of non-development logs", () => {
    expect(prismaLogLevels("production")).toEqual([]);
    expect(prismaLogLevels("test")).toEqual([]);
    expect(prismaLogLevels(undefined)).toEqual([]);
  });

  it("retains detailed provider diagnostics for explicit local development", () => {
    expect(prismaLogLevels("development")).toEqual(["warn", "error"]);
  });
});
