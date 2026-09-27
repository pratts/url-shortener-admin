import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { test } from "@playwright/test"

// Users created by the suite, and every rate-limited request it made, kept
// between runs (gitignored). The suite reuses its users and never sends a
// request that would exceed one of the API's rate limits: it waits for the
// window to pass instead. Requests from anything else on this machine (manual
// testing, scripts) count against the same limits but aren't recorded here:
// add them to e2e/.state/state.json by hand, or wait for the window to pass.

export type E2EUser = {
  email: string
  password: string
  name: string
  token?: string
  tokenExpiresAt?: number
}

type State = {
  users: E2EUser[]
  /** Timestamps (ms) of attempts, per budget key, e.g. "register" or "create:<email>". */
  attempts: Record<string, number[]>
}

const FILE = path.join(import.meta.dirname, ".state", "state.json")

// docs/API.md, "Rate limits". Every attempt counts, whatever its status,
// including requests the limiter rejects.
//
// The backend uses a sliding-window approximation (Fiber's SlidingWindow): it
// counts hits in fixed buckets of one window, and adds the previous bucket's
// hits weighted by how much of the current bucket is left. A burst therefore
// keeps counting well into the next window, so "at most max in the last
// window" is not enough. Counting over two windows is: then the previous and
// current buckets together never hold more than max, wherever they start.
const WINDOWS_COUNTED = 2

// Each budget keeps one attempt spare, as a margin for requests made outside
// the suite.
const BUDGETS = {
  /** POST /users/register: 5 per hour per IP. */
  register: { max: 5 - 1, windowMs: 60 * 60_000 },
  /** POST /users/login: 20 per 15 minutes per IP. */
  login: { max: 20 - 1, windowMs: 15 * 60_000 },
  /** POST /users/login: 5 failed attempts per 15 minutes per email. */
  loginFailed: { max: 5 - 1, windowMs: 15 * 60_000 },
  /** POST /urls: 30 per minute per user. */
  create: { max: 30 - 1, windowMs: 60_000 },
} as const

export type Budget = keyof typeof BUDGETS

const key = (budget: Budget, scope?: string) => (scope ? `${budget}:${scope}` : budget)

export function readState(): State {
  try {
    const state = JSON.parse(readFileSync(FILE, "utf8")) as State
    return { users: state.users ?? [], attempts: state.attempts ?? {} }
  } catch {
    return { users: [], attempts: {} }
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

function recent(budget: Budget, scope: string | undefined, now: number) {
  const span = BUDGETS[budget].windowMs * WINDOWS_COUNTED
  return (readState().attempts[key(budget, scope)] ?? []).filter((t) => now - t < span)
}

export function attemptsLeft(budget: Budget, scope?: string, now = Date.now()) {
  return BUDGETS[budget].max - recent(budget, scope, now).length
}

/** Record an attempt that has already been made (e.g. a failed login). */
export function recordAttempt(budget: Budget, scope?: string) {
  const now = Date.now()
  updateState((state) => {
    state.attempts[key(budget, scope)] = [...recent(budget, scope, now), now]
  })
}

/** Undo the most recent reservation (for budgets that only count failures). */
export function releaseLast(budget: Budget, scope?: string) {
  updateState((state) => {
    state.attempts[key(budget, scope)] = (state.attempts[key(budget, scope)] ?? []).slice(0, -1)
  })
}

/**
 * Wait until the budget allows one more request, then record it. Call right
 * before sending the request. Inside a test, the test's timeout is extended by
 * the time spent waiting.
 */
export async function acquire(budget: Budget, scope?: string) {
  for (;;) {
    const now = Date.now()
    const inWindow = recent(budget, scope, now)
    if (inWindow.length < BUDGETS[budget].max) {
      recordAttempt(budget, scope)
      return
    }
    const waitMs = Math.min(...inWindow) + BUDGETS[budget].windowMs * WINDOWS_COUNTED - now + 1_000
    console.log(
      `[rate limit] ${key(budget, scope)}: budget used; waiting ${Math.ceil(waitMs / 1000)}s for the window`
    )
    try {
      const info = test.info()
      info.setTimeout(info.timeout + waitMs)
    } catch {
      // Not inside a test (e.g. global setup); nothing to extend.
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
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
