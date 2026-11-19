import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { getTranslator } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getTranslator();
  return <div className="grid min-h-screen place-items-center p-6 text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-lime"><Compass size={31} /></span><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-violet">404 · Uncharted</p><h1 className="mt-2 font-display text-3xl font-black">{t("systemPages.notFoundTitle")}</h1><p className="mt-3 text-sm font-semibold text-muted">{t("systemPages.notFoundBody")}</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white"><ArrowLeft size={17} /> {t("common.backHome")}</Link></div></div>;
}
