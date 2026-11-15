import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, localSupabaseOrigin, newNonce } from "./csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("contentSecurityPolicy", () => {
  const nonce = "QUJDREVGR0hJSktMTU5PUA==";
  const csp = contentSecurityPolicy({ nonce, supabaseUrl: "https://abc.supabase.co" });

  it("lets scripts run only with the request's nonce", () => {
    expect(directive(csp, "script-src")).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(directive(csp, "script-src")).not.toContain("unsafe");
  });

  it("allows eval in development only", () => {
    expect(directive(contentSecurityPolicy({ nonce, dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("locks everything else to our origin and Supabase", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("lets a local test stack through, and nothing else over http", () => {
    const local = contentSecurityPolicy({ nonce, supabaseUrl: "http://127.0.0.1:54321" });
    expect(directive(local, "connect-src")).toContain("http://127.0.0.1:54321");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(localSupabaseOrigin("http://evil.example:54321")).toBeNull();
    expect(localSupabaseOrigin("https://abc.supabase.co")).toBeNull();
    expect(localSupabaseOrigin(undefined)).toBeNull();
  });

  it("refuses a nonce that could break out of the header", () => {
    for (const bad of ["", "short", "abc'; script-src *", "QUJDREVGR0hJSktMTU5PUA== x", "a;b".repeat(8)]) {
      expect(() => contentSecurityPolicy({ nonce: bad })).toThrow();
    }
  });
});

describe("newNonce", () => {
  it("is different every time and fits the policy", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newNonce()));
    expect(seen.size).toBe(50);
    for (const n of seen) expect(() => contentSecurityPolicy({ nonce: n })).not.toThrow();
  });
});
