import {
  isLaunchEvidenceError,
  runLaunchEvidenceVerification,
} from "../src/lib/launch-evidence";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const commandTiming = startOperatorCommand();

async function main() {
  return runLaunchEvidenceVerification({
    filePath: process.argv[2],
    confirmation: process.env.LAUNCH_EVIDENCE_CONFIRM_REVIEW,
    expectedRelease: process.env.LAUNCH_EXPECT_VERSION,
    expectedOrigin: process.env.LAUNCH_EXPECT_ORIGIN,
    expectedProviders: process.env.LAUNCH_EXPECT_OAUTH_PROVIDERS,
  });
}

void main()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "launch_evidence_verification_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry(
      "launch_evidence_verification",
      error,
      commandTiming,
    );
    console.error(JSON.stringify({
      ...entry,
      ...(isLaunchEvidenceError(error)
        ? {
            phase: error.phase,
            ...(error.gate ? { gate: error.gate } : {}),
            ...(error.provider ? { provider: error.provider } : {}),
          }
        : {}),
    }));
    process.exitCode = 1;
  });
