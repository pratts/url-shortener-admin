import { expect, loginWithForm, loginWithToken, test } from "./fixtures.ts"
import { currentUser, saveUser } from "./state.ts"

test.describe.configure({ mode: "serial" })

test("change the name; the sidebar shows it", async ({ page, api }) => {
  const user = currentUser()
  const name = `E2E User ${Date.now()}`
  await loginWithToken(page, api, "/profile")

  await expect(page.getByLabel("Name")).toHaveValue(user.name)
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: "Save name" }).click()
  await expect(page.getByText("Name updated")).toBeVisible()
  saveUser(user.email, (u) => (u.name = name))

  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(name)
  await page.reload()
  await expect(page.getByLabel("Name")).toHaveValue(name)
})

test("change the password; a wrong current password shows on its field", async ({ page, api, guard }) => {
  const user = currentUser()
  const newPassword = `e2e-pw-${Date.now()}`
  guard.allow(403, "/users/me")
  await loginWithToken(page, api, "/profile")

  const current = page.getByLabel("Current password")
  await current.fill("definitely-not-the-password")
  await page.getByLabel("New password").fill(newPassword)
  await page.getByLabel("Confirm new password").fill(newPassword)
  const rejected = page.waitForResponse((r) => r.url().endsWith("/users/me") && r.request().method() === "PATCH")
  await page.getByRole("button", { name: "Change password" }).click()
  expect((await rejected).status()).toBe(403)
  await expect(page.getByText("Current password is incorrect")).toBeVisible()
  await expect(current).toHaveAttribute("aria-invalid", "true")
  await expect(page).toHaveURL(/\/profile$/) // a 403 is not a logout

  await current.fill(user.password)
  const accepted = page.waitForResponse((r) => r.url().endsWith("/users/me") && r.request().method() === "PATCH")
  await page.getByRole("button", { name: "Change password" }).click()
  expect((await accepted).status()).toBe(200)
  saveUser(user.email, (u) => (u.password = newPassword))
  await expect(page.getByText("Password changed")).toBeVisible()
  await expect(current).toHaveValue("")

  // Log out and back in with the new password.
  await page.getByRole("button", { name: "Log out" }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginWithForm(page, user.email, newPassword)
  await expect(page).toHaveURL(/\/urls$/)
})
