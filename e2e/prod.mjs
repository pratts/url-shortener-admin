// Builds the app against the local backend, then runs the e2e suite against
// the production build served with vercel.json's headers (see serve-dist.mjs).
// Extra arguments go to `playwright test`.
import { spawnSync } from "node:child_process"

const env = {
  ...process.env,
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? "http://localhost:8086/api/v1",
  VITE_SHORT_URL_HOST: process.env.VITE_SHORT_URL_HOST ?? "localhost:8085",
}

const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...env, ...extraEnv } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run("npm", ["run", "build"])
run("npx", ["playwright", "test", ...process.argv.slice(2)], { E2E_TARGET: "prod" })
