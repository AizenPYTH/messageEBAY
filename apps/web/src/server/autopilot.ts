import "server-only";
import {
  getAppProfile,
  runAutopilotForUser,
  setAutopilotEnabled,
  upsertAppProfile,
} from "@/server/core";
import { getOptionalUser } from "@/server/auth";
import { ensureServerEnv } from "@/server/env";
import { toUserError } from "@/server/errors";
import type { ActionResult } from "@/server/conversations";

export type AutopilotStatusDto = {
  enabled: boolean;
  updatedAt?: string;
  lastRunAt?: string;
  lastRunSummary?: string;
};

export async function fetchAutopilotStatus(): Promise<
  ActionResult<AutopilotStatusDto>
> {
  ensureServerEnv();
  try {
    const user = await getOptionalUser();
    if (!user) {
      return { ok: false, error: "Session introuvable." };
    }
    await upsertAppProfile({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const profile = await getAppProfile(user.id);
    return {
      ok: true,
      data: {
        enabled: Boolean(profile?.autopilot_enabled),
        updatedAt: profile?.autopilot_updated_at ?? undefined,
        lastRunAt: profile?.autopilot_last_run_at ?? undefined,
        lastRunSummary: profile?.autopilot_last_run_summary ?? undefined,
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function updateAutopilotEnabled(
  enabled: boolean,
): Promise<ActionResult<AutopilotStatusDto>> {
  ensureServerEnv();
  try {
    const user = await getOptionalUser();
    if (!user) {
      return { ok: false, error: "Session introuvable." };
    }
    await upsertAppProfile({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    const profile = await setAutopilotEnabled(user.id, enabled);
    return {
      ok: true,
      data: {
        enabled: Boolean(profile.autopilot_enabled),
        updatedAt: profile.autopilot_updated_at ?? undefined,
        lastRunAt: profile.autopilot_last_run_at ?? undefined,
        lastRunSummary: profile.autopilot_last_run_summary ?? undefined,
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}

export async function runAutopilotNow(): Promise<
  ActionResult<{ summary: string }>
> {
  ensureServerEnv();
  try {
    const user = await getOptionalUser();
    if (!user) {
      return { ok: false, error: "Session introuvable." };
    }
    const result = await runAutopilotForUser(user.id);
    const summary = `Envoyés ${result.sent} · Alertes ${result.alerted} · Ignorés ${result.skipped} · Erreurs ${result.errors}`;
    return { ok: true, data: { summary } };
  } catch (error: unknown) {
    return { ok: false, error: toUserError(error) };
  }
}
