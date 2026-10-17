import type { NextConfig } from "next";

/**
 * Two build modes:
 *
 * 1. Default (sandbox / self-hosting): standalone Node output.
 * 2. GitHub Pages (`STATIC_EXPORT=1 bun run build:pages`): fully static export.
 *    The whole app runs in the browser — reports are parsed client-side, so no
 *    server is needed. For project pages (user.github.io/repo) set
 *    NEXT_PUBLIC_BASE_PATH to "/repo-name"; the deploy workflow does this
 *    automatically.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        basePath,
        images: { unoptimized: true },
      }
    : {
        output: "standalone" as const,
        allowedDevOrigins: ["**"],
      }),
};

export default nextConfig;
