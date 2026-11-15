import { expect, test, type Page } from "@playwright/test";
import { watchCsp } from "./csp-watch";

/**
 * Content-Security-Policy: scripts run only with the nonce of their own request (no
 * 'unsafe-inline'), every page still works under it, and static files get a fixed policy.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? "";

async function signInAdmin(page: Page) {
  await page.goto("/login");
  const firm = page.locator('input[name="firm"]');
  if (await firm.isVisible()) {
    await firm.fill("nirmal");
    await page.getByRole("button", { name: /Continue/ }).click();
  }
  await page.locator('input[name="email"]').fill("admin@demo.civilsuits.test");
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

const scriptSrc = (csp: string) => csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
const nonceOf = (csp: string) => scriptSrc(csp).match(/'nonce-([^']+)'/)?.[1] ?? "";

test("a page's scripts run only with the nonce of that request", async ({ request }) => {
  const first = await request.get("/login");
  const second = await request.get("/login");
  const csp = first.headers()["content-security-policy"] ?? "";

  expect(scriptSrc(csp)).toContain("'strict-dynamic'");
  expect(scriptSrc(csp)).not.toContain("unsafe-inline");
  expect(scriptSrc(csp)).not.toContain("unsafe-eval");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");

  const nonce = nonceOf(csp);
  expect(nonce.length).toBeGreaterThanOrEqual(22);
  expect(nonceOf(second.headers()["content-security-policy"] ?? "")).not.toBe(nonce);

  // Next.js put this request's nonce on its script tags, and no script tag is without one.
  const html = await first.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
});

test("what the browser sends as a nonce or a policy is not taken over", async ({ request }) => {
  const res = await request.get("/login", {
    headers: { "x-nonce": "attacker", "content-security-policy": "script-src 'nonce-attacker' 'unsafe-inline'" },
  });
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).not.toContain("attacker");
  expect(await res.text()).not.toContain('nonce="attacker"');
});

test("static files get a fixed policy: opened as a page, nothing in them loads or runs", async ({ request }) => {
  for (const path of ["/file.svg", "/favicon.ico"]) {
    const res = await request.get(path);
    expect(res.ok(), path).toBe(true);
    expect(res.headers()["content-security-policy"], path).toBe("default-src 'none'; frame-ancestors 'none'");
  }
});

test("every main page works under the policy, and the search palette opens a case", async ({ page, context }) => {
  const check = watchCsp(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await signInAdmin(page);
  const pages = ["/dashboard", "/dashboard/cases/new", "/dashboard/tasks", "/dashboard/reports", "/dashboard/masters"];
  pages.push("/dashboard/team", "/dashboard/settings", "/dashboard/billing", "/dashboard/audit", "/dashboard/batches", "/dashboard/help");
  for (const path of pages) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator("h1").first(), path).toBeVisible();
  }

  // Scripts ran (the palette is client-side) and the palette finds a case by its number.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Search" }).first().click();
  const search = page.getByRole("combobox");
  await search.fill("DEMO-2026-0003");
  await expect(page.getByRole("option", { name: /DEMO-2026-0003/ })).toBeVisible();
  await search.press("Enter");
  await page.waitForURL(/\/dashboard\/cases\/[0-9a-f-]{36}$/);
  await expect(page.getByText("DEMO-2026-0003").first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(errors, "no script errors").toEqual([]);
  check();
});
