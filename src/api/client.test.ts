import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearToken, setToken } from "@/lib/auth"
import { API, server } from "@/test/server"
import { makeToken } from "@/test/jwt"
import {
  ApiError,
  GENERIC_ERROR,
  NETWORK_ERROR,
  RATE_LIMIT_ERROR,
  parseApiError,
  request,
  setUnauthorizedHandler,
} from "./client"

describe("parseApiError", () => {
  it("reads error and fields", () => {
    const error = parseApiError(400, {
      error: "Validation failed",
      fields: { email: "must be a valid email address", bogus: 3 },
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.message).toBe("Validation failed")
    expect(error.fields).toEqual({ email: "must be a valid email address" })
  })

  it("leaves fields undefined when absent", () => {
    expect(parseApiError(404, { error: "URL not found" }).fields).toBeUndefined()
  })

  it("never exposes 5xx server text", () => {
    const error = parseApiError(500, { error: "pq: connection refused" })
    expect(error.message).toBe(GENERIC_ERROR)
    expect(error.retryable).toBe(true)
  })

  it("uses a fixed message for 429", () => {
    expect(parseApiError(429, { error: "Too many requests, please try again later" }).message).toBe(
      RATE_LIMIT_ERROR
    )
  })

  it("handles bodies that aren't the error shape", () => {
    expect(parseApiError(400, "oops").message).toBe(GENERIC_ERROR)
    expect(parseApiError(400, null).message).toBe(GENERIC_ERROR)
    expect(parseApiError(0, undefined).message).toBe(NETWORK_ERROR)
  })
})

describe("request", () => {
  // Authenticated requests need a token (without one they aren't sent).
  beforeEach(() => setToken(makeToken()))

  it("sends Authorization only on authenticated requests and Content-Type only with a body", async () => {
    const seen: Headers[] = []
    server.use(
      http.all(`${API}/*`, ({ request }) => {
        seen.push(request.headers)
        return HttpResponse.json({ ok: true })
      })
    )

    await request("GET", "/urls", { auth: false })
    await request("GET", "/urls")
    await request("POST", "/urls", { body: { url: "https://example.com" } })

    expect(seen[0].get("authorization")).toBeNull()
    expect(seen[0].get("content-type")).toBeNull()
    expect(seen[1].get("authorization")).toMatch(/^Bearer /)
    expect(seen[1].get("content-type")).toBeNull()
    expect(seen[2].get("content-type")).toBe("application/json")
  })

  it("doesn't send the token when auth is false", async () => {
    setToken(makeToken())
    let authorization: string | null = "unset"
    server.use(
      http.post(`${API}/users/login`, ({ request }) => {
        authorization = request.headers.get("authorization")
        return HttpResponse.json({})
      })
    )
    await request("POST", "/users/login", { body: {}, auth: false })
    expect(authorization).toBeNull()
  })

  it("builds query strings and skips undefined values", async () => {
    let url = ""
    server.use(
      http.get(`${API}/urls`, ({ request }) => {
        url = request.url
        return HttpResponse.json({ items: [], next_cursor: null })
      })
    )
    await request("GET", "/urls", { query: { limit: 20, cursor: undefined } })
    expect(new URL(url).search).toBe("?limit=20")
  })

  it("reads a 204's empty body to the end instead of leaving it unread", async () => {
    const response = new Response(null, { status: 204 })
    const text = vi.spyOn(response, "text")
    const json = vi.spyOn(response, "json")
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response)
    try {
      await expect(request("DELETE", "/urls/1")).resolves.toBeUndefined()
    } finally {
      fetchSpy.mockRestore()
    }
    expect(text).toHaveBeenCalledOnce()
    expect(json).not.toHaveBeenCalled()
  })

  it("returns undefined for 204 without parsing", async () => {
    server.use(http.delete(`${API}/urls/1`, () => new HttpResponse(null, { status: 204 })))
    await expect(request("DELETE", "/urls/1")).resolves.toBeUndefined()
  })

  it("throws ApiError with fields", async () => {
    server.use(
      http.post(`${API}/users/register`, () =>
        HttpResponse.json(
          { error: "email is already registered", fields: { email: "is already registered" } },
          { status: 409 }
        )
      )
    )
    await expect(request("POST", "/users/register", { body: {}, auth: false })).rejects.toMatchObject({
      status: 409,
      fields: { email: "is already registered" },
    })
  })

  it("maps network failures to status 0", async () => {
    server.use(http.get(`${API}/urls`, () => HttpResponse.error()))
    await expect(request("GET", "/urls")).rejects.toMatchObject({ status: 0, message: NETWORK_ERROR })
  })

  it("calls the unauthorized handler on 401 for authenticated requests only", async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    server.use(
      http.get(`${API}/users/me`, () => HttpResponse.json({ error: "Invalid token" }, { status: 401 })),
      http.post(`${API}/users/login`, () =>
        HttpResponse.json({ error: "Invalid email or password" }, { status: 401 })
      )
    )

    await expect(request("POST", "/users/login", { body: {}, auth: false })).rejects.toMatchObject({
      status: 401,
      message: "Invalid email or password",
    })
    expect(handler).not.toHaveBeenCalled()

    setToken(makeToken())
    await expect(request("GET", "/users/me")).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)

    setUnauthorizedHandler(undefined)
  })

  it("doesn't send an authenticated request without a token, and ends the session instead", async () => {
    clearToken() // e.g. the token vanished from storage mid-session
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    const sent: string[] = []
    server.use(
      http.all(`${API}/*`, ({ request }) => {
        sent.push(`${request.method} ${new URL(request.url).pathname}`)
        return HttpResponse.json({ error: "Authorization header is missing" }, { status: 401 })
      })
    )

    await expect(request("GET", "/users/me")).rejects.toMatchObject({ status: 401 })
    await expect(request("POST", "/urls", { body: { url: "https://example.com" } })).rejects.toMatchObject({
      status: 401,
    })
    expect(sent).toEqual([])
    expect(handler).toHaveBeenCalledTimes(2)

    // Login and register don't need a token and are still sent.
    await expect(request("POST", "/users/login", { body: {}, auth: false })).rejects.toMatchObject({ status: 401 })
    expect(sent).toEqual(["POST /api/v1/users/login"])
    expect(handler).toHaveBeenCalledTimes(2)
    setUnauthorizedHandler(undefined)
  })
})
