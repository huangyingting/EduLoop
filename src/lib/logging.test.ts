import { describe, expect, it } from "vitest";
import { errorLogMetadata, safeLogToken } from "./logging";

describe("privacy-safe logging metadata", () => {
  it("keeps bounded diagnostic fields without copying the exception message", () => {
    const error = Object.assign(
      new TypeError("postgresql://operator:secret@database.example/learners"),
      { code: "ECONNREFUSED", status: 503 },
    );
    const metadata = errorLogMetadata(error);

    expect(metadata).toEqual({
      errorType: "TypeError",
      errorCode: "ECONNREFUSED",
      errorStatus: 503,
    });
    expect(JSON.stringify(metadata)).not.toContain("secret");
    expect(JSON.stringify(metadata)).not.toContain("database.example");
  });

  it("rejects untrusted names, codes, paths, and arbitrary thrown values", () => {
    const error = Object.assign(new Error("sensitive learner response"), {
      name: "learner response leaked here",
      code: "re_live_secret_token",
    });

    expect(errorLogMetadata(error)).toEqual({ errorType: "Error" });
    expect(errorLogMetadata("private@example.com")).toEqual({ errorType: "UnknownError" });
    expect(safeLogToken("route_digest-42")).toBe("route_digest-42");
    expect(safeLogToken("/learner/private@example.com")).toBeUndefined();
  });

  it("does not let hostile error properties break the logging path", () => {
    const error = new Error("private value");
    Object.defineProperty(error, "name", {
      get() {
        throw new Error("poisoned getter");
      },
    });

    expect(() => errorLogMetadata(error)).not.toThrow();
    expect(errorLogMetadata(error)).toEqual({ errorType: "Error" });
  });
});
