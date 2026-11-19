import type { Metadata } from "next";
import { GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { AccountControls } from "@/components/account-controls";
import { FamilyManager } from "@/components/family-manager";
import { LearnerProfileForm } from "@/components/learner-profile-form";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("profile.metaTitle") };
}

export default async function ProfilePage() {
  const { t } = await getTranslator();
  return <div className="mx-auto max-w-[960px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
    <header className="rounded-[30px] border-2 border-ink bg-lime p-6 shadow-[0_7px_0_#242136] sm:p-8">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><Sparkles size={17} /> Learner profile</div>
      <div className="mt-3 flex items-center gap-3"><GraduationCap size={34} /><h1 className="font-display text-3xl font-black tracking-[-.04em] sm:text-4xl">{t("profile.title")}</h1></div>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-ink/70">{t("profile.lead")}</p>
    </header>
    <LearnerProfileForm />
    <NotificationPreferencesForm />
    <FamilyManager />
    <AccountControls />
    <div className="mt-7 flex justify-center">
      <Link href="/privacy" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-black text-violet hover:bg-white"><ShieldCheck size={17} /> {t("profile.privacyLink")}</Link>
    </div>
  </div>;
}
