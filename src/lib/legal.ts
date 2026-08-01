export const TERMS_VERSION = "2026-07-31";
export const PRIVACY_VERSION = "2026-08-01";
export const CONSENT_BASES = ["ADULT", "GUARDIAN"] as const;
export type ConsentBasis = typeof CONSENT_BASES[number];

type ConsentState = {
  termsAcceptedAt: Date | null;
  termsVersion: string | null;
  privacyAcceptedAt: Date | null;
  privacyVersion: string | null;
  consentBasis: string | null;
};

export function hasCurrentLegalConsent(state: ConsentState) {
  return Boolean(
    state.termsAcceptedAt
    && state.termsVersion === TERMS_VERSION
    && state.privacyAcceptedAt
    && state.privacyVersion === PRIVACY_VERSION
    && CONSENT_BASES.includes(state.consentBasis as ConsentBasis),
  );
}

export function publicLegalConfiguration(environment: Record<string, string | undefined> = process.env) {
  return {
    entityName: environment.LEGAL_ENTITY_NAME?.trim() || "EduLoop 本地开发运营方",
    contactEmail: environment.LEGAL_CONTACT_EMAIL?.trim() || "privacy@example.invalid",
    jurisdiction: environment.LEGAL_JURISDICTION?.trim() || "部署所在地适用法律",
  };
}
