import { defineConfig, devices } from "@playwright/test"

// End-to-end tests against a real, running backend (no mocks). They are not
// part of CI because they need that backend; see README.md.
//
//   npm run e2e        # against the dev server (default http://localhost:5173)
//   npm run e2e:prod   # builds, serves dist/ on :4173 with vercel.json's headers

const prod = process.env.E2E_TARGET === "prod"
const baseURL = prod ? "http://localhost:4173" : (process.env.E2E_BASE_URL ?? "http://localhost:5173")

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One worker, in order: the tests share users and stay inside the API's rate limits.
  workers: 1,
  fullyParallel: false,
  // A 429 means a rate limit was hit; stop rather than make it worse.
  maxFailures: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "account", testMatch: /account\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "app",
      testIgnore: /account\.spec\.ts/,
      dependencies: ["account"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: prod
    ? {
        command: "node e2e/serve-dist.mjs",
        url: baseURL,
        reuseExistingServer: false,
        stdout: "pipe",
      }
    : undefined,
})
