import { prisma } from "./prisma";
import {
  cleanupExpiredSecurityArtifacts,
  type ExpiredSecurityArtifactCleanup,
} from "./retention";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "./operator-command";

type CleanupCommandDependencies = {
  cleanup: (cutoff: Date) => Promise<ExpiredSecurityArtifactCleanup>;
  disconnect: () => Promise<void>;
  info: (entry: string) => void;
  error: (entry: string) => void;
  now: () => Date;
  monotonicNow: () => number;
};

const defaultDependencies: CleanupCommandDependencies = {
  cleanup: cleanupExpiredSecurityArtifacts,
  disconnect: () => prisma.$disconnect(),
  info: (entry) => console.info(entry),
  error: (entry) => console.error(entry),
  now: () => new Date(),
  monotonicNow: () => performance.now(),
};

export async function runExpiredSecurityArtifactCleanup(
  overrides: Partial<CleanupCommandDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  const timing = startOperatorCommand(dependencies.now, dependencies.monotonicNow);
  const cutoff = timing.startedAt;
  let removed: ExpiredSecurityArtifactCleanup | undefined;
  let cleanupFailed = false;
  let cleanupError: unknown;

  try {
    removed = await dependencies.cleanup(cutoff);
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  let disconnectFailed = false;
  let disconnectError: unknown;
  try {
    await dependencies.disconnect();
  } catch (error) {
    disconnectFailed = true;
    disconnectError = error;
  }

  if (cleanupFailed || disconnectFailed) {
    if (cleanupFailed) {
      dependencies.error(JSON.stringify({
        ...operatorCommandFailureEntry(
          "expired_security_artifact_cleanup",
          cleanupError,
          timing,
          dependencies.now(),
          dependencies.monotonicNow(),
        ),
        phase: "cleanup",
      }));
    }
    if (disconnectFailed) {
      dependencies.error(JSON.stringify({
        ...operatorCommandFailureEntry(
          "expired_security_artifact_cleanup",
          disconnectError,
          timing,
          dependencies.now(),
          dependencies.monotonicNow(),
        ),
        phase: "disconnect",
      }));
    }
    return 1;
  }

  const completed = finishOperatorCommand(
    timing,
    dependencies.now(),
    dependencies.monotonicNow(),
  );
  const removedTotal = Object.values(removed!).reduce((total, count) => total + count, 0);
  dependencies.info(JSON.stringify({
    level: "info",
    event: "expired_security_artifact_cleanup_completed",
    startedAt: completed.startedAt,
    cutoffAt: cutoff.toISOString(),
    completedAt: completed.finishedAt,
    durationMs: completed.durationMs,
    removedTotal,
    removed,
  }));
  return 0;
}
