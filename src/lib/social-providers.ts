export const SOCIAL_PROVIDER_IDS = ["google", "microsoft-entra-id", "facebook"] as const;

export type SocialProviderId = typeof SOCIAL_PROVIDER_IDS[number];

const SOCIAL_PROVIDER_LABELS: Record<SocialProviderId, string> = {
  google: "Google",
  "microsoft-entra-id": "Microsoft",
  facebook: "Facebook",
};

export function socialProviderLabel(provider: SocialProviderId) {
  return SOCIAL_PROVIDER_LABELS[provider];
}

export function isSocialProviderId(provider: string): provider is SocialProviderId {
  return SOCIAL_PROVIDER_IDS.some((candidate) => candidate === provider);
}
