import type { components } from "@/types/api"
import { request } from "./client"

export type Profile = components["schemas"]["user.Profile"]
export type UpdateProfileInput = components["schemas"]["user.UpdateInput"]

export function getMe(signal?: AbortSignal) {
  return request<Profile>("GET", "/users/me", { signal })
}

export function updateMe(input: UpdateProfileInput) {
  return request<Profile>("PATCH", "/users/me", { body: input })
}
