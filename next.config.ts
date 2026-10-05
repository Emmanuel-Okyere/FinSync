import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  experimental: {
    serverActions: {
      // Statement uploads. Vercel caps request bodies at 4.5 MB.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
