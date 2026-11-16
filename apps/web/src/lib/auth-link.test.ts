import { describe, expect, it } from "vitest";
import { authLinkTarget } from "./auth-link";

const SITE = "https://civilsuits.promenix.in";

describe("authLinkTarget", () => {
  it("sends a dashboard invitation (tokens in the hash) to the set-password page", () => {
    const href = `${SITE}/#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite`;
    expect(authLinkTarget(href)).toBe("/auth/set-password#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite");
  });

  it("does the same from the sign-in page, and for a code or a token hash", () => {
    expect(authLinkTarget(`${SITE}/login?code=abc123`)).toBe("/auth/set-password?code=abc123");
    expect(authLinkTarget(`${SITE}/?token_hash=th&type=invite`)).toBe("/auth/set-password?token_hash=th&type=invite");
  });

  it("forwards an expired link too, so the person is told what happened", () => {
    expect(authLinkTarget(`${SITE}/#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`)).toMatch(/^\/auth\/set-password#error/);
  });

  it("leaves ordinary addresses alone", () => {
    expect(authLinkTarget(`${SITE}/`)).toBeNull();
    expect(authLinkTarget(`${SITE}/login`)).toBeNull();
    expect(authLinkTarget(`${SITE}/#calculator`)).toBeNull();
    expect(authLinkTarget(`${SITE}/dashboard?view=all`)).toBeNull();
    expect(authLinkTarget(`${SITE}/#access_token=only`)).toBeNull();
  });

  it("does not loop on the set-password page itself", () => {
    expect(authLinkTarget(`${SITE}/auth/set-password#access_token=a&refresh_token=r`)).toBeNull();
  });
});
