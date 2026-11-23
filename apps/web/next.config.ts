import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@seiton/shared", "@seiton/worker"],
  serverExternalPackages: ["better-sqlite3", "playwright"],
};

export default nextConfig;
