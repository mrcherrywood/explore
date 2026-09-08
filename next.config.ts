import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

function localIpv4Hosts(): string[] {
  const hosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) hosts.add(addr.address);
    }
  }
  return [...hosts];
}

const localHosts = localIpv4Hosts();
const localActionOrigins = localHosts.flatMap((host) => [
  `${host}:3000`,
  `${host}:3001`,
]);

const nextConfig: NextConfig = {
  allowedDevOrigins: localHosts,
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingIncludes: {
    "/api/analysis/percentile-analysis": [
      "./scripts/percentile-analysis/.generated-json/**",
      "./scripts/percentile-analysis/.generated-workbooks/**",
      "./scripts/percentile-analysis/data/**",
      "./data/**",
    ],
    "/api/analysis/band-movement": ["./data/**"],
    "/api/analysis/clover-impact": ["./data/**"],
    "/api/admin/plan-preview/predictions": ["./data/**"],
    "/api/admin/plan-preview/report": ["./data/**"],
    "/api/admin/plan-preview/results-report": ["./data/**"],
    "/api/admin/plan-preview/overview": ["./data/**"],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [...localActionOrigins, "127.0.0.1:51430"],
    },
  },
};

export default nextConfig;
