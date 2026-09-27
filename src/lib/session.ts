import type { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { clearToken } from "./auth"

// Ending a session touches the router and the query cache, which are created
// at startup (main.tsx, or the test harness) and registered here.
type SessionDeps = {
  queryClient: QueryClient
  navigate: (to: string) => Promise<void> | void
  currentPath: () => string
}

let deps: SessionDeps | undefined

export function configureSession(value: SessionDeps) {
  deps = value
}

/**
 * Log out on the client: clear the token, leave the private pages, then drop
 * all cached data. With `expired`, come back to the current page after the
 * next login and tell the user why they were logged out.
 */
export function endSession({ expired = false }: { expired?: boolean } = {}) {
  clearToken()
  if (!deps) return
  const { queryClient, navigate, currentPath } = deps

  const path = currentPath()
  const onPublicPage = path.startsWith("/login") || path.startsWith("/register")
  if (onPublicPage) {
    queryClient.clear()
    return
  }

  if (expired) {
    toast.info("Your session has expired. Please log in again.", { id: "session-expired" })
  }
  const target = expired ? `/login?next=${encodeURIComponent(path)}` : "/login"
  void Promise.resolve(navigate(target)).then(() => queryClient.clear())
}

/** A same-origin path to continue to after login; anything else falls back. */
export function safeNextPath(next: string | null | undefined, fallback = "/urls"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback
  }
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback
  return next
}
