import { expect, test, type Page } from "@playwright/test";

/**
 * Opening a case: from the bank's file (the AI — a local stand-in for Sarvam, e2e/sarvam-mock.mjs —
 * fills the form, the admin checks and opens), or typed in. The court follows the law and the
 * district, Pune by default. Synthetic data only; runs against the local stack seeded by seed:demo.
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

const field = (page: Page, key: string) => page.locator(`[data-field="${key}"]`);

test("a case opens from the bank's file: the AI fills the form, the admin checks it, the law picks the court", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/dashboard/cases/new");
  await page.getByRole("button", { name: /From the bank's file/ }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "Ramesh Demo Patil loan file 1234567890.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
  });
  await page.getByRole("button", { name: /Read it with AI/ }).click();
  await expect(page.getByRole("heading", { name: "Borrower and guarantor" })).toBeVisible({ timeout: 30_000 });

  // Filled in, with sure plain text pre-ticked and money never pre-ticked.
  await expect(field(page, "borrower_name").locator("input:not([type])")).toHaveValue("Ramesh Demo Patil");
  await expect(field(page, "borrower_name").getByRole("checkbox")).toBeChecked();
  await expect(field(page, "guarantor_name").getByRole("checkbox")).not.toBeChecked(); // read with 62% confidence
  await expect(field(page, "outstanding_amount").locator("input:not([type])")).toHaveValue("562310.00");
  await expect(field(page, "outstanding_amount").getByRole("checkbox")).not.toBeChecked();
  await expect(field(page, "tenure_months")).toContainText("Not accepted as read");

  // The law: ₹5.6 lakh, the demo office files Order XXXVII summary suits → the civil court, in Pune.
  const where = page.getByTestId("where-to-file");
  await expect(where).toContainText("Order XXXVII");
  await expect(page.getByRole("combobox", { name: "District" })).toHaveValue("Pune");
  await expect(page.getByRole("combobox", { name: "Court" }).locator("option:checked")).toHaveText(/Civil Judge Senior Division, Pune/);
  // The branch comes from the IFSC read in the file.
  await expect(page.getByRole("combobox", { name: "Bank branch" }).locator("option:checked")).toHaveText(/SBIN0DEMO01/);

  // The admin checks the money values one by one, and assigns the team.
  for (const key of ["outstanding_amount", "sanction_amount", "npa_date", "outstanding_as_on"]) {
    await field(page, key).getByRole("checkbox").check();
  }
  await page.getByRole("combobox", { name: "Drafter" }).selectOption({ label: "Deepak Demo Drafter" });
  await page.getByRole("combobox", { name: "Approver" }).selectOption({ label: "Anil Demo Approver" });
  await page.getByRole("button", { name: "Open case" }).click();

  await page.waitForURL(/\/dashboard\/cases\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByText("Ramesh Demo Patil").first()).toBeVisible();
  // The file moved into the case under a generated name.
  const docs = page.locator("details#documents");
  if (!(await docs.evaluate((d) => (d as HTMLDetailsElement).open))) await docs.locator(":scope > summary").click();
  await expect(docs.locator("ul")).toContainText("PDF");
  await expect(docs.locator("ul")).not.toContainText("1234567890");
});

test("the typed-in form picks a Pune court by default and lets the district change", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/dashboard/cases/new");
  await page.getByRole("button", { name: /Type it in/ }).click();
  await expect(page.getByRole("combobox", { name: "District" })).toHaveValue("Pune");
  await expect(page.getByRole("combobox", { name: "Court" }).locator("option:checked")).toHaveText(/Pune/);
  await page.getByRole("combobox", { name: "District" }).selectOption("Nashik");
  await expect(page.getByTestId("where-to-file")).toBeVisible();
});
