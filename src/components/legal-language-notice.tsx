import { getTranslator } from "@/i18n/server";

// Legal texts are authoritative only in Simplified Chinese; other interface
// languages say so instead of showing an unreviewed translation.
export async function LegalLanguageNotice() {
  const { locale, t } = await getTranslator();
  if (locale === "zh-CN") return null;
  return <p role="note" lang={locale} className="mb-4 rounded-xl border-2 border-violet/20 bg-[#f0edff] px-4 py-3 text-sm font-bold text-violet">{t("privacy.legalNote")}</p>;
}
