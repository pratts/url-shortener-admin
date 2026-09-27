import type { DataRouter } from "react-router"
import type { QueryClient } from "@tanstack/react-query"
import { setUnauthorizedHandler } from "@/api/client"
import { configureSession, endSession } from "@/lib/session"

/** Wires session handling to a router and query client (app or tests). */
export function connectSession(router: DataRouter, queryClient: QueryClient) {
  configureSession({
    queryClient,
    navigate: (to) => router.navigate(to, { replace: true }),
    currentPath: () => router.state.location.pathname + router.state.location.search,
  })
  setUnauthorizedHandler(() => endSession({ expired: true }))
}
