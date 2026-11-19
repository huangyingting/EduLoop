import { zhCN } from "@/i18n/messages/zh-CN";

const DEVELOPMENT_ORIGIN = "http://localhost:3000";

// The canonical public origin for metadata, robots, and the sitemap. AUTH_URL
// is already validated as the public HTTPS origin in production.
export function publicOrigin(environment: { AUTH_URL?: string } = { AUTH_URL: process.env.AUTH_URL }) {
  try {
    return new URL(environment.AUTH_URL ?? DEVELOPMENT_ORIGIN).origin;
  } catch {
    return DEVELOPMENT_ORIGIN;
  }
}

export const SITE_NAME = "EduLoop";
// Install and share surfaces (manifest, Open Graph image) use the default locale.
export const SITE_DESCRIPTION = zhCN.meta.description;
