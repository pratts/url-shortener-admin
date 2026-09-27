import { useEffect, useSyncExternalStore } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { login, register, type LoginInput, type RegisterInput } from "@/api/auth"
import { getMe, updateMe, type Profile, type UpdateProfileInput } from "@/api/users"
import { getToken, getTokenExpiry, setToken, subscribeToken } from "@/lib/auth"
import { endSession } from "@/lib/session"

export const meQueryKey = ["users", "me"] as const

// setTimeout overflows above 2^31 - 1 ms (about 24.8 days).
const MAX_TIMEOUT = 2 ** 31 - 1

export function useToken() {
  return useSyncExternalStore(subscribeToken, getToken, () => null)
}

export function useCurrentUser() {
  const token = useToken()
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => getMe(signal),
    enabled: token !== null,
    staleTime: 5 * 60_000,
  })
}

function profileFrom({ id, email, name, verified }: Profile): Profile {
  return { id, email, name, verified }
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: (session) => {
      queryClient.clear()
      queryClient.setQueryData(meQueryKey, profileFrom(session))
      setToken(session.token)
    },
  })
}

/**
 * Register, then log in with the same credentials. If the account was
 * created but the login fails (e.g. rate limited), `loggedIn` is false.
 */
export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      await register(input)
      try {
        const session = await login({ email: input.email, password: input.password })
        queryClient.clear()
        queryClient.setQueryData(meQueryKey, profileFrom(session))
        setToken(session.token)
        return { loggedIn: true }
      } catch {
        return { loggedIn: false }
      }
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMe(input),
    onSuccess: (profile) => queryClient.setQueryData(meQueryKey, profile),
  })
}

export function useLogout() {
  return () => endSession()
}

/** Ends the session when the token's `exp` passes. */
export function useSessionExpiry() {
  const token = useToken()
  useEffect(() => {
    if (!token) return
    const expiry = getTokenExpiry(token)
    if (expiry === null) return
    const delay = Math.min(Math.max(expiry - Date.now(), 0), MAX_TIMEOUT)
    const timer = setTimeout(() => endSession({ expired: true }), delay)
    return () => clearTimeout(timer)
  }, [token])
}
