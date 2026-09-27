export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8086/api/v1"
export const PROD = process.env.E2E_TARGET === "prod"

/**
 * E2E_RATE_LIMITS=on (default): the backend enforces its rate limits, so the
 * suite budgets every limited request and waits instead of exceeding a limit.
 * E2E_RATE_LIMITS=off: the backend runs with RATE_LIMITS=off; no budgeting or
 * waiting, a fresh user per run, and any 429 is a hard failure.
 */
export const RATE_LIMITS = (() => {
  const value = (process.env.E2E_RATE_LIMITS ?? "on").toLowerCase()
  if (value !== "on" && value !== "off") {
    throw new Error(`E2E_RATE_LIMITS must be "on" or "off", not "${value}"`)
  }
  return value === "on"
})()

export const RATE_LIMITED_MESSAGE = RATE_LIMITS
  ? "stop and wait for the window to pass"
  : "backend rate limits are on; start it with RATE_LIMITS=off or run with E2E_RATE_LIMITS=on"
