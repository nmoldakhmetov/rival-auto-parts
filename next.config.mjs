/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enables instrumentation.ts (starts the in-process 1С auto-sync scheduler).
  experimental: { instrumentationHook: true },
  // Product images come from arbitrary 1С / external hosts — allow them all.
  // (We render them via plain <img>, but keep this here if next/image is used.)
  images: {
    remotePatterns: [{ protocol: "http", hostname: "**" }, { protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
