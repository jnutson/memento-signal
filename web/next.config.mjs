const apiOrigin = process.env.MEMENTO_API_ORIGIN ?? "http://127.0.0.1:8000";

const protectedMode = process.env.MEMENTO_SERVING_MODE === "cloudflare";
const basePath = process.env.MEMENTO_CUSTOMER_PATH ?? "";
if (basePath && !/^\/[a-z0-9][a-z0-9-]{0,62}$/.test(basePath))
  throw new Error("Invalid customer URL path");
if (protectedMode) {
  const origin = new URL(apiOrigin);
  if (
    process.env.MEMENTO_DEMO_BUNDLE === "1" ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error(
      "Protected hosting requires an HTTPS API origin and forbids demo bundles",
    );
}
const enabledProxy = protectedMode || process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_MEMENTO_BASE_PATH: basePath,
    NEXT_PUBLIC_MEMENTO_CUSTOMER_MODE: protectedMode ? "1" : "0",
  },
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingIncludes:
    process.env.MEMENTO_DEMO_BUNDLE === "1" && !protectedMode
      ? { "/**": ["./.demo/original.json"] }
      : {},
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  async rewrites() {
    if (process.env.MEMENTO_DEMO_BUNDLE === "1" || !enabledProxy) return [];
    return [
      {
        source: "/api/metrics/:path*",
        destination: `${apiOrigin}/v1/metrics/:path*`,
      },
      { source: "/api/healthz", destination: `${apiOrigin}/healthz` },
      { source: "/api/signals", destination: `${apiOrigin}/v1/signals` },
      {
        source: "/api/signals/:signalId",
        destination: `${apiOrigin}/v1/signals/:signalId`,
      },
      {
        source: "/api/signals/:signalId/investigation",
        destination: `${apiOrigin}/v1/signals/:signalId/investigation`,
      },
    ];
  },
};

export default nextConfig;
