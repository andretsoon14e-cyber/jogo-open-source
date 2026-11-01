import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Arena previews and local browser tests, without opening all origins.
  allowedDevOrigins: ["*.e2b.app", "127.0.0.1"],
};

export default nextConfig;
