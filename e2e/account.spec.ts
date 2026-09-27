import { expect, loginWithForm, loginWithToken, test } from "./fixtures.ts"
import { RATE_LIMITS } from "./env.ts"
import { acquire, currentUser, readState, updateState } from "./state.ts"

test.describe.configure({ mode: "serial" })

test("register lands logged in", async ({ page }) => {
  const { users } = readState()
  // With rate limits on, registrations are scarce (5 per hour per IP, every
  // attempt counts), so once a user exists a new one is only made on request.
  // With them off, every run registers a fresh user.
  test.skip(
    RATE_LIMITS && users.length > 0 && process.env.E2E_NEW_USER !== "1",
    `Reusing ${users.at(-1)?.email}; set E2E_NEW_USER=1 to register another.`
  )

  const stamp = Date.now()
  const user = { email: `e2e-${stamp}@example.com`, password: `e2e-pw-${stamp}`, name: "E2E User" }

  await page.goto("/register")
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Name").fill(user.name)
  await page.getByLabel("Password", { exact: true }).fill(user.password)
  await page.getByLabel("Confirm password").fill(user.password)

  await acquire("register")
  await acquire("login") // registering logs in with the same credentials
  const registered = page.waitForResponse((r) => r.url().endsWith("/users/register"))
  await page.getByRole("button", { name: "Create account" }).click()
  expect((await registered).status()).toBe(201)
  updateState((state) => state.users.push(user))

  await expect(page).toHaveURL(/\/urls$/)
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(user.email)
  expect(await page.evaluate(() => sessionStorage.getItem("tidylnk.token"))).toBeTruthy()
})

test("log out, then log in again", async ({ page, api }) => {
  const user = currentUser()
  await loginWithToken(page, api)
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(user.email)

  await page.getByRole("button", { name: "Log out" }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => sessionStorage.getItem("tidylnk.token"))).toBeNull()

  // Private pages now send you to log in, and back afterwards.
  await page.goto("/profile")
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/)
  await loginWithForm(page, user.email, user.password)
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByLabel("Email")).toHaveValue(user.email)
})

test("register shows field errors before submitting", async ({ page }) => {
  let requests = 0
  page.on("request", (r) => {
    if (r.url().endsWith("/users/register")) requests++
  })
  await page.goto("/register")
  await page.getByLabel("Email").fill("not-an-email")
  await page.getByLabel("Password", { exact: true }).fill("short")
  await page.getByLabel("Confirm password").fill("different")
  await page.getByRole("button", { name: "Create account" }).click()

  await expect(page.getByText("Enter a valid email address")).toBeVisible()
  await expect(page.getByText("Name is required")).toBeVisible()
  await expect(page.getByText("Password must be at least 8 characters")).toBeVisible()
  await expect(page.getByText("Passwords do not match")).toBeVisible()
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true")

  // 37 characters but 74 bytes: rejected, because the API limit is 72 bytes.
  // (A fresh form: after a failed submit the form moves focus to the first
  // invalid field, which can race with typing into another one.)
  await page.reload()
  await page.getByLabel("Email").fill("someone@example.com")
  await page.getByLabel("Name").fill("Someone")
  await page.getByLabel("Password", { exact: true }).fill("é".repeat(37))
  await page.getByLabel("Confirm password").fill("é".repeat(37))
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText(/Password is too long/)).toBeVisible()
  await expect(page.getByLabel("Email")).not.toHaveAttribute("aria-invalid", "true")
  expect(requests, "invalid input must not reach the API").toBe(0)
})

test("register with an existing email shows 409 on the email field", async ({ page, guard }) => {
  const user = currentUser()
  guard.allow(409, "/users/register")

  await page.goto("/register")
  await page.getByLabel("Email").fill(user.email.toUpperCase())
  await page.getByLabel("Name").fill("Someone Else")
  await page.getByLabel("Password", { exact: true }).fill("another-password")
  await page.getByLabel("Confirm password").fill("another-password")
  await acquire("register") // a 409 counts against the limit too
  const response = page.waitForResponse((r) => r.url().endsWith("/users/register"))
  await page.getByRole("button", { name: "Create account" }).click()
  expect((await response).status()).toBe(409)

  await expect(page.getByText("Email is already registered")).toBeVisible()
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true")
  await expect(page).toHaveURL(/\/register$/)
})
