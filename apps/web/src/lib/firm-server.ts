import "server-only";
import { cookies, headers } from "next/headers";
import { FIRM_COOKIE, firmFromHost, normaliseFirmCode } from "@/lib/firm";
import type { createClient } from "@/lib/supabase/server";

type Supabase = NonNullable<Awaited<ReturnType<typeof createClient>>>;

/** e.g. civilsuits.promenix.in — firms live one label below it. */
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN || process.env.CANONICAL_HOST || null;
/** On once every firm's subdomain resolves (DNS + Vercel domain); until then the cookie is used. */
export const FIRM_SUBDOMAINS = process.env.FIRM_SUBDOMAINS === "1";

export type RequestFirm = { code: string; fromHost: boolean };

/** While one firm uses the site, its code can be the default so nobody has to type it. */
const DEFAULT_FIRM = normaliseFirmCode(process.env.DEFAULT_FIRM);

/** The firm this request is for: its subdomain, else the remembered code, else the default firm. */
export async function requestFirm(): Promise<RequestFirm | null> {
  const host = (await headers()).get("host");
  const fromHost = firmFromHost(host, ROOT_DOMAIN);
  if (fromHost) return { code: fromHost, fromHost: true };
  const remembered = normaliseFirmCode((await cookies()).get(FIRM_COOKIE)?.value);
  if (remembered) return { code: remembered, fromHost: false };
  return DEFAULT_FIRM ? { code: DEFAULT_FIRM, fromHost: false } : null;
}

export async function onRootHost(): Promise<boolean> {
  const host = (await headers()).get("host")?.toLowerCase().replace(/:\d+$/, "");
  return !!ROOT_DOMAIN && host === ROOT_DOMAIN.toLowerCase();
}

/** Name of the firm with this code, or null (the database exposes nothing else to signed-out visitors). */
export async function findFirm(supabase: Supabase, code: string): Promise<{ name: string } | null> {
  const { data } = await supabase.rpc("firm_by_code", { code });
  return typeof data === "string" && data ? { name: data } : null;
}

export async function rememberFirm(code: string) {
  (await cookies()).set(FIRM_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function forgetFirm() {
  (await cookies()).delete(FIRM_COOKIE);
}

/** The signed-in user's own firm code (null for an office without one yet). */
export async function myFirmCode(supabase: Supabase, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("organizations(slug)").eq("id", userId).maybeSingle();
  const org = data?.organizations as { slug: string | null } | { slug: string | null }[] | null | undefined;
  return (Array.isArray(org) ? org[0]?.slug : org?.slug) ?? null;
}
