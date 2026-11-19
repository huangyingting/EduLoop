import type { Metadata } from "next";
import { Database, EyeOff, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("privacy.metaTitle") };
}

const privacyCards = [
  { icon: Database, title: "privacy.storedTitle", copy: "privacy.storedBody" },
  { icon: EyeOff, title: "privacy.neverTitle", copy: "privacy.neverBody" },
  { icon: Trash2, title: "privacy.controlTitle", copy: "privacy.controlBody" },
] as const;

export default async function PrivacyPage() {
  const { locale, t } = await getTranslator();
  return (
    <div className="mx-auto max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <header className="rounded-[32px] border-2 border-ink bg-lime p-7 shadow-[0_8px_0_#242136] sm:p-10">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><ShieldCheck size={18} /> Privacy by design</div>
        <h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">{t("privacy.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-ink/70">{t("privacy.lead")}</p>
      </header>
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        {privacyCards.map(({ icon: Icon, title, copy }) => <article key={title} className="rounded-[24px] border-2 border-ink/10 bg-white p-5"><Icon className="text-violet" size={25} /><h2 className="mt-4 font-black">{t(title)}</h2><p className="mt-2 text-sm font-semibold leading-6 text-muted">{t(copy)}</p></article>)}
      </section>
      <section className="mt-7 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
        <h2 className="font-display text-2xl font-black">{t("privacy.noticeTitle")}</h2>
        <div className="mt-4 space-y-3 text-sm font-semibold leading-7 text-muted">
          <p>{t("privacy.guestNotice")}</p>
          <p>{t("privacy.accountNotice")}</p>
          <p>{t("privacy.schoolNotice")}</p>
          <p>{t("privacy.adultsPrefix")} <Link href="/privacy-policy" className="font-black text-violet underline">{t("shell.privacyPolicy")}</Link> {t("auth.acceptAnd")} <Link href="/terms" className="font-black text-violet underline">{t("shell.terms")}</Link>{t("privacy.adultsSuffix")}{locale === "zh-CN" ? null : <> {t("privacy.legalNote")}</>}</p>
        </div>
      </section>
      <PrivacyControls />
    </div>
  );
}
