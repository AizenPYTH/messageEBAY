import { getSupabaseClient } from "../client.js";
import type { AppProfileRow } from "../types.js";

const TABLE = "app_profiles";

export async function upsertAppProfile(input: {
  id: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<AppProfileRow> {
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
    throw new Error(`upsertAppProfile failed: ${error?.message ?? "unknown"}`);
  }

  return data as AppProfileRow;
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
