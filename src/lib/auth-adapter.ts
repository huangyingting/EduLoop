import type { Adapter, AdapterAccount } from "next-auth/adapters";

type CredentialMinimizingAdapterOptions = {
  linkAccount?: NonNullable<Adapter["linkAccount"]>;
};

export function providerAccountIdentity(account: AdapterAccount): AdapterAccount {
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
}

export function credentialMinimizingAdapter(
  adapter: Adapter,
  options: CredentialMinimizingAdapterOptions = {},
): Adapter {
  const baseLinkAccount = adapter.linkAccount;
  if (!baseLinkAccount) throw new TypeError("Auth adapter must implement linkAccount.");
  const linkAccount = options.linkAccount ?? baseLinkAccount;

  return {
    ...adapter,
    linkAccount(account) {
      return linkAccount(providerAccountIdentity(account));
    },
  };
}
