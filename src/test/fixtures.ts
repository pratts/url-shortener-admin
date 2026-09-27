import type { Profile } from "@/api/users"
import type { Session } from "@/api/auth"
import type { ShortLink } from "@/api/urls"
import { makeToken } from "./jwt"

export const alice: Profile = { id: 1, email: "alice@example.com", name: "Alice", verified: false }

export function aliceSession(): Session {
  return { ...alice, token: makeToken() }
}

export function link(id: number, overrides: Partial<ShortLink> = {}): ShortLink {
  const code = `code${id}`.padEnd(7, "x").slice(0, 7)
  return {
    id,
    url: `https://example.com/page/${id}`,
    short_code: code,
    short_url: `https://sho.rt/${code}`,
    created_at: "2026-09-26T04:30:00Z",
    updated_at: "2026-09-26T04:30:00Z",
    created_by: 1,
    ...overrides,
  }
}
