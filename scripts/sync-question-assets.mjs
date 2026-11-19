import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Copies public/question-assets to an Azure Blob Storage container with the
// Azure CLI, preserving paths, so QUESTION_ASSET_ORIGIN can serve them.
// Usage: AZURE_STORAGE_ACCOUNT=... ASSET_CONTAINER=content npm run assets:sync -- [--dry-run]
// Authenticate first with `az login` (the command uses --auth-mode login).

export function syncArguments({ account, container, source, dryRun }) {
  if (!/^[a-z0-9]{3,24}$/.test(account ?? "")) throw new Error("AZURE_STORAGE_ACCOUNT must be a 3-24 character lowercase storage account name.");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(container ?? "")) throw new Error("ASSET_CONTAINER must be a valid blob container name.");
  return [
    "storage", "blob", "upload-batch",
    "--account-name", account,
    "--auth-mode", "login",
    "--destination", container,
    "--destination-path", "question-assets",
    "--source", source,
    "--pattern", "*.*",
    // Uploads skip blobs that already exist, so reruns only add new files.
    "--overwrite", "false",
    "--content-cache-control", "public, max-age=86400",
    ...(dryRun ? ["--dryrun"] : []),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = syncArguments({
    account: process.env.AZURE_STORAGE_ACCOUNT,
    container: process.env.ASSET_CONTAINER,
    source: path.resolve(process.cwd(), "public", "question-assets"),
    dryRun: process.argv.includes("--dry-run"),
  });
  const result = spawnSync("az", args, { stdio: "inherit" });
  if (result.error) {
    console.error("The Azure CLI (az) is required: https://learn.microsoft.com/cli/azure/install-azure-cli");
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
