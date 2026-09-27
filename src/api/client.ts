import { getToken } from "@/lib/auth"

const baseUrl = import.meta.env.VITE_API_BASE_URL
if (!baseUrl) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Copy .env.example to .env and set it, e.g. http://localhost:8086/api/v1"
  )
}
const BASE_URL = baseUrl.replace(/\/+$/, "")

export const GENERIC_ERROR = "Something went wrong. Please try again."
export const NETWORK_ERROR = "Could not reach the server. Check your connection and try again."
export const RATE_LIMIT_ERROR = "Too many attempts, try again later"

/**
 * Every failed request becomes an ApiError. `message` is always safe to show:
 * 5xx and network failures get a generic message instead of server text.
 * `status` is 0 for network errors.
 */
export class ApiError extends Error {
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fields = fields
  }

  get retryable() {
    return this.status === 0 || this.status >= 500
  }
}

/** Build an ApiError from a response status and its parsed JSON body. */
export function parseApiError(status: number, body: unknown): ApiError {
  if (status === 0) return new ApiError(0, NETWORK_ERROR)
  if (status >= 500) return new ApiError(status, GENERIC_ERROR)
  if (status === 429) return new ApiError(status, RATE_LIMIT_ERROR)

  let message = GENERIC_ERROR
  let fields: Record<string, string> | undefined
  if (typeof body === "object" && body !== null) {
    const { error, fields: rawFields } = body as Record<string, unknown>
    if (typeof error === "string" && error.trim()) message = error
    if (typeof rawFields === "object" && rawFields !== null) {
      const entries = Object.entries(rawFields).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
      if (entries.length > 0) fields = Object.fromEntries(entries)
    }
  }
  return new ApiError(status, message, fields)
}

let unauthorizedHandler: (() => void) | undefined

/**
 * Called when an authenticated request gets a 401 (the token expired or was
 * revoked), or can't be sent because there is no token.
 */
export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  unauthorizedHandler = handler
}

type RequestOptions = {
  body?: unknown
  /** Send the token and treat a 401 as an ended session. Default true. */
  auth?: boolean
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

export async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  { body, auth = true, query, signal }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const token = auth ? getToken() : null
  if (auth && !token) {
    // No token (logged out, expired, or cleared from storage): the API would
    // answer 401, so don't send it; end the session the same way. This also
    // stops refetches that fire while the session is ending.
    unauthorizedHandler?.()
    throw new ApiError(401, "Your session has ended. Please log in again.")
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  let url = BASE_URL + path
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw parseApiError(0, undefined)
  }

  if (response.ok) {
    if (response.status === 204) {
      // Nothing to parse, but read the empty body to the end: Chrome reports a
      // response whose body is never read as a cancelled request
      // (net::ERR_ABORTED), even though it succeeded.
      await response.text()
      return undefined as T
    }
    return (await response.json()) as T
  }

  let errorBody: unknown
  try {
    errorBody = await response.json()
  } catch {
    errorBody = undefined
  }

  if (response.status === 401 && auth) unauthorizedHandler?.()
  throw parseApiError(response.status, errorBody)
}
