import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "lh3.googleusercontent.com",
        protocol: "https",
      },
    ],
  },
  reactCompiler: true,
  transpilePackages: ["@papyrus/core"],
};

export default nextConfig;
