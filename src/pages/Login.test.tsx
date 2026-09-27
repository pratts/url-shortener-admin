import { screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { getToken, setToken } from "@/lib/auth"
import { makeToken } from "@/test/jwt"
import { alice, aliceSession } from "@/test/fixtures"
import { renderApp } from "@/test/render-app"
import { API, server } from "@/test/server"

const emptyPage = () => HttpResponse.json({ items: [], next_cursor: null })

describe("Login", () => {
  it("logs in with the password as typed and goes to /urls", async () => {
    let body: unknown
    server.use(
      http.post(`${API}/users/login`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(aliceSession())
      }),
      http.get(`${API}/urls`, emptyPage)
    )
    const { user, location } = renderApp("/login")

    await user.type(await screen.findByLabelText("Email"), "  Alice@Example.com ")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Log in" }))

    await waitFor(() => expect(location()).toBe("/urls"))
    expect(body).toEqual({ email: "Alice@Example.com", password: "correct-horse" })
    expect(getToken()).not.toBeNull()
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument()
  })

  it("shows 'Invalid email or password' on 401", async () => {
    server.use(
      http.post(`${API}/users/login`, () =>
        HttpResponse.json({ error: "Invalid email or password" }, { status: 401 })
      )
    )
    const { user, location } = renderApp("/login")

    await user.type(await screen.findByLabelText("Email"), "alice@example.com")
    await user.type(screen.getByLabelText("Password"), "wrong-password")
    await user.click(screen.getByRole("button", { name: "Log in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password")
    expect(location()).toBe("/login")
    expect(getToken()).toBeNull()
  })

  it("shows the rate-limit message on 429", async () => {
    server.use(
      http.post(`${API}/users/login`, () =>
        HttpResponse.json({ error: "Too many requests, please try again later" }, { status: 429 })
      )
    )
    const { user } = renderApp("/login")
    await user.type(await screen.findByLabelText("Email"), "alice@example.com")
    await user.type(screen.getByLabelText("Password"), "whatever")
    await user.click(screen.getByRole("button", { name: "Log in" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts, try again later")
  })

  it("validates before submitting", async () => {
    const { user } = renderApp("/login")
    await user.type(await screen.findByLabelText("Email"), "not-an-email")
    await user.click(screen.getByRole("button", { name: "Log in" }))
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument()
    expect(screen.getByText("Password is required")).toBeInTheDocument()
  })

  it("returns to the requested page after login", async () => {
    server.use(
      http.post(`${API}/users/login`, () => HttpResponse.json(aliceSession())),
      http.get(`${API}/users/me`, () => HttpResponse.json(alice))
    )
    const { user, location } = renderApp("/profile")
    await waitFor(() => expect(location()).toBe("/login?next=%2Fprofile"))

    await user.type(await screen.findByLabelText("Email"), "alice@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Log in" }))
    await waitFor(() => expect(location()).toBe("/profile"))
  })

  it("ignores next values that leave the site", async () => {
    server.use(
      http.post(`${API}/users/login`, () => HttpResponse.json(aliceSession())),
      http.get(`${API}/urls`, emptyPage)
    )
    const { user, location } = renderApp("/login?next=//evil.example")
    await user.type(await screen.findByLabelText("Email"), "alice@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Log in" }))
    await waitFor(() => expect(location()).toBe("/urls"))
  })

  it("redirects to /urls when already logged in", async () => {
    setToken(makeToken())
    server.use(http.get(`${API}/urls`, emptyPage), http.get(`${API}/users/me`, () => HttpResponse.json(alice)))
    const { location } = renderApp("/login")
    await waitFor(() => expect(location()).toBe("/urls"))
  })
})

describe("session", () => {
  it("redirects to /login with next when an authenticated request gets a 401", async () => {
    setToken(makeToken())
    server.use(
      http.get(`${API}/users/me`, () => HttpResponse.json({ error: "Invalid token" }, { status: 401 })),
      http.get(`${API}/urls`, () => HttpResponse.json({ error: "Invalid token" }, { status: 401 }))
    )
    const { location } = renderApp("/urls")

    await waitFor(() => expect(location()).toBe("/login?next=%2Furls"))
    expect(getToken()).toBeNull()
    expect(await screen.findByLabelText("Email")).toBeInTheDocument()
  })

  it("redirects to /login with next when the token disappears mid-session", async () => {
    setToken(makeToken())
    server.use(
      http.get(`${API}/users/me`, () => HttpResponse.json(alice)),
      http.get(`${API}/urls`, emptyPage),
      http.post(`${API}/urls`, ({ request }) =>
        request.headers.get("authorization")
          ? HttpResponse.json({ error: "unexpected" }, { status: 500 })
          : HttpResponse.json({ error: "Authorization header is missing" }, { status: 401 })
      )
    )
    const { user, location } = renderApp("/urls")
    await user.click(await screen.findByRole("button", { name: "Create your first link" }))
    sessionStorage.clear()
    await user.type(await screen.findByLabelText("Target URL"), "https://example.com/x")
    await user.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(location()).toBe("/login?next=%2Furls"))
  })

  it("redirects to /login when there is no token", async () => {
    const { location } = renderApp("/urls")
    await waitFor(() => expect(location()).toBe("/login?next=%2Furls"))
  })

  it("treats an expired token as logged out", async () => {
    sessionStorage.setItem("tidylnk.token", makeToken(-5))
    const { location } = renderApp("/urls")
    await waitFor(() => expect(location()).toBe("/login?next=%2Furls"))
  })

  it("logs out when the token expires", async () => {
    setToken(makeToken(1))
    server.use(http.get(`${API}/urls`, emptyPage), http.get(`${API}/users/me`, () => HttpResponse.json(alice)))
    const { location } = renderApp("/urls")
    await screen.findByText("alice@example.com")
    await waitFor(() => expect(location()).toBe("/login?next=%2Furls"), { timeout: 3000 })
    expect(getToken()).toBeNull()
  })

  it("logs out from the sidebar", async () => {
    setToken(makeToken())
    server.use(http.get(`${API}/urls`, emptyPage), http.get(`${API}/users/me`, () => HttpResponse.json(alice)))
    const { user, location, queryClient } = renderApp("/urls")
    await screen.findByText("alice@example.com")

    await user.click(screen.getByRole("button", { name: "Log out" }))
    await waitFor(() => expect(location()).toBe("/login"))
    expect(getToken()).toBeNull()
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0))
  })
})
