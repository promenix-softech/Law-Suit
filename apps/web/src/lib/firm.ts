/**
 * Firm (office) codes. Each firm signs in at <code>.<root domain>, e.g. nirmal.civilsuits.promenix.in.
 * Where there is no firm subdomain (local dev, previews, or before a firm's DNS record exists) the
 * code typed on the sign-in page is remembered in a cookie instead. Either way the code only
 * chooses which firm's sign-in page is shown: after signing in, the account's own office decides
 * (and RLS decides what it can see).
 */

export const FIRM_COOKIE = "firm";
const CODE = /^[a-z][a-z0-9-]{1,29}$/;
/** Subdomains that are never firm codes. */
const RESERVED = new Set(["www", "app", "api", "admin", "auth", "login", "mail", "static"]);

export function normaliseFirmCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toLowerCase();
  return CODE.test(code) && !RESERVED.has(code) ? code : null;
}

/** The firm code in `host` when it is exactly one label under `root` (port ignored). */
export function firmFromHost(host: string | null | undefined, root: string | null | undefined): string | null {
  if (!host || !root) return null;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${root.toLowerCase()}`;
  if (!name.endsWith(suffix)) return null;
  const sub = name.slice(0, -suffix.length);
  return sub.includes(".") ? null : normaliseFirmCode(sub);
}

/** The root domain itself or one of its firm subdomains (anything else is redirected away). */
export function isOwnHost(host: string | null | undefined, root: string | null | undefined): boolean {
  if (!host || !root) return false;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  return name === root.toLowerCase() || firmFromHost(name, root) !== null;
}

export function firmOrigin(code: string, root: string): string {
  return `https://${code}.${root}`;
}
