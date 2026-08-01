import { describe, expect, it } from "vitest";
import { isDatabaseUnavailableError } from "./database-errors";

describe("database availability errors", () => {
  it.each(["P1000", "P1001", "P1002", "P1003", "P1008", "P1017", "P2024"])(
    "classifies %s as unavailable",
    (code) => {
      expect(isDatabaseUnavailableError(Object.assign(new Error("private provider details"), { code }))).toBe(true);
    },
  );

  it("does not classify application conflicts or untrusted codes as outages", () => {
    expect(isDatabaseUnavailableError(Object.assign(new Error("write conflict"), { code: "P2034" }))).toBe(false);
    expect(isDatabaseUnavailableError({ code: "private-account-id" })).toBe(false);
    expect(isDatabaseUnavailableError("private provider details")).toBe(false);
  });

  it("does not let hostile error fields break classification", () => {
    const hostile = new Proxy({}, {
      get() {
        throw new Error("private proxy trap");
      },
    });
    expect(() => isDatabaseUnavailableError(hostile)).not.toThrow();
    expect(isDatabaseUnavailableError(hostile)).toBe(false);
  });
});
