import {
  isDeploymentCapacityProbeError,
  runDeploymentCapacityProbe,
} from "../src/lib/deployment-capacity-probe";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const commandTiming = startOperatorCommand();

async function main() {
  return runDeploymentCapacityProbe({
    origin: process.argv[2] ?? process.env.CAPACITY_PROBE_BASE_URL,
    confirmation: process.env.CAPACITY_PROBE_CONFIRM_RUN,
    expectedVersion: process.env.CAPACITY_PROBE_EXPECT_VERSION,
    journeys: process.env.CAPACITY_PROBE_JOURNEYS,
    intervalMs: process.env.CAPACITY_PROBE_INTERVAL_MS,
    concurrency: process.env.CAPACITY_PROBE_CONCURRENCY,
    timeoutMs: process.env.CAPACITY_PROBE_TIMEOUT_MS,
    maxP95Ms: process.env.CAPACITY_PROBE_MAX_P95_MS,
    maxErrorRate: process.env.CAPACITY_PROBE_MAX_ERROR_RATE,
  });
}

void main()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    const passed = result.results.passed;
    const entry = {
      level: passed ? "info" : "error",
      event: passed
        ? "deployment_capacity_probe_completed"
        : "deployment_capacity_probe_threshold_failed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    };
    if (passed) console.info(JSON.stringify(entry));
    else {
      console.error(JSON.stringify(entry));
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry(
      "deployment_capacity_probe",
      error,
      commandTiming,
    );
    console.error(JSON.stringify({
      ...entry,
      ...(isDeploymentCapacityProbeError(error)
        ? { phase: error.phase }
        : {}),
    }));
    process.exitCode = 1;
  });
