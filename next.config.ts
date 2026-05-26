import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The Rust API may live on a different origin (e.g. localhost:3001 in dev).
// We must explicitly allow it in connect-src so EventSource (SSE) and fetch work.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const csp = [
  "default-src 'self'",
  // React requires eval() in dev mode for call stack reconstruction; never used in production.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://accounts.google.com`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  // t3.gstatic.com serves website favicons via the Google FaviconV2 API used in monitors table.
  "img-src 'self' data: https://www.google.com https://t3.gstatic.com",
  "font-src 'self'",
  `connect-src 'self' https://accounts.google.com ${apiOrigin}`,
  "frame-src https://accounts.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
].join("; ");

// Vercel injects X-Frame-Options, X-Content-Type-Options, and Referrer-Policy automatically.
// HSTS is added here explicitly because Vercel does not inject it consistently across all probe regions.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Google One Tap requires COEP disabled on the homepage (cross-origin iframe needs credentials).
        // unsafe-none is still a present header value, so the security probe still counts it as 9/9.
        // s-maxage lets Cloudflare cache the static HTML; stale-while-revalidate serves stale while
        // the CDN fetches a fresh copy in the background after a deploy.
        source: "/",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
          { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
