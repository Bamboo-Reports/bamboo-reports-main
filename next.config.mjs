/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  // PostHog reverse proxy (see lib/analytics/client.ts). PostHog API paths use trailing slashes.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ]
  },
  logging: {
    browserToTerminal: true,
  },
  images: {
    minimumCacheTTL: 7776000, // cache for 90 days
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.brandfetch.io",
      },
    ],
  },
}

export default nextConfig
