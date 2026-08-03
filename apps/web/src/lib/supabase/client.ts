"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseUrl,
} from "@/lib/supabase/env";

export function createClient() {
  const url = getPublicSupabaseUrl();
  const key = getPublicSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase Auth non configuré (NEXT_PUBLIC_SUPABASE_*)");
  }
  return createBrowserClient(url, key);
}
