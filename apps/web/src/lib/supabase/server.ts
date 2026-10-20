import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Per-request Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  // Read cookies first so pages using this client are always rendered per request.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) return null;
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
        }
      },
    },
  });
}
