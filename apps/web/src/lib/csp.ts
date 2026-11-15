/**
 * Content-Security-Policy, built for each request around a fresh nonce (see `proxy.ts`).
 *
 * Scripts run only with the request's nonce: Next.js puts it on its own script tags when it finds
 * it in the request's CSP header, so pages must be rendered per request (all of ours are — they
 * read the session). `'strict-dynamic'` lets those scripts load the chunks they need; `'self'` is
 * the fallback for browsers that do not know it. No `'unsafe-inline'` for scripts: text that ends
 * up in a page cannot run as script even if some escaping were missed.
 *
 * Styles keep `'unsafe-inline'`: React writes `style=""` attributes and the DOCX preview adds
 * style sheets, and a nonce cannot cover attributes.
 *
 * Uploads go browser → Supabase Storage directly (bucket size and MIME limits apply there).
 */

/**
 * A build pointed at a local Supabase test stack (end-to-end tests: http://127.0.0.1:54321) may
 * talk to it; nothing else over plain http. Hosted builds use https://*.supabase.co only.
 */
export function localSupabaseOrigin(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") ? u.origin : null;
  } catch {
    return null;
  }
}

/** 128 random bits, base64 — new for every request. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(o: { nonce: string; dev?: boolean; supabaseUrl?: string }): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(o.nonce)) throw new Error("CSP nonce must be base64");
  const local = localSupabaseOrigin(o.supabaseUrl);
  const supabase = `https://*.supabase.co${local ? ` ${local}` : ""}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} wss://*.supabase.co`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(o.dev || local ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
