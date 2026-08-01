export const AUTH_SECRET_MIN_LENGTH = 43;
export const AUTH_SECRET_MAX_LENGTH = 512;
export const AUTH_SECRET_MIN_DISTINCT_CHARACTERS = 16;

const DEVELOPMENT_AUTH_SECRET = "eduloop-development-secret-change-before-production";
const AUTH_SECRET_PLACEHOLDER = /(?:change[-_ ]?me|replace[-_ ]?with|placeholder|secret[-_ ]?with[-_ ]?at[-_ ]?least|ci[-_ ]?only|development[-_ ]?secret)/i;

type AuthSecretEnvironment = {
  AUTH_SECRET?: string;
  NODE_ENV?: string;
};

export function isValidProductionAuthSecret(value: string | undefined) {
  if (
    !value
    || value.length < AUTH_SECRET_MIN_LENGTH
    || value.length > AUTH_SECRET_MAX_LENGTH
    || /\s/.test(value)
    || AUTH_SECRET_PLACEHOLDER.test(value)
  ) return false;
  return new Set(value).size >= AUTH_SECRET_MIN_DISTINCT_CHARACTERS;
}

export function applicationAuthSecret(
  environment: AuthSecretEnvironment = process.env,
) {
  if (environment.NODE_ENV === "production") {
    return isValidProductionAuthSecret(environment.AUTH_SECRET)
      ? environment.AUTH_SECRET!
      : null;
  }
  return environment.AUTH_SECRET || DEVELOPMENT_AUTH_SECRET;
}
