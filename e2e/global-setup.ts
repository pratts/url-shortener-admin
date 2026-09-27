import type { FullConfig } from "@playwright/test"
import { API_URL, RATE_LIMITS } from "./env.ts"

/** Fail fast, with a clear message, if the app or the API isn't reachable or CORS is wrong. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!
  console.log(
    RATE_LIMITS
      ? "E2E_RATE_LIMITS=on: budgeting rate-limited requests (waits instead of exceeding a limit)"
      : "E2E_RATE_LIMITS=off: no budgeting; the backend must run with RATE_LIMITS=off (any 429 fails)"
  )
  const origin = new URL(baseURL).origin

  const check = async (what: string, url: string, init?: RequestInit) => {
    try {
      return await fetch(url, init)
    } catch {
      throw new Error(`${what} is not reachable at ${url}. Start it before running the e2e tests.`)
    }
  }

  await check("The app", baseURL)

  // Link targets can't use "localhost" (the short-link hostname), so they use
  // a loopback address; find one the app answers on.
  if (new URL(baseURL).hostname === "localhost") {
    let loopback: string | undefined
    for (const host of ["127.0.0.1", "[::1]"]) {
      const url = new URL(baseURL)
      url.hostname = host
      const ok = await fetch(url, { signal: AbortSignal.timeout(2_000) }).then(
        (r) => r.ok,
        () => false
      )
      if (ok) {
        loopback = host
        break
      }
    }
    if (!loopback) throw new Error(`The app at ${baseURL} answers on neither 127.0.0.1 nor [::1].`)
    process.env.E2E_LOOPBACK_HOST = loopback // inherited by the test workers
  }
  const health = await check("The admin API", new URL("/readyz", API_URL).toString())
  if (!health.ok) throw new Error(`The admin API is not ready (${health.status} from /readyz).`)

  const preflight = await check("The admin API", `${API_URL}/urls`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
  })
  if (preflight.headers.get("access-control-allow-origin") !== origin) {
    throw new Error(`The API does not allow ${origin}; add it to the backend's CORS_ORIGINS.`)
  }
}
