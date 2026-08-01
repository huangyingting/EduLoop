import { describe, expect, it } from "vitest";
import {
  OperatorCommandRejection,
  finishOperatorCommand,
  operatorCommandFailureEntry,
  type OperatorCommandTiming,
} from "./operator-command";

const timing: OperatorCommandTiming = {
  startedAt: new Date("2026-08-01T04:00:00.000Z"),
  startedAtMonotonic: 100,
};

describe("operator command telemetry", () => {
  it("emits a bounded structured failure without exception text", () => {
    const error = Object.assign(
      new Error("postgresql://operator:secret@database.example/learners"),
      { code: "P1001" },
    );
    const entry = operatorCommandFailureEntry(
      "catalog_seed",
      error,
      timing,
      new Date("2026-08-01T04:00:01.000Z"),
      135.26,
    );

    expect(entry).toEqual({
      level: "error",
      event: "catalog_seed_failed",
      startedAt: "2026-08-01T04:00:00.000Z",
      failedAt: "2026-08-01T04:00:01.000Z",
      durationMs: 35.3,
      errorType: "Error",
      errorCode: "P1001",
    });
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(JSON.stringify(entry)).not.toContain("database.example");
  });

  it("keeps expected operator rejections actionable and free of supplied values", () => {
    const entry = operatorCommandFailureEntry(
      "user_role_command",
      new OperatorCommandRejection("USER_NOT_FOUND"),
      timing,
      new Date("2026-08-01T04:00:02.000Z"),
      110,
    );

    expect(entry).toEqual({
      level: "warn",
      event: "user_role_command_rejected",
      reason: "USER_NOT_FOUND",
      message: "No registered user was found for the supplied email address.",
      startedAt: "2026-08-01T04:00:00.000Z",
      rejectedAt: "2026-08-01T04:00:02.000Z",
      durationMs: 10,
    });
  });

  it("clamps invalid or negative monotonic durations", () => {
    expect(finishOperatorCommand(
      timing,
      new Date("2026-08-01T04:00:03.000Z"),
      75,
    ).durationMs).toBe(0);
    expect(finishOperatorCommand(
      timing,
      new Date("2026-08-01T04:00:03.000Z"),
      Number.NaN,
    ).durationMs).toBe(0);
  });

  it("does not let a hostile thrown value break the failure logger", () => {
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("private proxy trap");
      },
    });

    expect(() => operatorCommandFailureEntry(
      "catalog_seed",
      hostile,
      timing,
      new Date("2026-08-01T04:00:04.000Z"),
      120,
    )).not.toThrow();
    expect(operatorCommandFailureEntry(
      "catalog_seed",
      hostile,
      timing,
      new Date("2026-08-01T04:00:04.000Z"),
      120,
    )).toMatchObject({ errorType: "UnknownError" });
  });
});
