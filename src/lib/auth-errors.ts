import { errorLogMetadata, safeLogToken } from "./logging";

export type AuthFlowContext = "sign-in" | "account-link";

function accountLinkErrorMessage(error: string) {
  if (error === "OAuthAccountNotLinked" || error === "AccountNotLinked") {
    return "该社交账号无法连接到当前账号。请确认它没有连接到其他 EduLoop 账号。";
  }
  if (error === "OAuthCallbackError") {
    return "社交账号连接已取消，或提供商暂时无法完成授权。请返回“数据与隐私”后重试。";
  }
  if (error === "AccessDenied") {
    return "社交账号连接未获授权。请返回“数据与隐私”，确认提供商授权后重试。";
  }
  if (error === "MissingCSRF") {
    return "连接请求已过期。请返回“数据与隐私”，刷新页面后重试。";
  }
  return "社交账号连接没有完成。请返回“数据与隐私”后重试。";
}

export function authErrorMessage(
  error: string | null | undefined,
  code?: string | null,
  context: AuthFlowContext = "sign-in",
) {
  if (!error) return "";
  if (context === "account-link") return accountLinkErrorMessage(error);
  if (error === "CredentialsSignin" && code === "email_not_verified") {
    return "邮箱尚未验证，请先打开验证邮件中的链接。";
  }
  if (error === "CredentialsSignin") return "邮箱或密码不正确。";
  if (error === "OAuthAccountNotLinked" || error === "AccountNotLinked") {
    return "该邮箱已有账号。请先用原方式登录，再到“数据与隐私”中连接此社交账号。";
  }
  if (error === "OAuthCallbackError") {
    return "社交登录已取消，或提供商暂时无法完成授权。请重试，或改用邮箱和密码。";
  }
  if (error === "AccessDenied") {
    return "社交登录未获授权。请确认提供商允许共享所需账号信息后重试。";
  }
  if (error === "MissingCSRF") return "登录请求已过期。请刷新页面后重试。";
  if (error === "SessionRequired") return "登录状态已过期，请重新登录。";
  if (
    error === "Configuration"
    || error === "Signin"
    || error === "OAuthSignin"
    || error === "OAuthSignInError"
    || error === "OAuthCreateAccount"
    || error === "Callback"
  ) {
    return "登录服务暂时无法完成社交登录。请稍后重试，或改用邮箱和密码。";
  }
  return "登录没有完成。请重试，或改用邮箱和密码。";
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
