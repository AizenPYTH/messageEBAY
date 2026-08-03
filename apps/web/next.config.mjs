import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const coreSrc = path.resolve(repoRoot, "src");

// Share repo-root `.env` with Next (incl. NEXT_PUBLIC_* for middleware/browser).
loadDotenv({ path: path.resolve(repoRoot, ".env"), quiet: true });
loadDotenv({ path: path.resolve(__dirname, ".env.local"), override: true, quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: include repo-root `src/` in serverless traces (Vercel)
  outputFileTracingRoot: repoRoot,
  // Allow importing engine sources from repo-root `src/`
  experimental: {
    externalDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["openai", "@supabase/supabase-js"],
  // Webpack (used by `next build` and `next dev` without --turbopack)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@ebay-ai/core": coreSrc,
    };
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    // Ensure monorepo root modules resolve (openai, etc. hoisted)
    config.resolve.modules = [
      path.resolve(repoRoot, "node_modules"),
      ...(config.resolve.modules ?? ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;
