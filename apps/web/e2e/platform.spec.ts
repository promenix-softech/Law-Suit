import { expect, test, type Browser, type Page } from "@playwright/test";
import { watchCsp } from "./csp-watch";

/**
 * The super admin (Promenix, above every office): sees each office's scheme and usage but none of
 * its cases, sets the scheme, and can pause an office. Local stack only; the super admin is seeded
 * with SEED_SUPER_ADMIN=1 into an office of its own (firm code "promenix").
 */

const PASSWORD = process.env.E2E_PASSWORD ?? "";
const OFFICE = "Nirmal Nyay Associates (Demo)";

async function signIn(browser: Browser, firm: string, user: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  cspChecks.push(watchCsp(context));
  const page = await context.newPage();
  await page.goto("/login");
  const firmBox = page.locator('input[name="firm"]');
  if (await firmBox.isVisible()) {
    await firmBox.fill(firm);
    await page.getByRole("button", { name: /Continue/ }).click();
  }
  await page.locator('input[name="email"]').fill(`${user}@demo.civilsuits.test`);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  return page;
}

// Nothing on these pages may be refused by the Content-Security-Policy.
let cspChecks: (() => void)[] = [];
test.beforeEach(() => {
  cspChecks = [];
});
test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
  for (const check of cspChecks) check();
});

/** The super admin's page of the demo office. */
async function openOffice(superAdmin: Page) {
  await superAdmin.goto("/dashboard/platform");
  await superAdmin.locator('tr[data-office="nirmal"]').getByRole("link", { name: OFFICE }).click();
  await superAdmin.waitForURL(/\/dashboard\/platform\/[0-9a-f-]{36}$/);
  await expect(superAdmin.getByRole("heading", { name: OFFICE })).toBeVisible();
}

/** Sets the office's scheme from a ready-made one, with the given monthly allowance and behaviour at the limit. */
async function setScheme(superAdmin: Page, o: { perMonth: string; atLimit: "Only warn" | "Refuse new cases" }) {
  await superAdmin.getByLabel("Start from a ready-made scheme").selectOption("monthly_office");
  await expect(superAdmin.getByLabel("Scheme name")).toHaveValue("Monthly – Office");
  await superAdmin.getByLabel("New cases allowed per month").fill(o.perMonth);
  await superAdmin.getByRole("radio", { name: new RegExp(`^${o.atLimit}`) }).check();
  await superAdmin.getByRole("button", { name: "Save scheme" }).click();
  await expect(superAdmin.getByText("Scheme saved.")).toBeVisible();
}

/** The office admin fills the typed-in new-case form and presses "Open case". */
async function typeInCase(admin: Page, caseNo: string) {
  await admin.goto("/dashboard/cases/new");
  await admin.getByRole("button", { name: /Type it in/ }).click();
  await admin.locator('input[name="caseNo"]').fill(caseNo);
  await admin.locator('select[name="branchId"]').selectOption({ index: 1 });
  await admin.locator('input[name="borrowerName"]').fill("Suresh Demo Limit");
  await admin.locator('select[name="drafterId"]').selectOption({ label: "Deepak Demo Drafter" });
  await admin.locator('select[name="approverId"]').selectOption({ label: "Anil Demo Approver" });
  await admin.getByRole("button", { name: "Open case" }).click();
}

test("an office admin has no super admin pages", async ({ browser }) => {
  const admin = await signIn(browser, "nirmal", "admin");
  await expect(admin.getByRole("link", { name: "All offices" })).toHaveCount(0);
  expect((await admin.goto("/dashboard/platform"))?.status()).toBe(404);
});

