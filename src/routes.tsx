import { redirect, type LoaderFunctionArgs, type RouteObject } from "react-router"
import { getToken } from "@/lib/auth"
import { safeNextPath } from "@/lib/session"

/** Private pages: without a (non-expired) token, go to /login and come back after. */
function requireAuth({ request }: LoaderFunctionArgs) {
  if (getToken()) return null
  const { pathname, search } = new URL(request.url)
  throw redirect(`/login?next=${encodeURIComponent(pathname + search)}`)
}

function redirectIfLoggedIn({ request }: LoaderFunctionArgs) {
  if (!getToken()) return null
  throw redirect(safeNextPath(new URL(request.url).searchParams.get("next")))
}

// Every page, and the private layout, is its own chunk: the login page doesn't
// download the sidebar or the links page, and the main chunk holds only the
// runtime (React, the router, TanStack Query, providers). Guards stay here so
// redirects happen before any page code loads.
const page = (load: () => Promise<{ default: React.ComponentType }>) => () =>
  load().then((m) => ({ Component: m.default }))

export const routes: RouteObject[] = [
  { path: "/", loader: () => redirect("/urls") },
  { path: "/login", loader: redirectIfLoggedIn, lazy: page(() => import("@/pages/Login")) },
  { path: "/register", lazy: page(() => import("@/pages/Register")) },
  {
    loader: requireAuth,
    lazy: () => import("@/components/app-layout").then((m) => ({ Component: m.AppLayout })),
    children: [
      { path: "/urls", lazy: page(() => import("@/pages/Urls")) },
      { path: "/profile", lazy: page(() => import("@/pages/Profile")) },
    ],
  },
  { path: "*", lazy: page(() => import("@/pages/NotFound")) },
]
