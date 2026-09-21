import type { NextConfig } from "next";

export function getSecurityHeaders(nodeEnv = process.env.NODE_ENV) {
  const developmentScriptSupport = nodeEnv === "development" ? " 'unsafe-eval'" : "";
  const developmentAnalyticsSupport = nodeEnv === "development" ? " https://va.vercel-scripts.com" : "";

  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${developmentScriptSupport}${developmentAnalyticsSupport}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; "),
    },
  ];
}

const nextConfig: NextConfig = {
  // Standalone output is for the Docker image; Vercel does its own output tracing
  // and Next 16.3 standalone builds break Vercel's onBuildComplete nft step.
  output: process.env.VERCEL ? undefined : "standalone",
  // Next 16's Node 26 typecheck handoff is not parseable in the local runtime.
  // The Cloudflare script runs `tsc --noEmit` first, then skips only Next's
  // duplicate handoff. CI and the normal build keep the strict Next check.
  typescript: {
    ignoreBuildErrors: process.env.CLOUDFLARE_BUILD === "1",
  },
  experimental: {
    // Next's CLI handoff produces empty --showConfig output with TypeScript 5.9.
    useTypeScriptCli: false,
  },
  poweredByHeader: false,
  turbopack: {
    root: process.cwd()
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(),
      },
    ];
  }
};

export default nextConfig;
