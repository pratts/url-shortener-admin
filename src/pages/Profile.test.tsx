import { screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import type { Profile } from "@/api/users"
import { getToken, setToken } from "@/lib/auth"
import { alice } from "@/test/fixtures"
import { makeToken } from "@/test/jwt"
import { renderApp } from "@/test/render-app"
import { API, server } from "@/test/server"

let current: Profile

beforeEach(() => {
  setToken(makeToken())
  current = { ...alice }
  server.use(http.get(`${API}/users/me`, () => HttpResponse.json(current)))
})

function card(heading: string) {
  return within(screen.getByRole("heading", { name: heading }).closest("form")!)
}

describe("Profile page", () => {
  it("changes the name and updates the sidebar from the response", async () => {
    let body: unknown
    server.use(
      http.patch(`${API}/users/me`, async ({ request }) => {
        body = await request.json()
        current = { ...current, name: "Alice B" }
        return HttpResponse.json(current)
      })
    )
    const { user } = renderApp("/profile")

    const name = await screen.findByLabelText("Name")
    expect(name).toHaveValue("Alice")
    await user.clear(name)
    await user.type(name, "  Alice B ")
    await user.click(screen.getByRole("button", { name: "Save name" }))

    expect(await screen.findByText("Name updated")).toBeInTheDocument()
    expect(body).toEqual({ name: "Alice B" })
    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("Alice B")
  })

  it("changes the password with the current password", async () => {
    let body: unknown
    server.use(
      http.patch(`${API}/users/me`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(current)
      })
    )
    const { user } = renderApp("/profile")

    await user.type(await screen.findByLabelText("Current password"), "correct-horse")
    await user.type(screen.getByLabelText("New password"), "new-password")
    await user.type(screen.getByLabelText("Confirm new password"), "new-password")
    await user.click(screen.getByRole("button", { name: "Change password" }))

    expect(await screen.findByText("Password changed")).toBeInTheDocument()
    expect(body).toEqual({ current_password: "correct-horse", password: "new-password" })
    expect(screen.getByLabelText("Current password")).toHaveValue("")
    expect(getToken()).not.toBeNull()
  })

  it("shows 403 on the current password field", async () => {
    server.use(
      http.patch(`${API}/users/me`, () =>
        HttpResponse.json({ error: "current password is incorrect" }, { status: 403 })
      )
    )
    const { user, location } = renderApp("/profile")

    await user.type(await screen.findByLabelText("Current password"), "wrong-password")
    await user.type(screen.getByLabelText("New password"), "new-password")
    await user.type(screen.getByLabelText("Confirm new password"), "new-password")
    await user.click(screen.getByRole("button", { name: "Change password" }))

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument()
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true")
    expect(location()).toBe("/profile")
    expect(getToken()).not.toBeNull()
  })

  it("shows 'name or password is required' as a form-level error", async () => {
    server.use(
      http.patch(`${API}/users/me`, () =>
        HttpResponse.json(
          { error: "Validation failed", fields: { name: "or password is required" } },
          { status: 400 }
        )
      )
    )
    const { user } = renderApp("/profile")
    const name = await screen.findByLabelText("Name")
    await user.type(name, "!")
    await user.click(screen.getByRole("button", { name: "Save name" }))

    expect(await card("Account").findByRole("alert")).toHaveTextContent("Name or password is required")
    expect(name).not.toHaveAttribute("aria-invalid", "true")
  })

  it("shows the email as read-only", async () => {
    renderApp("/profile")
    const email = await screen.findByLabelText("Email")
    expect(email).toHaveValue("alice@example.com")
    expect(email).toHaveAttribute("readonly")
  })

  it("redirects to /login on 401", async () => {
    server.use(
      http.patch(`${API}/users/me`, () => HttpResponse.json({ error: "Invalid token" }, { status: 401 }))
    )
    const { user, location } = renderApp("/profile")
    const name = await screen.findByLabelText("Name")
    await user.type(name, "x")
    await user.click(screen.getByRole("button", { name: "Save name" }))
    await waitFor(() => expect(location()).toBe("/login?next=%2Fprofile"))
  })
})
