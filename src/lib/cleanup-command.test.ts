import { describe, expect, it, vi } from "vitest";
import { runExpiredSecurityArtifactCleanup } from "./cleanup-command";

const removed = {
  adapterSessions: 2,
  authVerificationTokens: 3,
  emailVerificationTokens: 5,
  emailChangeTokens: 7,
  passwordResetTokens: 11,
  rateLimitBuckets: 13,
  staleUnverifiedRegistrations: 17,
};

describe("expired security artifact cleanup command", () => {
  it("emits aggregate completion metadata for scheduler monitoring", async () => {
    const info = vi.fn();
    const error = vi.fn();
    const cleanup = vi.fn().mockResolvedValue(removed);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-01T04:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-01T04:00:01.000Z"));
    const monotonicNow = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(132.84);

    await expect(runExpiredSecurityArtifactCleanup({
      cleanup,
      disconnect,
      info,
      error,
      now,
      monotonicNow,
    })).resolves.toBe(0);

    expect(cleanup).toHaveBeenCalledWith(new Date("2026-08-01T04:00:00.000Z"));
    expect(disconnect).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(JSON.parse(info.mock.calls[0][0])).toEqual({
      level: "info",
      event: "expired_security_artifact_cleanup_completed",
      startedAt: "2026-08-01T04:00:00.000Z",
      cutoffAt: "2026-08-01T04:00:00.000Z",
      completedAt: "2026-08-01T04:00:01.000Z",
      durationMs: 32.8,
      removedTotal: 58,
      removed,
    });
  });

  it("reports cleanup failures without copying exception messages", async () => {
    const info = vi.fn();
    const error = vi.fn();
    const cleanupError = Object.assign(
      new Error("postgresql://operator:secret@database.example/learners"),
      { code: "P1001" },
    );
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-01T04:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-01T04:00:02.000Z"));
    const monotonicNow = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(145);

    await expect(runExpiredSecurityArtifactCleanup({
      cleanup: vi.fn().mockRejectedValue(cleanupError),
      disconnect: vi.fn().mockResolvedValue(undefined),
      info,
      error,
      now,
      monotonicNow,
    })).resolves.toBe(1);

    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    const entry = JSON.parse(error.mock.calls[0][0]);
    expect(entry).toEqual({
      level: "error",
      event: "expired_security_artifact_cleanup_failed",
      startedAt: "2026-08-01T04:00:00.000Z",
      failedAt: "2026-08-01T04:00:02.000Z",
      durationMs: 45,
      errorType: "Error",
      errorCode: "P1001",
      phase: "cleanup",
    });
    expect(JSON.stringify(entry)).not.toContain("secret");
    expect(JSON.stringify(entry)).not.toContain("database.example");
  });

  it("fails without a completion event when client shutdown fails", async () => {
    const info = vi.fn();
    const error = vi.fn();
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-01T04:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-01T04:00:03.000Z"));
    const monotonicNow = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(150);

    await expect(runExpiredSecurityArtifactCleanup({
      cleanup: vi.fn().mockResolvedValue(removed),
      disconnect: vi.fn().mockRejectedValue(new Error("secret shutdown details")),
      info,
      error,
      now,
      monotonicNow,
    })).resolves.toBe(1);

    expect(info).not.toHaveBeenCalled();
    const entry = JSON.parse(error.mock.calls[0][0]);
    expect(entry).toMatchObject({
      level: "error",
      event: "expired_security_artifact_cleanup_failed",
      phase: "disconnect",
      errorType: "Error",
    });
    expect(JSON.stringify(entry)).not.toContain("secret shutdown details");
  });

  it("treats an undefined rejection as a bounded failure", async () => {
    const info = vi.fn();
    const error = vi.fn();
    const now = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-01T04:00:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-01T04:00:04.000Z"));
    const monotonicNow = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(160);

    await expect(runExpiredSecurityArtifactCleanup({
      cleanup: vi.fn().mockRejectedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      info,
      error,
      now,
      monotonicNow,
    })).resolves.toBe(1);

    expect(info).not.toHaveBeenCalled();
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      event: "expired_security_artifact_cleanup_failed",
      phase: "cleanup",
      errorType: "UnknownError",
    });
  });
});
