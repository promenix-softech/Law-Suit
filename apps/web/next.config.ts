import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Pages, route handlers and actions get theirs from `src/proxy.ts`, with
 * a fresh nonce for every request (`src/lib/csp.ts`). The proxy does not run for static files
 * (`config.matcher` there), so those get this fixed policy: if one of them is opened as a page —
 * an SVG, say — nothing in it may load or run.
 */
const STATIC_CSP = { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" };
const STATIC_FILES = [
  "/_next/static/:path*",
  "/_next/image",
  "/favicon.ico",
  "/:all*(\\.png|\\.jpg|\\.jpeg|\\.svg|\\.ico|\\.webp|\\.woff|\\.woff2)",
];

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@civil-suits/domain", "@civil-suits/templates"],
  experimental: {
    // Explicit request-body caps (OOM guard). Server actions only carry form fields; files go
    // straight to Supabase Storage, so 1 MB is ample.
    serverActions: { bodySizeLimit: "1mb" },
    proxyClientMaxBodySize: "1mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...STATIC_FILES.map((source) => ({ source, headers: [STATIC_CSP] })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
