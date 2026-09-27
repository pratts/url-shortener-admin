import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { connectSession } from "@/app"
import { Providers } from "@/components/providers"
import { createQueryClient } from "@/lib/query-client"
import { routes } from "@/routes"

/** Renders the whole app at `path`, with the real router and providers. */
export function renderApp(path: string) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  connectSession(router, queryClient)
  const user = userEvent.setup()
  const utils = render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  )
  const location = () => router.state.location.pathname + router.state.location.search
  return { ...utils, user, router, queryClient, location }
}
