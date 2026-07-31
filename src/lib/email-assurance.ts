import { normalizeEmail } from "./auth-validation";

type ProviderProfile = Record<string, unknown> | null | undefined;

export function googleProfileHasVerifiedEmail(profile: ProviderProfile) {
  return profile?.email_verified === true;
}

export function providerProfileVerifiesEmail(
  provider: string | null | undefined,
  profile: ProviderProfile,
  accountEmail: string | null | undefined,
) {
  if (provider !== "google" || !googleProfileHasVerifiedEmail(profile)) return false;
  if (typeof profile?.email !== "string" || typeof accountEmail !== "string") return false;
  return normalizeEmail(profile.email) === normalizeEmail(accountEmail);
}
