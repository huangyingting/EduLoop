import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "artofproblemsolving.com" },
      { protocol: "https", hostname: "latex.artofproblemsolving.com" },
      { protocol: "https", hostname: "live.poshenloh.com" },
      { protocol: "https", hostname: "wiki-images.artofproblemsolving.com" },
      { protocol: "https", hostname: "wiki.randommath.com" },
    ],
  },
  experimental: {
    typedEnv: true,
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: securityHeaders(),
    }];
  },
};

export default nextConfig;
