import type { FullConfig } from "@playwright/test"
import { API_URL } from "./env.ts"

/** Fail fast, with a clear message, if the app or the API isn't reachable or CORS is wrong. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!
  const origin = new URL(baseURL).origin

  const check = async (what: string, url: string, init?: RequestInit) => {
    try {
      return await fetch(url, init)
    } catch {
      throw new Error(`${what} is not reachable at ${url}. Start it before running the e2e tests.`)
    }
  }

  await check("The app", baseURL)
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
