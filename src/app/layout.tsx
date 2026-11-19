import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { SITE_DESCRIPTION, SITE_NAME, publicOrigin } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(publicOrigin()),
  title: { default: "EduLoop · 每一题都有回响", template: "%s · EduLoop" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "zh_CN",
    title: "EduLoop · 每一题都有回响",
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "EduLoop · 每一题都有回响", description: SITE_DESCRIPTION },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" data-scroll-behavior="smooth"><body><AuthSessionProvider><a href="#main-content" className="skip-link">跳到主要内容</a><AppShell>{children}</AppShell></AuthSessionProvider></body></html>;
}
