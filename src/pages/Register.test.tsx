import { screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { getToken } from "@/lib/auth"
import { alice, aliceSession } from "@/test/fixtures"
import { renderApp } from "@/test/render-app"
import { API, server } from "@/test/server"

async function fillForm(user: ReturnType<typeof renderApp>["user"], password = "correct-horse") {
  await user.type(await screen.findByLabelText("Email"), "alice@example.com")
  await user.type(screen.getByLabelText("Name"), "Alice")
  await user.type(screen.getByLabelText("Password"), password)
  await user.type(screen.getByLabelText("Confirm password"), password)
  await user.click(screen.getByRole("button", { name: "Create account" }))
}

describe("Register", () => {
  it("registers, logs in with the same credentials and goes to /urls", async () => {
    const calls: unknown[] = []
    server.use(
      http.post(`${API}/users/register`, async ({ request }) => {
        calls.push(await request.json())
        return HttpResponse.json(alice, { status: 201 })
      }),
      http.post(`${API}/users/login`, async ({ request }) => {
        calls.push(await request.json())
        return HttpResponse.json(aliceSession())
      }),
      http.get(`${API}/urls`, () => HttpResponse.json({ items: [], next_cursor: null }))
    )
    const { user, location } = renderApp("/register")
    await fillForm(user)

    await waitFor(() => expect(location()).toBe("/urls"))
    expect(calls).toEqual([
      { email: "alice@example.com", name: "Alice", password: "correct-horse" },
      { email: "alice@example.com", password: "correct-horse" },
    ])
    expect(getToken()).not.toBeNull()
  })

  it("shows server field errors next to the inputs", async () => {
    server.use(
      http.post(`${API}/users/register`, () =>
        HttpResponse.json(
          {
            error: "Validation failed",
            fields: { email: "must be a valid email address", password: "must be between 8 and 72 bytes" },
          },
          { status: 400 }
        )
      )
    )
    const { user } = renderApp("/register")
    await fillForm(user)

    expect(await screen.findByText("Email must be a valid email address")).toBeInTheDocument()
    expect(screen.getByText("Password must be between 8 and 72 bytes")).toBeInTheDocument()
  })

  it("shows 409 on the email field", async () => {
    server.use(
      http.post(`${API}/users/register`, () =>
        HttpResponse.json(
          { error: "email is already registered", fields: { email: "is already registered" } },
          { status: 409 }
        )
      )
    )
    const { user, location } = renderApp("/register")
    await fillForm(user)

    expect(await screen.findByText("Email is already registered")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true")
    expect(location()).toBe("/register")
  })

  it("validates the password length in bytes and the confirmation", async () => {
    const { user } = renderApp("/register")
    await user.type(await screen.findByLabelText("Email"), "alice@example.com")
    await user.type(screen.getByLabelText("Name"), "Alice")
    await user.type(screen.getByLabelText("Password"), "short")
    await user.type(screen.getByLabelText("Confirm password"), "different")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument()
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
  })

  it("sends the user to log in if the account was created but login failed", async () => {
    server.use(
      http.post(`${API}/users/register`, () => HttpResponse.json(alice, { status: 201 })),
      http.post(`${API}/users/login`, () =>
        HttpResponse.json({ error: "Too many requests, please try again later" }, { status: 429 })
      )
    )
    const { user, location } = renderApp("/register")
    await fillForm(user)
    await waitFor(() => expect(location()).toBe("/login"))
    expect(await screen.findByText("Account created. Log in to continue.")).toBeInTheDocument()
  })
})
