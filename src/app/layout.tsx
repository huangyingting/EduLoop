import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { I18nProvider } from "@/i18n/client";
import { catalogs } from "@/i18n/messages";
import { getLocale, getTranslator } from "@/i18n/server";
import { SITE_NAME, publicOrigin } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getTranslator();
  const title = t("meta.title");
  const description = t("meta.description");
  return {
    metadataBase: new URL(publicOrigin()),
    title: { default: title, template: "%s · EduLoop" },
    description,
    applicationName: SITE_NAME,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: locale === "en" ? "en_US" : "zh_CN",
      title,
      description,
      url: "/",
    },
    appleWebApp: { capable: true, title: "EduLoop", statusBarStyle: "default" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = catalogs[locale];
  return <html lang={locale} data-scroll-behavior="smooth"><body><I18nProvider locale={locale} messages={messages}><AuthSessionProvider><a href="#main-content" className="skip-link">{messages.meta.skipToContent}</a><AppShell>{children}</AppShell></AuthSessionProvider></I18nProvider><ServiceWorkerRegistration /></body></html>;
}
