import type { components } from "@/types/api"
import { request } from "./client"

export type ShortLink = components["schemas"]["shortlink.View"]
export type ShortLinkPage = components["schemas"]["shortlink.Page"]
export type ShortLinkInput = components["schemas"]["shortlink.Input"]

export const PAGE_SIZE = 20

export function listUrls(cursor?: string, signal?: AbortSignal) {
  return request<ShortLinkPage>("GET", "/urls", {
    query: { limit: PAGE_SIZE, cursor },
    signal,
  })
}

export function createUrl(input: ShortLinkInput) {
  return request<ShortLink>("POST", "/urls", { body: input })
}

export function updateUrl(id: number, input: ShortLinkInput) {
  return request<ShortLink>("PUT", `/urls/${id}`, { body: input })
}

export function deleteUrl(id: number) {
  return request<void>("DELETE", `/urls/${id}`)
}
