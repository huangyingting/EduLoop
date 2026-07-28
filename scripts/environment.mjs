const PROVIDERS = new Set(["sqlite", "postgresql"]);

function databaseProvider(databaseUrl) {
  if (databaseUrl.startsWith("file:")) return "sqlite";
  if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) return "postgresql";
  return null;
}

export function validateEnvironment(environment) {
  const errors = [];
  const warnings = [];
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  const configuredProvider = environment.EDULOOP_DATABASE_PROVIDER?.trim().toLowerCase() ?? "";
  const detectedProvider = databaseProvider(databaseUrl);

  if (!databaseUrl) errors.push("DATABASE_URL is required.");
  else if (!detectedProvider) errors.push("DATABASE_URL must use file:, postgresql:, or postgres:.");

  if (configuredProvider && !PROVIDERS.has(configuredProvider)) {
    errors.push("EDULOOP_DATABASE_PROVIDER must be sqlite or postgresql.");
  } else if (configuredProvider && detectedProvider && configuredProvider !== detectedProvider) {
    errors.push(`EDULOOP_DATABASE_PROVIDER=${configuredProvider} does not match the DATABASE_URL provider ${detectedProvider}.`);
  }

  if (environment.NODE_ENV === "production") {
    if (!configuredProvider) errors.push("EDULOOP_DATABASE_PROVIDER is required in production.");
    if (configuredProvider && configuredProvider !== "postgresql") {
      errors.push("Production deployments must use EDULOOP_DATABASE_PROVIDER=postgresql.");
    }
    if (!environment.APP_VERSION?.trim()) warnings.push("APP_VERSION is not set; health and startup logs cannot identify the release.");
  }

  if (environment.PORT !== undefined && !/^[0-9]+$/.test(environment.PORT)) {
    errors.push("PORT must be an integer from 1 through 65535.");
  } else if (environment.PORT !== undefined) {
    const port = Number(environment.PORT);
    if (port < 1 || port > 65_535) errors.push("PORT must be an integer from 1 through 65535.");
  }

  return { errors, warnings, provider: configuredProvider || detectedProvider };
}
