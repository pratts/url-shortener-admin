import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// Users created by the suite and the rate-limited requests it made, kept
// between runs (gitignored) so repeated runs reuse users and stay inside the
// API's rate limits instead of hitting a 429.

export type E2EUser = {
  email: string
  password: string
  name: string
  token?: string
  tokenExpiresAt?: number
}

type State = {
  users: E2EUser[]
  attempts: { register: number[]; login: number[] }
}

const FILE = path.join(import.meta.dirname, ".state", "state.json")

// docs/API.md, "Rate limits" (per IP), minus one spare attempt each: other
// requests from this IP (a manual signup, a script) count against the same
// limit, and a 429 would stop the run.
export const LIMITS = {
  register: { max: 5 - 1, windowMs: 60 * 60_000 },
  login: { max: 20 - 1, windowMs: 15 * 60_000 },
} as const

/** The suite creates at most this many users in total. */
export const MAX_USERS = 2

export function readState(): State {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as State
  } catch {
    return { users: [], attempts: { register: [], login: [] } }
  }
}

function writeState(state: State) {
  mkdirSync(path.dirname(FILE), { recursive: true })
  writeFileSync(FILE, JSON.stringify(state, null, 2) + "\n")
}

export function updateState(change: (state: State) => void) {
  const state = readState()
  change(state)
  writeState(state)
}

export function attemptsLeft(kind: keyof typeof LIMITS, now = Date.now()) {
  const { max, windowMs } = LIMITS[kind]
  return max - readState().attempts[kind].filter((t) => now - t < windowMs).length
}

/** Records an attempt, or throws before making one that would exceed the limit. */
export function spendAttempt(kind: keyof typeof LIMITS) {
  if (attemptsLeft(kind) < 1) {
    const { windowMs } = LIMITS[kind]
    const oldest = Math.min(...readState().attempts[kind].filter((t) => Date.now() - t < windowMs))
    throw new Error(
      `No ${kind} attempts left in the rate-limit window; try again after ${new Date(oldest + windowMs).toISOString()}.`
    )
  }
  updateState((state) => {
    const { windowMs } = LIMITS[kind]
    state.attempts[kind] = [...state.attempts[kind].filter((t) => Date.now() - t < windowMs), Date.now()]
  })
}

export function currentUser(): E2EUser {
  const user = readState().users.at(-1)
  if (!user) throw new Error("No e2e user yet: the account tests register one; run the whole suite.")
  return user
}

export function saveUser(email: string, change: (user: E2EUser) => void) {
  updateState((state) => {
    const user = state.users.find((u) => u.email === email)
    if (!user) throw new Error(`Unknown e2e user ${email}`)
    change(user)
  })
}
