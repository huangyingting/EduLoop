export const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRODUCTION_RELEASE_PLACEHOLDERS = new Set([
  "development",
  "unknown",
  "unavailable",
]);

type ReleaseEnvironment = {
  APP_VERSION?: string;
  NODE_ENV?: string;
  npm_package_version?: string;
};

function safeRelease(value: string | undefined) {
  const release = value?.trim() ?? "";
  return RELEASE_ID_PATTERN.test(release) ? release : null;
}

export function applicationRelease(
  environment: ReleaseEnvironment = process.env,
) {
  const configured = safeRelease(environment.APP_VERSION);
  if (
    configured
    && (
      environment.NODE_ENV !== "production"
      || !PRODUCTION_RELEASE_PLACEHOLDERS.has(configured.toLowerCase())
    )
  ) return configured;
  if (environment.NODE_ENV === "production") return null;
  return safeRelease(environment.npm_package_version) ?? "development";
}
