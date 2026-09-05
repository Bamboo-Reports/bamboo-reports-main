/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
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
