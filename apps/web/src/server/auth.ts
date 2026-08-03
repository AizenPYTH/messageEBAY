import "server-only";
import { upsertAppProfile } from "@/server/core";
import { ensureServerEnv } from "@/server/env";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  email?: string;
  displayName?: string;
};

/** Soft mode: when Supabase Auth env is missing, web falls back to CLI .env token. */
export function isAuthEnforced(): boolean {
  ensureServerEnv();
  return isSupabaseAuthConfigured();
}

export async function getOptionalUser(): Promise<AppUser | null> {
  ensureServerEnv();
  if (!isAuthEnforced()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? undefined,
    displayName:
      (user.user_metadata?.display_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      undefined,
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getOptionalUser();
  if (!user) {
    throw new Error("Connexion requise");
  }
  return user;
}

export async function ensureAppProfileForUser(user: AppUser): Promise<void> {
  ensureServerEnv();
  await upsertAppProfile({
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  });
}
