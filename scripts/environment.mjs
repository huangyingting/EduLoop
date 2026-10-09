const PROVIDERS = new Set(["sqlite", "postgresql"]);
const SECURE_POSTGRES_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const SAFE_APP_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRODUCTION_APP_VERSION_PLACEHOLDERS = new Set(["development", "unknown", "unavailable"]);
const AUTH_SECRET_MIN_LENGTH = 43;
const AUTH_SECRET_MAX_LENGTH = 512;
const AUTH_SECRET_MIN_DISTINCT_CHARACTERS = 16;
const AUTH_SECRET_PLACEHOLDER = /(?:change[-_ ]?me|replace[-_ ]?with|placeholder|secret[-_ ]?with[-_ ]?at[-_ ]?least|ci[-_ ]?only|development[-_ ]?secret)/i;
const PRODUCTION_POSTGRES_PARAMETERS = [
  ["connection_limit", 1, 100],
  ["pool_timeout", 1, 30],
  ["connect_timeout", 1, 30],
];
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

function parsePostgresqlUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    if (
      !["postgresql:", "postgres:"].includes(parsed.protocol)
      || !parsed.hostname
      || parsed.pathname.length <= 1
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function emailAddress(value) {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^<>]+)>$/)?.[1];
  return bracketed ?? trimmed;
}

function validProductionAuthSecret(value) {
  if (
    !value
    || value.length < AUTH_SECRET_MIN_LENGTH
    || value.length > AUTH_SECRET_MAX_LENGTH
    || /\s/.test(value)
    || AUTH_SECRET_PLACEHOLDER.test(value)
  ) return false;
  return new Set(value).size >= AUTH_SECRET_MIN_DISTINCT_CHARACTERS;
}

export function validateEnvironment(environment) {
  const errors = [];
  const warnings = [];
  const privateDeployment = environment.EDULOOP_PRIVATE_DEPLOYMENT === "true";
  if (
    environment.EDULOOP_PRIVATE_DEPLOYMENT !== undefined
    && !["true", "false"].includes(environment.EDULOOP_PRIVATE_DEPLOYMENT)
  ) {
    errors.push("EDULOOP_PRIVATE_DEPLOYMENT must be true or false.");
  }
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  const configuredProvider = environment.EDULOOP_DATABASE_PROVIDER?.trim().toLowerCase() ?? "";
  const detectedProvider = databaseProvider(databaseUrl);

  if (!databaseUrl) errors.push("DATABASE_URL is required.");
  else if (!detectedProvider) errors.push("DATABASE_URL must use file:, postgresql:, or postgres:.");

  const parsedPostgresqlUrl = detectedProvider === "postgresql"
    ? parsePostgresqlUrl(databaseUrl)
    : null;
  if (detectedProvider === "postgresql" && !parsedPostgresqlUrl) {
    errors.push("DATABASE_URL must be a valid PostgreSQL URL with a host and database name.");
  }

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
    if (parsedPostgresqlUrl) {
      for (const [parameter, minimum, maximum] of PRODUCTION_POSTGRES_PARAMETERS) {
        const values = parsedPostgresqlUrl.searchParams.getAll(parameter);
        if (values.length !== 1) {
          errors.push(`Production PostgreSQL DATABASE_URL requires exactly one ${parameter} parameter.`);
          continue;
        }
        const value = values[0];
        const numericValue = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
          errors.push(`Production PostgreSQL ${parameter} must be an integer from ${minimum} through ${maximum}.`);
        }
      }
    }
    if (parsedPostgresqlUrl && !isLoopbackHostname(parsedPostgresqlUrl.hostname)) {
      const sslModes = parsedPostgresqlUrl.searchParams.getAll("sslmode")
        .map((value) => value.toLowerCase());
      if (sslModes.length !== 1 || !SECURE_POSTGRES_SSL_MODES.has(sslModes[0])) {
        errors.push("Remote production PostgreSQL requires sslmode=require, verify-ca, or verify-full.");
      }
      const sslAcceptModes = parsedPostgresqlUrl.searchParams.getAll("sslaccept")
        .map((value) => value.toLowerCase());
      if (sslAcceptModes.length > 1 || (sslAcceptModes[0] && sslAcceptModes[0] !== "strict")) {
        errors.push("Remote production PostgreSQL must not disable TLS certificate validation.");
      }
    }
    const appVersion = environment.APP_VERSION?.trim() ?? "";
    if (!appVersion) {
      errors.push("APP_VERSION is required in production.");
    } else if (
      !SAFE_APP_VERSION.test(appVersion)
      || PRODUCTION_APP_VERSION_PLACEHOLDERS.has(appVersion.toLowerCase())
    ) {
      errors.push("APP_VERSION must be a non-placeholder release identifier of 1 through 128 letters, numbers, dots, underscores, or hyphens.");
    }
    if (!validProductionAuthSecret(environment.AUTH_SECRET)) {
      errors.push("AUTH_SECRET must be a generated value of 43 through 512 non-whitespace characters with at least 16 distinct characters; common placeholders are rejected.");
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
    if (!privateDeployment && (!environment.RESEND_API_KEY?.trim() || !environment.AUTH_EMAIL_FROM?.trim())) {
      errors.push("Production account email requires RESEND_API_KEY and AUTH_EMAIL_FROM.");
    }
    if (!privateDeployment && (!environment.LEGAL_ENTITY_NAME?.trim() || !environment.LEGAL_CONTACT_EMAIL?.trim() || !environment.LEGAL_JURISDICTION?.trim())) {
      errors.push("Production legal pages require LEGAL_ENTITY_NAME, LEGAL_CONTACT_EMAIL, and LEGAL_JURISDICTION.");
    }
  } else if (
    environment.APP_VERSION !== undefined
    && !SAFE_APP_VERSION.test(environment.APP_VERSION.trim())
  ) {
    errors.push("APP_VERSION must be a non-placeholder release identifier of 1 through 128 letters, numbers, dots, underscores, or hyphens.");
  }

  const hasResendKey = Boolean(environment.RESEND_API_KEY?.trim());
  const hasEmailFrom = Boolean(environment.AUTH_EMAIL_FROM?.trim());
  if (environment.NODE_ENV !== "production" && hasResendKey !== hasEmailFrom) {
    errors.push("Account email requires both RESEND_API_KEY and AUTH_EMAIL_FROM.");
  }
  if (hasEmailFrom && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress(environment.AUTH_EMAIL_FROM))) {
    errors.push("AUTH_EMAIL_FROM must contain a valid email address.");
  }
  if (environment.LEGAL_CONTACT_EMAIL?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(environment.LEGAL_CONTACT_EMAIL.trim())) {
    errors.push("LEGAL_CONTACT_EMAIL must be a valid email address.");
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

  if (environment.TRUSTED_PROXY_HOPS !== undefined) {
    const hops = Number(environment.TRUSTED_PROXY_HOPS);
    if (!/^\d+$/.test(environment.TRUSTED_PROXY_HOPS) || !Number.isInteger(hops) || hops < 1 || hops > 10) {
      errors.push("TRUSTED_PROXY_HOPS must be an integer from 1 through 10.");
    }
  }

  return { errors, warnings, provider: configuredProvider || detectedProvider };
}
