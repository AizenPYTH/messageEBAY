import { getSupabaseClient } from "../client.js";
import type {
  UpsertUserConnectionInput,
  UserConnectionRow,
} from "../types.js";

const TABLE = "user_connections";

export async function getUserConnection(
  userId: string,
  provider: string,
): Promise<UserConnectionRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserConnection failed: ${error.message}`);
  }

  return (data as UserConnectionRow | null) ?? null;
}

export async function upsertUserConnection(
  input: UpsertUserConnectionInput,
): Promise<UserConnectionRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        provider_user_id: input.providerUserId ?? null,
        provider_username: input.providerUsername ?? null,
        access_token_enc: input.accessTokenEnc,
        refresh_token_enc: input.refreshTokenEnc ?? null,
        expires_at: input.expiresAt ?? null,
        scopes: input.scopes ?? null,
        last_tested_at: input.lastTestedAt ?? null,
        last_sync_at: input.lastSyncAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`upsertUserConnection failed: ${error?.message ?? "unknown"}`);
  }

  return data as UserConnectionRow;
}

export async function deleteUserConnection(
  userId: string,
  provider: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) {
    throw new Error(`deleteUserConnection failed: ${error.message}`);
  }
}

export async function touchUserConnection(
  userId: string,
  provider: string,
  patch: {
    lastTestedAt?: string | null;
    lastSyncAt?: string | null;
    accessTokenEnc?: string;
    refreshTokenEnc?: string | null;
    expiresAt?: string | null;
  },
): Promise<UserConnectionRow> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.lastTestedAt !== undefined) payload.last_tested_at = patch.lastTestedAt;
  if (patch.lastSyncAt !== undefined) payload.last_sync_at = patch.lastSyncAt;
  if (patch.accessTokenEnc !== undefined) {
    payload.access_token_enc = patch.accessTokenEnc;
  }
  if (patch.refreshTokenEnc !== undefined) {
    payload.refresh_token_enc = patch.refreshTokenEnc;
  }
  if (patch.expiresAt !== undefined) payload.expires_at = patch.expiresAt;

  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .update(payload)
    .eq("user_id", userId)
    .eq("provider", provider)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`touchUserConnection failed: ${error?.message ?? "unknown"}`);
  }

  return data as UserConnectionRow;
}
