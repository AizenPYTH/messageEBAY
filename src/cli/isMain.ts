import path from "node:path";
import { fileURLToPath } from "node:url";

/** True when this module was launched directly via `tsx` / `node`. */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(fileURLToPath(importMetaUrl)) === path.resolve(entry);
  } catch {
    return false;
  }
}
