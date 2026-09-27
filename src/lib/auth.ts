// Token storage. Everything that reads or writes the token goes through here,
// so the storage mechanism can change without touching callers.

const TOKEN_KEY = "tidylnk.token"

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

function readStorage(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** The current token, or null if there is none or it has expired. */
export function getToken(): string | null {
  const token = readStorage()
  if (token && isExpired(token)) {
    clearToken()
    return null
  }
  return token
}

export function setToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } finally {
    notify()
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing stored if storage is unavailable.
  }
  notify()
}

export function subscribeToken(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * The token's `exp` claim in milliseconds since the epoch, or null if the
 * token is malformed or has no numeric `exp`. The signature is not checked;
 * the API does that.
 */
export function getTokenExpiry(token: string): number | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]))
    if (typeof payload !== "object" || payload === null) return null
    const exp = (payload as Record<string, unknown>).exp
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

/** Malformed tokens count as expired. */
export function isExpired(token: string, now = Date.now()): boolean {
  const expiry = getTokenExpiry(token)
  return expiry === null || expiry <= now
}
