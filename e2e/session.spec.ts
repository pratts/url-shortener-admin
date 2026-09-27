import { expect, loginWithForm, loginWithToken, targetUrl, test } from "./fixtures.ts"
import { API_URL } from "./env.ts"
import { currentUser } from "./state.ts"

test("clearing sessionStorage mid-session sends the next action to /login and back", async ({ page, api, baseURL }) => {
  const user = currentUser()
  await loginWithToken(page, api)
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible()
  await page.getByRole("button", { name: /^Create (your first )?link$/ }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Target URL").fill(targetUrl(baseURL!, "session"))

  await page.evaluate(() => sessionStorage.clear())
  // Without a token the panel doesn't send API requests it knows would fail:
  // neither the create nor the list refetch after it may reach the API.
  const unauthenticated: string[] = []
  page.on("request", (r) => {
    if (r.url().startsWith(API_URL) && r.method() !== "OPTIONS" && !r.headers()["authorization"]) {
      unauthenticated.push(`${r.method()} ${r.url()}`)
    }
  })
  await dialog.getByRole("button", { name: "Create" }).click()

  await expect(page).toHaveURL(/\/login\?next=%2Furls$/)
  await expect(page.getByText("Your session has expired. Please log in again.")).toBeVisible()
  expect(unauthenticated, "no API request without a token").toEqual([])
  await loginWithForm(page, user.email, user.password)
  await expect(page).toHaveURL(/\/urls$/)
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible()
})
