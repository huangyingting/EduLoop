import { describe, expect, it } from "vitest";
import { authErrorLogMetadata, authErrorMessage } from "./auth-errors";

describe("authentication error handling", () => {
  it("maps provider and credential failures to stable recovery messages", () => {
    expect(authErrorMessage("CredentialsSignin", "email_not_verified"))
      .toBe("邮箱尚未验证，请先打开验证邮件中的链接。");
    expect(authErrorMessage("OAuthCallbackError")).toContain("改用邮箱和密码");
    expect(authErrorMessage("Configuration")).toContain("登录服务暂时无法");
    expect(authErrorMessage("private-provider-error")).toBe("登录没有完成。请重试，或改用邮箱和密码。");
  });

  it("gives an authenticated account-link failure a route back to recovery", () => {
    expect(authErrorMessage("OAuthCallbackError", null, "account-link"))
      .toBe("社交账号连接已取消，或提供商暂时无法完成授权。请返回“数据与隐私”后重试。");
    expect(authErrorMessage("AccessDenied", null, "account-link"))
      .toContain("社交账号连接未获授权");
    expect(authErrorMessage("private-provider-error", null, "account-link"))
      .toBe("社交账号连接没有完成。请返回“数据与隐私”后重试。");
  });

  it("keeps Auth.js operational logs useful without copying messages or causes", () => {
    const error = Object.assign(
      new Error("https://provider.example/callback?code=private-code", {
        cause: new Error("provider client secret"),
      }),
      { type: "OAuthCallbackError" },
    );

    expect(authErrorLogMetadata(error)).toEqual({
      errorType: "Error",
      authErrorType: "OAuthCallbackError",
    });
    expect(JSON.stringify(authErrorLogMetadata(error))).not.toContain("private");
    expect(JSON.stringify(authErrorLogMetadata(error))).not.toContain("secret");
  });

  it("survives hostile error properties and rejects unsafe Auth.js types", () => {
    const error = new Proxy(new Error("private"), {
      get(target, property, receiver) {
        if (property === "type") throw new Error("poisoned type");
        return Reflect.get(target, property, receiver);
      },
    });
    const unsafe = Object.assign(new Error("private"), { type: "private/email@example.test" });

    expect(() => authErrorLogMetadata(error)).not.toThrow();
    expect(authErrorLogMetadata(error)).toEqual({ errorType: "Error" });
    expect(authErrorLogMetadata(unsafe)).toEqual({ errorType: "Error" });
  });
});
