import { runExpiredSecurityArtifactCleanup } from "../src/lib/cleanup-command";

void runExpiredSecurityArtifactCleanup().then((exitCode) => {
  process.exitCode = exitCode;
});
