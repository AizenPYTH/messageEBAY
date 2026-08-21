import { getSupabaseClient } from "../client.js";
import type { AppProfileRow } from "../types.js";

const TABLE = "app_profiles";

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const retryable =
        /fetch failed|ECONN|ETIMEDOUT|network|503|502|paused|INACTIVE/i.test(
          msg,
        );
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${label}: ${detail}. Si Supabase est en pause (projet free inactif), restaurez-le dans le dashboard.`,
  );
}

export async function upsertAppProfile(input: {
  id: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<AppProfileRow> {
  return withRetry("upsertAppProfile failed", async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .schema("ebay_ai")
      .from(TABLE)
      .upsert(
        {
          id: input.id,
          email: input.email ?? null,
          display_name: input.displayName ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "unknown");
    }

    return data as AppProfileRow;
  });
}

export async function getAppProfile(
  id: string,
): Promise<AppProfileRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getAppProfile failed: ${error.message}`);
  }

  return (data as AppProfileRow | null) ?? null;
}

export async function setAutopilotEnabled(
  userId: string,
  enabled: boolean,
): Promise<AppProfileRow> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .update({
      autopilot_enabled: enabled,
      autopilot_updated_at: now,
      updated_at: now,
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`setAutopilotEnabled failed: ${error?.message ?? "unknown"}`);
  }

  return data as AppProfileRow;
}

export async function listAutopilotUserIds(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("id")
    .eq("autopilot_enabled", true);

  if (error) {
    throw new Error(`listAutopilotUserIds failed: ${error.message}`);
  }

  return (data ?? []).map((row) => String((row as { id: string }).id));
}

export async function touchAutopilotRun(
  userId: string,
  summary: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .update({
      autopilot_last_run_at: now,
      autopilot_last_run_summary: summary.slice(0, 500),
      updated_at: now,
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`touchAutopilotRun failed: ${error.message}`);
  }
}
