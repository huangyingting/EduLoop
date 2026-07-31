import type { AdapterAccount } from "next-auth/adapters";
import { describe, expect, it, vi } from "vitest";
import { credentialMinimizingAdapter, providerAccountIdentity } from "./auth-adapter";

const providerAccount: AdapterAccount = {
  userId: "user-1",
  type: "oidc",
  provider: "example",
  providerAccountId: "provider-user-1",
  access_token: "access-secret",
  refresh_token: "refresh-secret",
  id_token: "identity-secret",
  session_state: "provider-session-secret",
  expires_at: 1_800_000_000,
  token_type: "bearer",
  scope: "openid email profile",
};

describe("Auth.js provider credential minimization", () => {
  it("retains only the stable account-link identity", () => {
    expect(providerAccountIdentity(providerAccount)).toEqual({
      userId: "user-1",
      type: "oidc",
      provider: "example",
      providerAccountId: "provider-user-1",
    });
    expect(providerAccount.access_token).toBe("access-secret");
  });

  it("scrubs OAuth response credentials before the base adapter persists an account", async () => {
    const linkAccount = vi.fn(async (account: AdapterAccount) => account);
    const adapter = credentialMinimizingAdapter({ linkAccount });

    await expect(adapter.linkAccount?.(providerAccount)).resolves.toEqual({
      userId: "user-1",
      type: "oidc",
      provider: "example",
      providerAccountId: "provider-user-1",
    });
    expect(linkAccount).toHaveBeenCalledOnce();
  });

  it("rejects a base adapter that cannot link accounts", () => {
    expect(() => credentialMinimizingAdapter({})).toThrow(
      "Auth adapter must implement linkAccount.",
    );
  });
});
