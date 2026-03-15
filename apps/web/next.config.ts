import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        hostname: "lh3.googleusercontent.com",
        protocol: "https",
      },
      {
        hostname: "raw.githubusercontent.com",
        protocol: "https",
      },
    ],
  },
  reactCompiler: true,
  transpilePackages: ["@papyrus/core"],
};

export default nextConfig;
