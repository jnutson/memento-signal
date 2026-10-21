const apiOrigin = process.env.MEMENTO_API_ORIGIN ?? "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
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
