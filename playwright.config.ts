import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// End-to-end tests run against the production build served by `pnpm preview`.
// `pnpm test:e2e` builds first.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Step mode by default, so nothing moves on its own while a test looks at
    // the page. Tests about play mode turn motion back on.
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "speed.spec.ts" },
    // Timing measurements. Run on their own with `pnpm test:speed`, one worker,
    // so other tests do not compete for the CPU.
    { name: "speed", use: { ...devices["Desktop Chrome"] }, testMatch: "speed.spec.ts" },
  ],
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
