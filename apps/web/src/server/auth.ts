import "server-only";
import { upsertAppProfile } from "@/server/core";
import { ensureServerEnv } from "@/server/env";
import { isAuthSkipped } from "@/lib/auth-mode";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  getGuestUserIfPresent,
  getOrCreateGuestUser,
  isEbayLinkReady,
} from "@/server/guestSession";

export type AppUser = {
  id: string;
  email?: string;
  displayName?: string;
};

/**
 * Soft mode when SKIP_AUTH:
 * no email/Google login gate — guest cookie identity is used for eBay links.
 */
export function isAuthEnforced(): boolean {
  ensureServerEnv();
  if (isAuthSkipped()) return false;
  return isSupabaseAuthConfigured();
}

/** Current actor if already known (Supabase session or existing guest cookie). */
export async function getOptionalUser(): Promise<AppUser | null> {
  ensureServerEnv();

  if (isAuthEnforced()) {
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

  return getGuestUserIfPresent();
}

/**
 * Actor for eBay OAuth routes — creates guest cookie when needed.
 * Prefer calling from Route Handlers.
 */
export async function resolveActor(): Promise<AppUser> {
  ensureServerEnv();

  if (isAuthEnforced()) {
    const user = await getOptionalUser();
    if (!user) throw new Error("Connexion requise");
    await ensureAppProfileForUser(user);
    return user;
  }

  if (!isEbayLinkReady()) {
    throw new Error(
      "OAuth eBay non prêt (EBAY_CLIENT_ID/SECRET/RUNAME + TOKEN_ENCRYPTION_KEY).",
    );
  }

  return getOrCreateGuestUser();
}

export async function requireUser(): Promise<AppUser> {
  return resolveActor();
}

export async function ensureAppProfileForUser(user: AppUser): Promise<void> {
  ensureServerEnv();
  await upsertAppProfile({
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  });
}
