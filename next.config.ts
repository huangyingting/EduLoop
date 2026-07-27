import type { NextConfig } from "next";

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
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https://artofproblemsolving.com https://latex.artofproblemsolving.com https://live.poshenloh.com https://wiki-images.artofproblemsolving.com https://wiki.randommath.com;" },
      ],
    }];
  },
};

export default nextConfig;
