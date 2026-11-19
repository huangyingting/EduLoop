import type { Key, Translator } from "@/i18n/messages";
import { errorLogMetadata, safeLogToken } from "./logging";

export type AuthFlowContext = "sign-in" | "account-link";

function accountLinkErrorKey(error: string): Key {
  if (error === "OAuthAccountNotLinked" || error === "AccountNotLinked") return "authErrors.linkNotLinked";
  if (error === "OAuthCallbackError") return "authErrors.linkCallback";
  if (error === "AccessDenied") return "authErrors.linkAccessDenied";
  if (error === "MissingCSRF") return "authErrors.linkExpired";
  return "authErrors.linkIncomplete";
}

function signInErrorKey(error: string, code?: string | null): Key {
  if (error === "CredentialsSignin" && code === "email_not_verified") return "authErrors.emailNotVerified";
  if (error === "CredentialsSignin") return "authErrors.credentials";
  if (error === "OAuthAccountNotLinked" || error === "AccountNotLinked") return "authErrors.accountNotLinked";
  if (error === "OAuthCallbackError") return "authErrors.callback";
  if (error === "AccessDenied") return "authErrors.accessDenied";
  if (error === "MissingCSRF") return "authErrors.expired";
  if (error === "SessionRequired") return "authErrors.sessionRequired";
  if (
    error === "Configuration"
    || error === "Signin"
    || error === "OAuthSignin"
    || error === "OAuthSignInError"
    || error === "OAuthCreateAccount"
    || error === "Callback"
  ) {
    return "authErrors.providerUnavailable";
  }
  return "authErrors.incomplete";
}

export function authErrorMessage(
  t: Translator,
  error: string | null | undefined,
  code?: string | null,
  context: AuthFlowContext = "sign-in",
) {
  if (!error) return "";
  return t(context === "account-link" ? accountLinkErrorKey(error) : signInErrorKey(error, code));
}

function property(value: unknown, key: string) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

export function authErrorLogMetadata(error: unknown) {
  const authErrorType = safeLogToken(property(error, "type"));
  return {
    ...errorLogMetadata(error),
    ...(authErrorType ? { authErrorType } : {}),
  };
}
