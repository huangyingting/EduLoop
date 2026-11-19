import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/practice`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${origin}/register`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
