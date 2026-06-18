import type { NextConfig } from "next";

const isVercelWebBuild =
  process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET === "vercel" ||
  process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE === "vercel-web";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  experimental: {
    serverComponentsHmrCache: false,
  },
  serverExternalPackages: isVercelWebBuild ? [] : ["better-sqlite3"],
};

export default nextConfig;
