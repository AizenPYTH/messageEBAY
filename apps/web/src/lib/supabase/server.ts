import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseUrl,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/env";

export async function createClient() {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Supabase Auth non configuré");
  }

  const cookieStore = await cookies();
  const url = getPublicSupabaseUrl()!;
  const key = getPublicSupabaseAnonKey()!;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware will refresh sessions.
        }
      },
    },
  });
}
