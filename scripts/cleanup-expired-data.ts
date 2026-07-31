import { prisma } from "../src/lib/prisma";
import { cleanupExpiredSecurityArtifacts } from "../src/lib/retention";

async function main() {
  const cleanedAt = new Date();
  const removed = await cleanupExpiredSecurityArtifacts(cleanedAt);
  console.log(JSON.stringify({
    event: "expired_security_artifacts_cleaned",
    cleanedAt: cleanedAt.toISOString(),
    removed,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
