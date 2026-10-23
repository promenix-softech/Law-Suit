import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/env";

const MAX_COOKIE_BYTES = 16 * 1024;

/**
 * Refreshes the Supabase session cookie and redirects signed-out users away from /dashboard.
 * This is an optimistic check only — authorization is enforced by RLS in the database.
 */
export async function proxy(request: NextRequest) {
  // Supabase auth cookies are chunked at ~3 KB each; anything far above that is abuse.
  if ((request.headers.get("cookie")?.length ?? 0) > MAX_COOKIE_BYTES) {
    return new NextResponse("Request header fields too large", { status: 431 });
  }
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // Every request except static assets, so the cookie-size guard covers route handlers and actions too.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
