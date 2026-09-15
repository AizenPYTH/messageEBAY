/**
 * Kill switch for the auto-reply loop.
 *
 * Both crons (GitHub Actions every 15 min + Vercel daily) hit the same
 * endpoint, so the only reliable way to stop real messages going out to real
 * buyers is a check on the send path itself. One env var stops everything,
 * without touching the workflows or redeploying a different branch.
 *
 *   AUTOPILOT_ENABLED=false   → nothing is read, nothing is sent
 *   AUTOPILOT_DRY_RUN=true    → drafts are computed and logged, never sent
 */

function flag(name: string): string {
  return (process.env[name] ?? "").trim().toLowerCase();
}

/** False when the seller has switched auto-reply off. */
export function isAutopilotEnabled(): boolean {
  const value = flag("AUTOPILOT_ENABLED");
  if (!value) return true;
  return !["0", "false", "off", "no", "non"].includes(value);
}

/** True when drafts must be computed but never delivered to the buyer. */
export function isAutopilotDryRun(): boolean {
  const value = flag("AUTOPILOT_DRY_RUN");
  if (!value) return false;
  return ["1", "true", "on", "yes", "oui"].includes(value);
}

export type AutopilotMode = "off" | "dry_run" | "live";

export function autopilotMode(): AutopilotMode {
  if (!isAutopilotEnabled()) return "off";
  if (isAutopilotDryRun()) return "dry_run";
  return "live";
}
