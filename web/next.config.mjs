const apiOrigin = process.env.MEMENTO_API_ORIGIN ?? "http://127.0.0.1:8000";
const protectedMode = process.env.MEMENTO_SERVING_MODE === "cloudflare";
const basePath = process.env.MEMENTO_CUSTOMER_PATH ?? "";
if (basePath && !/^\/[a-z0-9][a-z0-9-]{0,62}$/.test(basePath)) {
  throw new Error("Customer path must be one explicit lowercase URL segment.");
}
if (protectedMode) {
  const origin = new URL(apiOrigin);
  if (process.env.MEMENTO_DEMO_BUNDLE === "1" || origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Protected hosting requires an HTTPS API origin and forbids demo bundles.");
  }
}
const enabledProxy = protectedMode || process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.MEMENTO_SECURITY_VERIFY === "1" ? ".next-security" : ".next",
  basePath,
  env: { NEXT_PUBLIC_MEMENTO_BASE_PATH: basePath },
  reactStrictMode: true,
  devIndicators: false,
  outputFileTracingIncludes: process.env.MEMENTO_DEMO_BUNDLE === "1" && !protectedMode ? { "/**": ["./.demo/demo-1.json"] } : {},
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
    ] }, { source: "/api/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
    ] }];
  },
  async rewrites() {
    if (process.env.MEMENTO_DEMO_BUNDLE === "1" || !enabledProxy) return [];
    return [
      { source: "/api/healthz", destination: `${apiOrigin}/healthz` },
      { source: "/api/attention", destination: `${apiOrigin}/v1/attention` },
      { source: "/api/attention/:predictionId", destination: `${apiOrigin}/v1/attention/:predictionId` },
      { source: "/api/signals", destination: `${apiOrigin}/v1/signals` },
      { source: "/api/signals/:signalId", destination: `${apiOrigin}/v1/signals/:signalId` },
    ];
  },
};

export default nextConfig;
