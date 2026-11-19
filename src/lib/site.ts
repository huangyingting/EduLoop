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
export const SITE_DESCRIPTION = "面向中小学生的个性化学科练习平台。用小步练习、即时反馈和成长奖励，把知识练成能力。";
