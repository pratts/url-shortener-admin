import { expect, loginWithForm, loginWithToken, targetUrl, test } from "./fixtures.ts"
import { currentUser } from "./state.ts"

test("clearing sessionStorage mid-session sends the next action to /login and back", async ({ page, api, guard, baseURL }) => {
  const user = currentUser()
  await loginWithToken(page, api)
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible()
  await page.getByRole("button", { name: /^Create (your first )?link$/ }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Target URL").fill(targetUrl(baseURL!, "session"))

  await page.evaluate(() => sessionStorage.clear())
  guard.allow(401, /\/api\/v1\/urls$/)
  const rejected = page.waitForResponse((r) => r.url().endsWith("/urls") && r.request().method() === "POST")
  await dialog.getByRole("button", { name: "Create" }).click()
  expect((await rejected).status()).toBe(401)

  await expect(page).toHaveURL(/\/login\?next=%2Furls$/)
  await expect(page.getByText("Your session has expired. Please log in again.")).toBeVisible()
  await loginWithForm(page, user.email, user.password)
  await expect(page).toHaveURL(/\/urls$/)
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible()
})
