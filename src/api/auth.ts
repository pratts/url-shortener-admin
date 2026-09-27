import type { components } from "@/types/api"
import { request } from "./client"
import type { Profile } from "./users"

export type Session = components["schemas"]["user.Session"]
export type LoginInput = components["schemas"]["user.LoginInput"]
export type RegisterInput = components["schemas"]["user.RegisterInput"]

export function login(input: LoginInput) {
  return request<Session>("POST", "/users/login", { body: input, auth: false })
}

/** Creates the account but does not log in; call login afterwards. */
export function register(input: RegisterInput) {
  return request<Profile>("POST", "/users/register", { body: input, auth: false })
}
