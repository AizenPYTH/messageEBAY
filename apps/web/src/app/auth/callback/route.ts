import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureServerEnv } from "@/server/env";
import { ensureAppProfileForUser } from "@/server/auth";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(request: Request) {
  ensureServerEnv();
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=auth_unconfigured`);
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureAppProfileForUser({
        id: data.user.id,
        email: data.user.email ?? undefined,
        displayName:
          (data.user.user_metadata?.display_name as string | undefined) ||
          (data.user.user_metadata?.full_name as string | undefined),
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
