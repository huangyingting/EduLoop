const PROVIDERS = new Set(["sqlite", "postgresql"]);
const AUTH_PROVIDER_PAIRS = [
  ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "Google"],
  ["AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET", "Microsoft"],
  ["AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET", "Facebook"],
];

function databaseProvider(databaseUrl) {
  if (databaseUrl.startsWith("file:")) return "sqlite";
  if (databaseUrl.startsWith("postgresql:") || databaseUrl.startsWith("postgres:")) return "postgresql";
  return null;
}

function emailAddress(value) {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^<>]+)>$/)?.[1];
  return bracketed ?? trimmed;
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
    if ((environment.AUTH_SECRET?.trim().length ?? 0) < 32) {
      errors.push("AUTH_SECRET must be at least 32 characters in production.");
    }
    const authUrl = environment.AUTH_URL?.trim();
    if (!authUrl) {
      errors.push("AUTH_URL is required in production.");
    } else {
      try {
        const parsed = new URL(authUrl);
        if (parsed.protocol !== "https:" || parsed.origin !== authUrl.replace(/\/$/, "")) {
          errors.push("AUTH_URL must be a public HTTPS origin without a path, query, or fragment.");
        }
      } catch {
        errors.push("AUTH_URL must be a public HTTPS origin without a path, query, or fragment.");
      }
    }
    if (!environment.RESEND_API_KEY?.trim() || !environment.AUTH_EMAIL_FROM?.trim()) {
      errors.push("Production account email requires RESEND_API_KEY and AUTH_EMAIL_FROM.");
    }
  }

  const hasResendKey = Boolean(environment.RESEND_API_KEY?.trim());
  const hasEmailFrom = Boolean(environment.AUTH_EMAIL_FROM?.trim());
  if (environment.NODE_ENV !== "production" && hasResendKey !== hasEmailFrom) {
    errors.push("Account email requires both RESEND_API_KEY and AUTH_EMAIL_FROM.");
  }
  if (hasEmailFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress(environment.AUTH_EMAIL_FROM))) {
    errors.push("AUTH_EMAIL_FROM must contain a valid email address.");
  }

  for (const [idName, secretName, label] of AUTH_PROVIDER_PAIRS) {
    const hasId = Boolean(environment[idName]?.trim());
    const hasSecret = Boolean(environment[secretName]?.trim());
    if (hasId !== hasSecret) errors.push(`${label} social login requires both ${idName} and ${secretName}.`);
  }

  if (environment.AUTH_MICROSOFT_ENTRA_ID_ISSUER) {
    try {
      if (new URL(environment.AUTH_MICROSOFT_ENTRA_ID_ISSUER).protocol !== "https:") throw new Error("invalid");
    } catch {
      errors.push("AUTH_MICROSOFT_ENTRA_ID_ISSUER must be an HTTPS URL.");
    }
  }
  if (environment.FACEBOOK_GRAPH_API_VERSION && !/^v\d+\.\d+$/.test(environment.FACEBOOK_GRAPH_API_VERSION)) {
    errors.push("FACEBOOK_GRAPH_API_VERSION must look like v23.0.");
  }

  if (environment.PORT !== undefined && !/^[0-9]+$/.test(environment.PORT)) {
    errors.push("PORT must be an integer from 1 through 65535.");
  } else if (environment.PORT !== undefined) {
    const port = Number(environment.PORT);
    if (port < 1 || port > 65_535) errors.push("PORT must be an integer from 1 through 65535.");
  }

  return { errors, warnings, provider: configuredProvider || detectedProvider };
}
