import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a LOCAL Supabase stack (`supabase start`) seeded with synthetic data
 * (`pnpm seed:demo`), and the built app (`next build`). Never run them against a hosted project:
 * they sign in as the demo roles and upload files. See e2e/README.md.
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);

// Refuse to run against anything but a local stack: the tests sign in and write data.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (supabaseUrl && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(supabaseUrl)) {
  throw new Error(`e2e tests run only against a local Supabase stack, not ${new URL(supabaseUrl).host}`);
}

export default defineConfig({
  testDir: "./e2e",
  // The tests share one seeded office and some of them write to it: one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
