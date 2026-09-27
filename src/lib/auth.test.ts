import { describe, expect, it, vi } from "vitest"
import { makeToken } from "@/test/jwt"
import {
  clearToken,
  getToken,
  getTokenExpiry,
  isExpired,
  setToken,
  subscribeToken,
} from "./auth"

describe("token storage", () => {
  it("stores the token in sessionStorage under tidylnk.token", () => {
    const token = makeToken()
    setToken(token)
    expect(sessionStorage.getItem("tidylnk.token")).toBe(token)
    expect(localStorage.length).toBe(0)
    expect(getToken()).toBe(token)
  })

  it("clears the token", () => {
    setToken(makeToken())
    clearToken()
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem("tidylnk.token")).toBeNull()
  })

  it("treats an expired token as absent and removes it", () => {
    sessionStorage.setItem("tidylnk.token", makeToken(-10))
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem("tidylnk.token")).toBeNull()
  })

  it("treats a malformed token as absent", () => {
    sessionStorage.setItem("tidylnk.token", "not-a-jwt")
    expect(getToken()).toBeNull()
  })

  it("notifies subscribers on change", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToken(listener)
    setToken(makeToken())
    clearToken()
    unsubscribe()
    setToken(makeToken())
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("getTokenExpiry", () => {
  it("reads exp from the payload in milliseconds", () => {
    const now = Date.UTC(2026, 8, 26, 4, 30)
    expect(getTokenExpiry(makeToken(3600, now))).toBe(now + 3600 * 1000)
  })

  it("decodes base64url payloads with - and _ characters", () => {
    // This payload encodes to base64url containing "_".
    const payload = btoa(JSON.stringify({ exp: 1790000000, n: "??>" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(getTokenExpiry(`h.${payload}.s`)).toBe(1790000000 * 1000)
  })

  it("returns null for malformed tokens or missing exp", () => {
    expect(getTokenExpiry("abc")).toBeNull()
    expect(getTokenExpiry("a.!!!.c")).toBeNull()
    expect(getTokenExpiry(`a.${btoa(JSON.stringify({ sub: "1" }))}.c`)).toBeNull()
    expect(getTokenExpiry(`a.${btoa(JSON.stringify({ exp: "soon" }))}.c`)).toBeNull()
  })
})

describe("isExpired", () => {
  it("compares exp with now", () => {
    const now = Date.now()
    expect(isExpired(makeToken(60, now), now)).toBe(false)
    expect(isExpired(makeToken(0, now), now)).toBe(true)
    expect(isExpired("garbage", now)).toBe(true)
  })
})
