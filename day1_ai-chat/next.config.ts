import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@lancedb/lancedb', 'apache-arrow', 'pdf-parse'],
};

export default nextConfig;
