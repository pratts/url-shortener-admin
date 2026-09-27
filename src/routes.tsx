import { redirect, type LoaderFunctionArgs, type RouteObject } from "react-router"
import { AppLayout } from "@/components/app-layout"
import { getToken } from "@/lib/auth"
import { safeNextPath } from "@/lib/session"
import Login from "@/pages/Login"
import NotFound from "@/pages/NotFound"
import Profile from "@/pages/Profile"
import Register from "@/pages/Register"
import Urls from "@/pages/Urls"

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

export const routes: RouteObject[] = [
  { path: "/", loader: () => redirect("/urls") },
  { path: "/login", loader: redirectIfLoggedIn, element: <Login /> },
  { path: "/register", element: <Register /> },
  {
    loader: requireAuth,
    element: <AppLayout />,
    children: [
      { path: "/urls", element: <Urls /> },
      { path: "/profile", element: <Profile /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]