test("the super admin sees every office's scheme and usage, and none of its cases", async ({ browser }) => {
  // A case address of the office, as its own admin finds it.
  const admin = await signIn(browser, "nirmal", "admin");
  await admin.goto("/dashboard?view=all");
  const caseHref = await admin.locator('#cases a[href^="/dashboard/cases/"]').first().getAttribute("href");
  expect(caseHref).toBeTruthy();

  const superAdmin = await signIn(browser, "promenix", "superadmin");
  // The super admin's home is the console, and the menu holds the console only.
  await superAdmin.waitForURL(/\/dashboard\/platform$/);
  await expect(superAdmin.getByRole("link", { name: "All offices" }).first()).toBeVisible();
  await expect(superAdmin.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  const row = superAdmin.locator('tr[data-office="nirmal"]');
  await expect(row).toContainText(OFFICE);
  await expect(superAdmin.locator('tr[data-office="promenix"]')).toContainText("your own office");

  await openOffice(superAdmin);
  await expect(superAdmin.getByRole("heading", { name: "Usage against the scheme" })).toBeVisible();
  await expect(superAdmin.getByRole("heading", { name: "Usage, month by month" })).toBeVisible();
  await expect(superAdmin.locator("tfoot")).toContainText("12 months");

  // Numbers, yes; the office's cases, no — not on the dashboard and not by address.
  await superAdmin.goto("/dashboard?view=all");
  await expect(superAdmin.getByText(/DEMO-2026-\d{4}/)).toHaveCount(0);
  expect((await superAdmin.goto(caseHref!))?.status()).toBe(404);
});

test("a blocking scheme refuses a new case and says why; a warning scheme lets it through", async ({ browser }) => {
  const superAdmin = await signIn(browser, "promenix", "superadmin");
  const admin = await signIn(browser, "nirmal", "admin");
  await openOffice(superAdmin);
  try {
    // The demo office already opened more than one case this month.
    await setScheme(superAdmin, { perMonth: "1", atLimit: "Refuse new cases" });
    await expect(superAdmin.getByText("New cases are refused: this month's allowance is used up.")).toBeVisible();

    await typeInCase(admin, "SCHEME-E2E-1");
    await expect(admin.getByText(/covers no more new cases this month/)).toBeVisible();
    await admin.goto("/dashboard/billing");
    await expect(admin.getByRole("heading", { name: "Your scheme" })).toBeVisible();
    await expect(admin.getByText("New cases cannot be opened until Promenix extends the scheme.")).toBeVisible();

    await setScheme(superAdmin, { perMonth: "1", atLimit: "Only warn" });
    await typeInCase(admin, "SCHEME-E2E-1");
    await admin.waitForURL(/\/dashboard\/cases\/[0-9a-f-]{36}$/);
    await expect(admin.getByText("SCHEME-E2E-1").first()).toBeVisible();
  } finally {
    // Leave the office with room for the tests that follow.
    await setScheme(superAdmin, { perMonth: "500", atLimit: "Only warn" });
  }
});

test("a paused office's people see why instead of the app; resumed, they work again", async ({ browser }) => {
  const superAdmin = await signIn(browser, "promenix", "superadmin");
  const drafter = await signIn(browser, "nirmal", "drafter1");
  await openOffice(superAdmin);
  superAdmin.on("dialog", (d) => d.accept());
  try {
    await expect(superAdmin.getByRole("button", { name: /Pause this office/ })).toBeDisabled();
    await superAdmin.getByLabel(/Reason/).fill("Payment overdue (test)");
    await superAdmin.getByRole("button", { name: /Pause this office/ }).click();
    await expect(superAdmin.getByRole("button", { name: /Resume this office/ })).toBeVisible();

    await drafter.goto("/dashboard");
    await expect(drafter.getByRole("heading", { name: "This office's access is paused" })).toBeVisible();
    await expect(drafter.getByText("Payment overdue (test)")).toBeVisible();
    await expect(drafter.getByText(/DEMO-2026-\d{4}/)).toHaveCount(0);
    await drafter.goto("/dashboard/approvals");
    await expect(drafter.getByRole("heading", { name: "This office's access is paused" })).toBeVisible();
  } finally {
    const resume = superAdmin.getByRole("button", { name: /Resume this office/ });
    if (await resume.count()) await resume.click();
    await expect(superAdmin.getByRole("button", { name: /Pause this office/ })).toBeVisible();
  }
  await drafter.goto("/dashboard?view=all");
  await expect(drafter.getByText("DEMO-2026-0001").first()).toBeVisible();
});

test("the super admin opens a new office", async ({ browser }) => {
  const superAdmin = await signIn(browser, "promenix", "superadmin");
  const code = `e2e-${Date.now().toString(36)}`;
  const name = `Test Firm ${code}`;
  await superAdmin.getByRole("link", { name: "New office" }).first().click();
  await superAdmin.waitForURL(/\/dashboard\/platform\/new$/);
  await superAdmin.getByLabel("Office name").fill(name);
  await expect(superAdmin.getByLabel("Firm code")).toHaveValue(`test-firm-${code}`);
  await superAdmin.getByLabel("Firm code").fill(code);
  await superAdmin.getByLabel("Admin's full name").fill("Test Admin");
  await superAdmin.getByLabel("Admin's email").fill(`${code}@example.test`);
  await superAdmin.getByRole("button", { name: "Open the office" }).click();
  // The office opens; the invitation needs the edge function, which may not run locally.
  await superAdmin.waitForURL(/\/dashboard\/platform\/[0-9a-f-]{36}\?opened=[01]$/);
  await expect(superAdmin.getByRole("heading", { name })).toBeVisible();
  await expect(superAdmin.getByRole("heading", { name: "Office admin" })).toBeVisible();

  await superAdmin.goto("/dashboard/platform");
  await expect(superAdmin.locator(`tr[data-office="${code}"]`)).toContainText(name);

  // The same firm code cannot be used twice.
  await superAdmin.goto("/dashboard/platform/new");
  await superAdmin.getByLabel("Office name").fill(`${name} again`);
  await superAdmin.getByLabel("Firm code").fill(code);
  await superAdmin.getByLabel("Admin's full name").fill("Test Admin");
  await superAdmin.getByLabel("Admin's email").fill(`${code}-2@example.test`);
  await superAdmin.getByRole("button", { name: "Open the office" }).click();
  await expect(superAdmin.getByText("This firm code is taken. Choose another.")).toBeVisible();
});

test("an office admin cannot open the new office page", async ({ browser }) => {
  const admin = await signIn(browser, "nirmal", "admin");
  expect((await admin.goto("/dashboard/platform/new"))?.status()).toBe(404);
});
<<<<<<< HEAD

test("the super admin sets prices, issues an invoice, records payment and cancels it", async ({ browser }) => {
  const superAdmin = await signIn(browser, "promenix", "superadmin");
  superAdmin.on("dialog", (d) => d.accept());
  await openOffice(superAdmin);

  // Prices: a fixed monthly fee only, inside Maharashtra.
  await superAdmin.getByLabel("Price per suit pack (₹)").first().fill("0");
  await superAdmin.getByLabel("Monthly minimum (₹)").fill("5,000");
  await superAdmin.getByLabel("Prices apply from").fill("2020-01-01");
  await superAdmin.getByLabel("State code (place of supply)").fill("27");
  await superAdmin.getByRole("button", { name: "Save prices" }).click();
  await expect(superAdmin.getByText("Billing plan saved.")).toBeVisible();

  // A hand-written invoice, worked out by the system before it is issued.
  await superAdmin.getByRole("radio", { name: /Written by hand/ }).check();
  await superAdmin.getByLabel("Period from").fill("2021-04-01");
  await superAdmin.getByLabel("Period to").fill("2022-03-31");
  await superAdmin.getByLabel("Description").fill("Yearly scheme fee");
  await superAdmin.getByLabel("Quantity").fill("1");
  await superAdmin.getByLabel("Rate (₹)").fill("60000");
  await superAdmin.getByRole("button", { name: "Work it out" }).click();
  await expect(superAdmin.getByText("CGST 9% + SGST 9%")).toBeVisible();
  await expect(superAdmin.getByText("₹70,800.00")).toBeVisible();
  await superAdmin.getByRole("button", { name: "Issue invoice" }).click();
  await expect(superAdmin.getByText(/Invoice PS\/\d{4}-\d{2}\/\d{4} issued\./)).toBeVisible();

  const row = superAdmin.locator("tr[data-invoice]").filter({ hasText: "₹70,800.00" }).filter({ hasText: "Unpaid" }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole("link").first().getAttribute("href");
  const doc = await superAdmin.request.get(href!);
  expect(doc.status()).toBe(200);
  expect(doc.headers()["content-type"]).toContain("wordprocessingml");

  // The same period cannot be invoiced twice while the first is live.
  await superAdmin.getByRole("button", { name: "Work it out" }).click();
  await superAdmin.getByRole("button", { name: "Issue invoice" }).click();
  await expect(superAdmin.getByText("This period already has an invoice. Cancel it first to issue a new one.")).toBeVisible();

  // Paid with a reference, then cancelled (so the period is free for the next run).
  const invoiceNo = (await row.getAttribute("data-invoice"))!;
  const mine = superAdmin.locator(`tr[data-invoice="${invoiceNo}"]`);
  await mine.getByRole("button", { name: "Mark paid" }).click();
  await mine.getByLabel("Payment reference (UTR / cheque no.)").fill("UTR-TEST-001");
  await mine.getByRole("button", { name: "Save" }).click();
  await expect(mine).toContainText("Paid");
  await expect(mine).toContainText("UTR-TEST-001");

  await superAdmin.goto("/dashboard/platform/invoices");
  await expect(superAdmin.getByRole("heading", { name: "Invoices" })).toBeVisible();
  const listed = superAdmin.locator(`tr[data-invoice="${invoiceNo}"]`);
  await expect(listed).toContainText(OFFICE);
  await listed.getByRole("button", { name: "Cancel invoice" }).click();
  await expect(listed).toContainText("Cancelled");

  // The office's own admin sees its invoice on the billing page; nobody else gets the super admin's copy.
  const admin = await signIn(browser, "nirmal", "admin");
  await admin.goto("/dashboard/billing");
  await expect(admin.getByText(invoiceNo)).toBeVisible();
  expect((await admin.request.get(href!)).status()).toBe(404);
  expect((await admin.goto("/dashboard/platform/invoices"))?.status()).toBe(404);
});
=======
>>>>>>> 0277fc74ca50dc7f31fa723ddcac90a0effab32c
