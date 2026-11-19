import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EduLoop · 每一题都有回响",
    short_name: "EduLoop",
    description: SITE_DESCRIPTION,
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1e9",
    theme_color: "#242136",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
