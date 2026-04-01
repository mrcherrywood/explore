import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/api/analysis/percentile-analysis": [
      "./scripts/percentile-analysis/.generated-json/**",
      "./scripts/percentile-analysis/.generated-workbooks/**",
      "./scripts/percentile-analysis/data/**",
      "./data/**",
    ],
    "/api/analysis/band-movement": ["./data/**"],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "127.0.0.1:3000", "127.0.0.1:51430"],
    },
  },
};

export default nextConfig;
