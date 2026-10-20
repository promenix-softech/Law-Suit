"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client acting as the signed-in user (publishable key only; RLS applies). */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createBrowserClient(url, key);
}
