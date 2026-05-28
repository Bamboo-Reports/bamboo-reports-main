/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  logging: {
    browserToTerminal: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.logo.dev",
      },
    ],
  },
}

export default nextConfig
