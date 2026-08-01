import {
  isOAuthDeploymentSmokeError,
  runOAuthDeploymentSmoke,
} from "../src/lib/oauth-deployment-smoke";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const commandTiming = startOperatorCommand();

async function main() {
  return runOAuthDeploymentSmoke({
    origin: process.argv[2] ?? process.env.OAUTH_SMOKE_BASE_URL,
    expectations: process.env.OAUTH_SMOKE_EXPECT,
    confirmation: process.env.OAUTH_SMOKE_CONFIRM_INITIATE,
  });
}

void main()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "oauth_deployment_smoke_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    const entry = operatorCommandFailureEntry(
      "oauth_deployment_smoke",
      error,
      commandTiming,
    );
    console.error(JSON.stringify({
      ...entry,
      ...(isOAuthDeploymentSmokeError(error)
        ? { phase: error.phase, ...(error.provider ? { provider: error.provider } : {}) }
        : {}),
    }));
    process.exitCode = 1;
  });
