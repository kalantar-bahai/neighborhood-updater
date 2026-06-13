import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    turbopack: {
      root: __dirname,
    },
  },
};

export default nextConfig;
