import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { runtimeEnv } from "@/lib/runtimeEnv";

export function runtimeSupabase(): SupabaseClient | null {
  const url = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL").trim();
  const key = (
    runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  ).trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
