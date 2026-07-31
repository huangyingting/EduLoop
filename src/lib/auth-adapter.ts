import type { Adapter, AdapterAccount } from "next-auth/adapters";

export function providerAccountIdentity(account: AdapterAccount): AdapterAccount {
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
}

export function credentialMinimizingAdapter(adapter: Adapter): Adapter {
  const linkAccount = adapter.linkAccount;
  if (!linkAccount) throw new TypeError("Auth adapter must implement linkAccount.");

  return {
    ...adapter,
    linkAccount(account) {
      return linkAccount(providerAccountIdentity(account));
    },
  };
}
