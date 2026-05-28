/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
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
