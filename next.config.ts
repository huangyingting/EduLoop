import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/.prisma/client/query_compiler_bg.wasm",
      "./node_modules/.prisma/client/query_engine_bg.wasm",
    ],
  },
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
