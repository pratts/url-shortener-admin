import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { useMemo } from "react"
import {
  createUrl,
  deleteUrl,
  listUrls,
  updateUrl,
  type ShortLink,
  type ShortLinkPage,
} from "@/api/urls"
import { hostOf } from "@/lib/validation"

export const urlsQueryKey = ["urls"] as const

export function useUrls() {
  return useInfiniteQuery({
    queryKey: urlsQueryKey,
    queryFn: ({ pageParam, signal }) => listUrls(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  })
}

/** Refetch the list from the first page, dropping pages loaded with "Load more". */
function restartUrls(queryClient: QueryClient) {
  queryClient.setQueryData<InfiniteData<ShortLinkPage, string | undefined>>(urlsQueryKey, (data) =>
    data && { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
  )
  return queryClient.invalidateQueries({ queryKey: urlsQueryKey })
}

export function useCreateUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) => createUrl({ url }),
    onSettled: () => restartUrls(queryClient),
  })
}

export function useUpdateUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, url }: { id: number; url: string }) => updateUrl(id, { url }),
    onSettled: () => restartUrls(queryClient),
  })
}

export function useDeleteUrl() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteUrl(id),
    onSettled: () => restartUrls(queryClient),
  })
}

/**
 * Hosts that serve short links, which targets must not point at: the
 * configured VITE_SHORT_URL_HOST plus the host of any loaded short_url.
 */
export function useShortLinkHosts(links: readonly ShortLink[]) {
  return useMemo(() => {
    const hosts = new Set<string>()
    const configured = import.meta.env.VITE_SHORT_URL_HOST?.trim().toLowerCase()
    if (configured) hosts.add(configured)
    for (const link of links) {
      const host = hostOf(link.short_url)
      if (host) hosts.add(host)
    }
    return [...hosts]
  }, [links])
}
