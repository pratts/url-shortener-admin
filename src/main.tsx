import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { connectSession } from "@/app"
import { Providers } from "@/components/providers"
import { createQueryClient } from "@/lib/query-client"
import { routes } from "@/routes"
import "./index.css"

const queryClient = createQueryClient()
const router = createBrowserRouter(routes)
connectSession(router, queryClient)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
)
