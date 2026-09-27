import { QueryClient } from "@tanstack/react-query"
import { ApiError } from "@/api/client"

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Only retry failures that might succeed a second time.
        retry: (failureCount, error) =>
          failureCount < 2 && error instanceof ApiError && error.retryable,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  })
}
