import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * What each role may see and do, end to end (browser → app → Supabase Auth, RLS and Storage).
 * Data: `pnpm seed:demo` on a local stack — office "nirmal", 10 synthetic cases DEMO-2026-0001…10,
 * odd-numbered ones drafted by drafter1, even ones by drafter2, all approved by approver, and
 * field tasks on cases 1, 4, 7 and 10.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? "";
const FIRM = "nirmal";
const email = (user: string) => `${user}@demo.civilsuits.test`;
const caseNo = (n: number) => `DEMO-2026-${String(n).padStart(4, "0")}`;

async function signIn(page: Page, user: string, password = PASSWORD) {
  await page.goto("/login");
  const firm = page.locator('input[name="firm"]');
  if (await firm.isVisible()) {
    await firm.fill(FIRM);
    await page.getByRole("button", { name: /Continue/ }).click();
  }
  await page.locator('input[name="email"]').fill(email(user));
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** `as(user)`: a separate signed-in session (own cookies), closed when the test ends. */
const test = base.extend<{ as: (user: string) => Promise<Page> }>({
  // The fixture callback is named `provide`, not `use`, so the React hooks lint rule leaves it alone.
  as: async ({ browser, baseURL }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async (user) => {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, user);
      await page.waitForURL(/\/dashboard/);
      return page;
    });
    for (const context of contexts) await context.close();
  },
});

test.beforeAll(() => {
  expect(PASSWORD, "set E2E_PASSWORD to the seed's DEMO_PASSWORD").not.toBe("");
});

/** Case number → case page path, as the admin (who sees every case) finds them. */
async function caseLinks(as: (user: string) => Promise<Page>): Promise<Map<string, string>> {
  const page = await as("admin");
  await page.goto("/dashboard?view=all");
  const links = await page.locator('#cases a[href^="/dashboard/cases/"]').evaluateAll((as) =>
    as.map((a) => [a.textContent?.match(/DEMO-2026-\d{4}/)?.[0] ?? "", a.getAttribute("href") ?? ""] as const),
  );
  return new Map(links.filter(([no, href]) => no && href));
}

/** Case numbers listed on the signed-in person's dashboard. */
async function listedCases(page: Page): Promise<string[]> {
  await page.goto("/dashboard?view=all");
  const text = await page.locator("#cases").innerText();
  return [...new Set(text.match(/DEMO-2026-\d{4}/g) ?? [])].sort();
}

test("a wrong password is refused and says nothing about the account", async ({ page }) => {
  await signIn(page, "admin", "not-the-password-1234");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("admin sees every case of the office and the admin tools", async ({ as }) => {
  const page = await as("admin");
  expect(await listedCases(page)).toEqual(Array.from({ length: 10 }, (_, i) => caseNo(i + 1)));
  await expect(page.getByRole("link", { name: /New case/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Reports/ }).first()).toBeVisible();
});

test("a drafter sees only the cases assigned to them, and cannot open another drafter's case", async ({ as }) => {
  const links = await caseLinks(as);
  const page = await as("drafter1");
  expect(await listedCases(page)).toEqual([1, 3, 5, 7, 9].map(caseNo));

  const other = links.get(caseNo(2));
  expect(other, "admin should see DEMO-2026-0002").toBeTruthy();
  const res = await page.goto(other!);
  expect(res?.status()).toBe(404);
  await expect(page.getByText(caseNo(2))).toHaveCount(0);
});

test("the approver sees the cases they approve and the approval list", async ({ as }) => {
  const page = await as("approver");
  expect(await listedCases(page)).toHaveLength(10);
  await expect(page.getByRole("heading", { name: "Awaiting my approval" })).toBeVisible();
});

test("field staff see only their own tasks, never a case page or the reports", async ({ as }) => {
  const links = await caseLinks(as);
  const page = await as("field");

  await page.goto("/dashboard/tasks");
  const tasks = await page.locator("main").innerText();
  expect([...new Set(tasks.match(/DEMO-2026-\d{4}/g) ?? [])].sort()).toEqual([1, 4, 7, 10].map(caseNo));

  // A case with one of their tasks still opens the task view, not the case file.
  await page.goto(links.get(caseNo(1))!);
  await expect(page).toHaveURL(/\/dashboard\/tasks/);
  // A case without one is not there at all.
  const res = await page.goto(links.get(caseNo(2))!);
  expect(res?.status()).toBe(404);

  await page.goto("/dashboard/reports");
  await expect(page).toHaveURL(/\/dashboard\/tasks/);
});

test("an uploaded scan is stored under a generated name, not the person's file name", async ({ as }) => {
  const links = await caseLinks(as);
  const page = await as("drafter1");
  await page.goto(links.get(caseNo(1))!);

  const scans = page.locator("details#documents");
  // `open` is a boolean attribute ("" when open), so ask the element itself.
  if (!(await scans.evaluate((d) => (d as HTMLDetailsElement).open))) await scans.locator(":scope > summary").click();
  await scans.getByRole("checkbox", { name: /AI reads it automatically/ }).uncheck();
  await scans.locator('input[type="file"]').setInputFiles({
    name: "Ramesh Demo Patil loan 1234567890.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await scans.getByRole("button", { name: /^Upload$/ }).click();
  await expect(scans.getByText(/Document uploaded/)).toBeVisible();

  const list = scans.locator("ul");
  await expect(list).toContainText("PDF");
  const text = await list.innerText();
  expect(text).not.toContain("Ramesh");
  expect(text).not.toContain("1234567890");
});

test("the drafter of a suit in court enters the next hearing date, and the case is listed", async ({ as }) => {
  const links = await caseLinks(as);
  const page = await as("drafter2"); // DEMO-2026-0010 is filed and drafted by drafter2
  await page.goto(links.get(caseNo(10))!);

  const hearings = page.locator("details#hearings");
  if (!(await hearings.evaluate((d) => (d as HTMLDetailsElement).open))) await hearings.locator(":scope > summary").click();
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  await hearings.getByLabel(/First hearing date/).fill(inTwoWeeks);
  await hearings.getByRole("button", { name: /Save date/ }).click();
  await expect(hearings.getByText("Hearing date saved.")).toBeVisible();

  // The first date lists the suit (database rule), which the header shows after the refresh.
  await page.reload();
  await expect(page.locator("header, main").getByText("Listed").first()).toBeVisible();
});

test("@phone the simple case list fits a phone: no sideways scrolling, buttons big enough to tap", async ({ page }) => {
  await signIn(page, "approver");
  await page.waitForURL(/\/dashboard/);
  const m = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    smallButtons: [...document.querySelectorAll<HTMLElement>(".btn")]
      .filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height < 40)
      .map((b) => b.innerText.trim()),
  }));
  expect(m.pageOverflow).toBeLessThanOrEqual(0);
  expect(m.smallButtons).toEqual([]);
});
