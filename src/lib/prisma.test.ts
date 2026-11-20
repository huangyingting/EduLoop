import { describe, expect, it } from "vitest";
import { prismaLogLevels, slowQueryThresholdMs, statementFingerprint } from "./prisma";

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

describe("slow query logging", () => {
  it("is opt-in with a sane threshold and logs statement shape only", () => {
    expect(slowQueryThresholdMs(undefined)).toBeNull();
    expect(slowQueryThresholdMs("5")).toBeNull();
    expect(slowQueryThresholdMs("250")).toBe(250);
    expect(statementFingerprint('SELECT  "id"\n FROM "Question" WHERE "id" = $1')).toBe('SELECT "id" FROM "Question" WHERE "id" = $1');
  });
});
