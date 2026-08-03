import { config as loadDotenv } from "dotenv";
import path from "node:path";

let loaded = false;

/** Load repo-root `.env` once (local CLI + Next share the same secrets). */
export function ensureServerEnv(): void {
  if (loaded) return;
  loaded = true;

  // apps/web → repo root
  const rootEnv = path.resolve(process.cwd(), "../../.env");
  const localEnv = path.resolve(process.cwd(), ".env.local");
  loadDotenv({ path: rootEnv, quiet: true });
  loadDotenv({ path: localEnv, override: true, quiet: true });
  // Also allow cwd=.env when Next runs from repo root via workspace script
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
}

export function hasEnv(name: string): boolean {
  ensureServerEnv();
  return Boolean(process.env[name]?.trim());
}
