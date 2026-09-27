import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test"
import { API_URL, PROD, RATE_LIMITED_MESSAGE } from "./env.ts"
import { acquire, currentUser, recordAttempt, releaseLast, saveUser, type E2EUser } from "./state.ts"

type Expected = { status: number; url: string | RegExp }

type Guard = {
  /** Allow a 4xx/5xx response (and the console error Chrome logs for it). */
  allow: (status: number, url: string | RegExp) => void
}

const matches = (url: string, pattern: string | RegExp) =>
  typeof pattern === "string" ? url.includes(pattern) : pattern.test(url)

export const test = base.extend<{ guard: Guard; api: Api }>({
  // Fails the test on console errors, page errors, failed requests, unexpected
  // 4xx/5xx responses, CORS errors, and (in the production run) any Content
  // Security Policy message or violation. Covers popups too.
  guard: [
    async ({ context }, use) => {
      const problems: string[] = []
      const expected: Expected[] = []
      const isExpected = (status: number, url: string) =>
        expected.some((e) => e.status === status && matches(url, e.url))

      // Reported as they happen, so violations on pages navigated away from still count.
      await context.exposeBinding("__e2eReportCsp", ({ page }, text: string) =>
        problems.push(`CSP violation on ${page.url()}: ${text}`)
      )
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          const report = (window as unknown as { __e2eReportCsp?: (text: string) => void }).__e2eReportCsp
          report?.(`${e.violatedDirective} blocked ${e.blockedURI || "inline"}`)
        })
      })

      const watch = (page: Page) => {
        page.on("console", (msg) => {
          const text = msg.text()
          if (/content security policy/i.test(text)) {
            problems.push(`CSP console message: ${text}`)
            return
          }
          if (msg.type() !== "error") return
          // Chrome logs every 4xx/5xx as "Failed to load resource"; those are judged by status below.
          if (text.startsWith("Failed to load resource")) return
          problems.push(`console error: ${text}`)
        })
        page.on("pageerror", (error) => problems.push(`page error: ${error.message}`))
        page.on("requestfailed", (request) => {
          const failure = request.failure()?.errorText ?? "unknown"
          if (failure === "net::ERR_ABORTED") {
            // Downloads of blob:/data: URLs end as aborted navigations.
            if (/^(blob|data):/.test(request.url())) return
            // A cancelled read, not a failure: TanStack Query aborts a query's
            // fetch when its component unmounts (in development React
            // StrictMode mounts twice, so the first fetch is always cancelled).
            // Only API reads made with fetch qualify; aborted writes,
            // navigations and assets still count, and CORS and network
            // failures are net::ERR_FAILED.
            if (request.method() === "GET" && request.resourceType() === "fetch" && request.url().startsWith(API_URL)) {
              return
            }
          }
          problems.push(`request failed: ${request.method()} ${request.url()} (${failure})`)
        })
        page.on("response", (response) => {
          const status = response.status()
          if (status === 429) {
            problems.push(`RATE LIMITED (429): ${response.url()}: ${RATE_LIMITED_MESSAGE}`)
          } else if (status >= 400 && !isExpected(status, response.url())) {
            problems.push(`unexpected ${status}: ${response.request().method()} ${response.url()}`)
          }
        })
      }
      context.pages().forEach(watch)
      context.on("page", watch)

      await use({ allow: (status, url) => expected.push({ status, url }) })

      expect(problems, "console errors, failed requests or CSP problems").toEqual([])
    },
    { auto: true },
  ],

  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext()
    await use(new Api(request))
    await request.dispose()
  },
})

export { expect }
export { PROD }

export type Link = {
  id: number
  url: string
  short_code: string
  short_url: string
}

/** Direct API calls for setup and checks, as the e2e user. */
export class Api {
  private readonly request: APIRequestContext

  constructor(request: APIRequestContext) {
    this.request = request
  }

  /** A token for the user, reused until it's within 10 minutes of expiring (logins are rate limited). */
  async token(user: E2EUser = currentUser()): Promise<string> {
    if (user.token && user.tokenExpiresAt && user.tokenExpiresAt - Date.now() > 10 * 60_000) {
      return user.token
    }
    await acquire("login")
    const response = await this.request.post(`${API_URL}/users/login`, {
      data: { email: user.email, password: user.password },
    })
    if (response.status() === 401) recordAttempt("loginFailed", user.email)
    expect(response.status(), `API login for ${user.email}`).toBe(200)
    const { token } = (await response.json()) as { token: string }
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp: number }
    saveUser(user.email, (u) => {
      u.token = token
      u.tokenExpiresAt = payload.exp * 1000
    })
    return token
  }

  private async headers() {
    return { Authorization: `Bearer ${await this.token()}` }
  }

  async links(): Promise<Link[]> {
    const all: Link[] = []
    let cursor: string | null = null
    do {
      const response = await this.request.get(`${API_URL}/urls`, {
        params: { limit: 100, ...(cursor ? { cursor } : {}) },
        headers: await this.headers(),
      })
      expect(response.status()).toBe(200)
      const page = (await response.json()) as { items: Link[]; next_cursor: string | null }
      all.push(...page.items)
      cursor = page.next_cursor
    } while (cursor)
    return all
  }

  async deleteAllLinks() {
    for (const link of await this.links()) {
      const response = await this.request.delete(`${API_URL}/urls/${link.id}`, { headers: await this.headers() })
      expect(response.status()).toBe(204)
    }
  }

  /** GET the short URL without following the redirect. Records a click, like any visit. */
  async resolveShortUrl(shortUrl: string) {
    const response = await this.request.get(shortUrl, { maxRedirects: 0 })
    return { status: response.status(), location: response.headers()["location"] }
  }
}

/**
 * A target URL that points back at the panel, so opening a short link never
 * reaches an outside site (the SPA answers any path). It uses 127.0.0.1: the
 * backend rejects every target on the short-link hostname, localhost, whatever
 * the port.
 */
export function targetUrl(baseURL: string, name: string | number) {
  const url = new URL(`/e2e-target/${name}`, baseURL)
  if (url.hostname === "localhost") url.hostname = "127.0.0.1"
  return url.href
}

/** Open the app already logged in, without a UI login (logins are rate limited). */
export async function loginWithToken(page: Page, api: Api, path = "/urls") {
  const token = await api.token()
  await page.goto("/login")
  await page.evaluate((t) => sessionStorage.setItem("tidylnk.token", t), token)
  await page.goto(path)
}

/** Log in through the form, within the login budgets; returns the response status. */
export async function loginWithForm(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await acquire("login")
  await acquire("loginFailed", email) // only failures count, but a login may fail
  const response = page.waitForResponse((r) => r.url().endsWith("/users/login"))
  await page.getByRole("button", { name: "Log in" }).click()
  const status = (await response).status()
  // The per-email budget counts failures only: drop the reservation on success.
  if (status !== 401) releaseLast("loginFailed", email)
  return status
}
