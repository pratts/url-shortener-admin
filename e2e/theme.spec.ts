import { expect, PROD, test } from "./fixtures.ts"
import { API_URL } from "./env.ts"

test("the production build is served with the CSP and security headers", async ({ page }) => {
  test.skip(!PROD, "Headers come from vercel.json; only the production run serves them.")
  const response = await page.goto("/login")
  const headers = response!.headers()
  const csp = headers["content-security-policy"]
  const directives = Object.fromEntries(
    csp.split(";").map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values])
  )
  expect(directives["script-src"]).toEqual(["'self'"])
  expect(directives["connect-src"]).toContain(new URL(API_URL).origin)
  expect(directives["default-src"]).toEqual(["'self'"])
  expect(directives["frame-ancestors"]).toEqual(["'none'"])
  expect(headers["x-content-type-options"]).toBe("nosniff")
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()")

  // Deep links fall back to index.html (with the same headers).
  const deep = await page.goto("/urls/some/deep/path")
  expect(deep!.status()).toBe(200)
  expect(deep!.headers()["content-security-policy"]).toBe(csp)
})

test("dark mode follows the system, and the toggle persists across reloads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  const themeScript = page.waitForResponse((r) => r.url().endsWith("/theme-init.js"))
  await page.goto("/login")
  expect((await themeScript).status()).toBe(200)

  const html = page.locator("html")
  await expect(html).toHaveClass(/\bdark\b/)
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.getByRole("button", { name: "Change theme" }).click()
  await page.getByRole("menuitemradio", { name: "Light" }).click()
  await expect(html).not.toHaveClass(/\bdark\b/)
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(darkBackground)

  // theme-init.js applies the saved choice before React renders.
  await page.reload()
  await expect(html).not.toHaveClass(/\bdark\b/)
  expect(await page.evaluate(() => localStorage.getItem("tidylnk.theme"))).toBe("light")

  await page.getByRole("button", { name: "Change theme" }).click()
  await page.getByRole("menuitemradio", { name: "Dark" }).click()
  await page.emulateMedia({ colorScheme: "light" })
  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)
})

test("the Geist font loads", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { name: "Log in to your account" })).toBeVisible()
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((f) => f.family.includes("Geist") && f.status === "loaded").length
  })
  expect(loaded).toBeGreaterThan(0)
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Geist")
})
