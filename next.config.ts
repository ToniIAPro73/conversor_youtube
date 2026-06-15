import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsHmrCache: false,
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
