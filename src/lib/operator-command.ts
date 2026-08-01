import { errorLogMetadata } from "./logging";

export type OperatorCommandName =
  | "catalog_seed"
  | "content_report_command"
  | "database_restore_verification"
  | "expired_security_artifact_cleanup"
  | "user_role_command";

export type OperatorCommandRejectionCode =
  | "INVALID_REPORT_ARGUMENTS"
  | "INVALID_ROLE_ARGUMENTS"
  | "REPORT_NOT_FOUND"
  | "REPORT_STATE_CONFLICT"
  | "UNKNOWN_REPORT_COMMAND"
  | "USER_NOT_FOUND";

const REJECTION_MESSAGES: Record<OperatorCommandRejectionCode, string> = {
  INVALID_REPORT_ARGUMENTS:
    "Usage: npm run reports:review -- <list|show|quarantine|resolve> [report-id] [--status=OPEN|RESOLVED] [--limit=25] [--note=text]",
  INVALID_ROLE_ARGUMENTS:
    "Usage: npm run users:role -- <email> <LEARNER|CONTENT_EDITOR|ADMIN>",
  REPORT_NOT_FOUND: "Report not found.",
  REPORT_STATE_CONFLICT: "The report or question state changed; reload the report queue before retrying.",
  UNKNOWN_REPORT_COMMAND: "Unknown command. Use list, show, quarantine, or resolve.",
  USER_NOT_FOUND: "No registered user was found for the supplied email address.",
};

export type OperatorCommandTiming = {
  startedAt: Date;
  startedAtMonotonic: number;
};

export class OperatorCommandRejection extends Error {
  readonly code: OperatorCommandRejectionCode;

  constructor(code: OperatorCommandRejectionCode) {
    super(REJECTION_MESSAGES[code]);
    this.name = "OperatorCommandRejection";
    this.code = code;
  }
}

function isOperatorCommandRejection(error: unknown): error is OperatorCommandRejection {
  try {
    return error instanceof OperatorCommandRejection;
  } catch {
    return false;
  }
}

export function startOperatorCommand(
  now = () => new Date(),
  monotonicNow = () => performance.now(),
): OperatorCommandTiming {
  return {
    startedAt: now(),
    startedAtMonotonic: monotonicNow(),
  };
}

export function finishOperatorCommand(
  timing: OperatorCommandTiming,
  finishedAt = new Date(),
  finishedAtMonotonic = performance.now(),
) {
  const elapsed = finishedAtMonotonic - timing.startedAtMonotonic;
  const durationMs = Number(Math.max(0, Number.isFinite(elapsed) ? elapsed : 0).toFixed(1));
  return {
    startedAt: timing.startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
  };
}

export function operatorCommandFailureEntry(
  command: OperatorCommandName,
  error: unknown,
  timing: OperatorCommandTiming,
  failedAt = new Date(),
  failedAtMonotonic = performance.now(),
) {
  const { startedAt, finishedAt, durationMs } = finishOperatorCommand(
    timing,
    failedAt,
    failedAtMonotonic,
  );
  if (isOperatorCommandRejection(error)) {
    return {
      level: "warn",
      event: `${command}_rejected`,
      reason: error.code,
      message: error.message,
      startedAt,
      rejectedAt: finishedAt,
      durationMs,
    };
  }
  return {
    level: "error",
    event: `${command}_failed`,
    startedAt,
    failedAt: finishedAt,
    durationMs,
    ...errorLogMetadata(error),
  };
}
