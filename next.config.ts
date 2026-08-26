import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/chat": ["./prompts/phase7a/**/*.md"],
  },
  reactStrictMode: true,
};

export default nextConfig;
