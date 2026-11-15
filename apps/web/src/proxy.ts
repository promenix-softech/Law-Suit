import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { contentSecurityPolicy, newNonce } from "@/lib/csp";
import { isOwnHost } from "@/lib/firm";
import { supabaseEnv } from "@/lib/supabase/env";

const MAX_COOKIE_BYTES = 16 * 1024;

/** Production lives on one address; old *.vercel.app links are sent there (e.g. civilsuits.promenix.in). */
const CANONICAL_HOST = process.env.CANONICAL_HOST;

/**
 * Sets the Content-Security-Policy with a fresh nonce for every request, refreshes the Supabase
 * session cookie and redirects signed-out users away from /dashboard.
 * The sign-in check is optimistic only — authorization is enforced by RLS in the database.
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = contentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const secured = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  /**
   * Passes the request on. Next.js reads the nonce from the request's CSP header and puts it on
   * its own script tags; whatever the browser sent under these names is overwritten.
   */
  const pass = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return secured(NextResponse.next({ request: { headers } }));
  };

  const host = request.headers.get("host");
  // Firms sign in at <code>.<canonical host>; those addresses stay.
  if (CANONICAL_HOST && process.env.VERCEL_ENV === "production" && host && !isOwnHost(host, CANONICAL_HOST)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return secured(NextResponse.redirect(target, 308));
  }
  // Supabase auth cookies are chunked at ~3 KB each; anything far above that is abuse.
  if ((request.headers.get("cookie")?.length ?? 0) > MAX_COOKIE_BYTES) {
    return secured(new NextResponse("Request header fields too large", { status: 431 }));
  }
  let response = pass();
  const env = supabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        // The refreshed session goes to the page (request cookies) and to the browser (response).
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = pass();
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && request.nextUrl.pathname.startsWith("/dashboard")) {
    return secured(NextResponse.redirect(new URL("/login", request.url)));
  }
  return response;
}

export const config = {
  // Every request except static assets, so the cookie-size guard covers route handlers and actions too.
  // The same paths are listed in next.config.ts (`STATIC_FILES`), which gives those files a fixed policy.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
