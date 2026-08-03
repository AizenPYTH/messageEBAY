import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

/** Quote values so characters like # ^ = are not treated as .env comments. */
function escapeEnvValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function upsertEnv(values: Record<string, string>): void {
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    content = "";
  }

  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const keys = new Set(Object.keys(values));
  const next = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!key || !keys.has(key)) return line;
    keys.delete(key);
    return `${key}=${escapeEnvValue(values[key] ?? "")}`;
  });

  for (const key of keys) {
    next.push(`${key}=${escapeEnvValue(values[key] ?? "")}`);
  }

  writeFileSync(envPath, `${next.join("\n").replace(/\n*$/, "\n")}`, "utf8");
}
