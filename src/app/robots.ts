import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

// Public, indexable surfaces are the landing page, guest practice, the legal
// pages, and account entry points. Personal and operator areas stay out.
export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/practice", "/terms", "/privacy-policy", "/login", "/register"],
      disallow: ["/api/", "/studio", "/profile", "/privacy", "/progress", "/review", "/consent", "/change-email", "/reset-password", "/verify-email", "/forgot-password", "/offline", "/unsubscribe"],
    }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
