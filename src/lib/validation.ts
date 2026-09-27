import { z } from "zod"

// zod v4 checks whether it may compile validators by calling Function(""),
// i.e. eval. The CSP (script-src 'self') blocks that and reports a violation;
// jitless mode never calls Function(), so the CSP needs no 'unsafe-eval'.
z.config({ jitless: true })

// Mirrors the backend's rules (docs/API.md) so users see problems before
// submitting. Server `fields` errors are still mapped onto inputs.

export const MAX_EMAIL_LENGTH = 254
export const MAX_NAME_LENGTH = 100
export const MIN_PASSWORD_BYTES = 8
export const MAX_PASSWORD_BYTES = 72
export const MAX_URL_LENGTH = 2048

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/** Counts code points like the backend does, not UTF-16 units. */
function charLength(value: string): number {
  return [...value].length
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(MAX_EMAIL_LENGTH, `Email must be at most ${MAX_EMAIL_LENGTH} characters`)
  .pipe(z.email("Enter a valid email address"))

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .refine((v) => charLength(v) <= MAX_NAME_LENGTH, {
    message: `Name must be at most ${MAX_NAME_LENGTH} characters`,
  })

export const passwordSchema = z.string().superRefine((value, ctx) => {
  const bytes = byteLength(value)
  if (bytes < MIN_PASSWORD_BYTES || bytes > MAX_PASSWORD_BYTES) {
    ctx.addIssue({
      code: "custom",
      message:
        bytes < MIN_PASSWORD_BYTES
          ? `Password must be at least ${MIN_PASSWORD_BYTES} characters`
          : `Password is too long (at most ${MAX_PASSWORD_BYTES} bytes; some characters count as more than one)`,
    })
  }
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
})

export const registerSchema = z
  .object({
    email: emailSchema,
    name: nameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

export const profileNameSchema = z.object({ name: nameSchema })

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })

/** The lowercase hostname (no port) of a URL or of a "host[:port]" value, or null. */
export function hostnameOf(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`)
    return url.hostname.toLowerCase().replace(/\.$/, "") || null
  } catch {
    return null
  }
}

/**
 * Why `value` isn't an acceptable target URL, or null if it is.
 * `shortLinkHosts` are hosts ("tidylnk.com", "localhost:8085") or URLs.
 */
export function targetUrlProblem(value: string, shortLinkHosts: readonly string[]): string | null {
  const trimmed = value.trim()
  if (!trimmed) return "URL is required"
  if (trimmed.length > MAX_URL_LENGTH) return `URL must be at most ${MAX_URL_LENGTH} characters`

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return "Enter a full URL, including https://"
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "URL must start with http:// or https://"
  }
  if (!url.hostname) return "URL must include a host"
  if (url.username || url.password) return "URL must not contain a username or password"

  // Like the backend, compare hostnames and ignore ports: with short links on
  // localhost:8085, every localhost target is rejected.
  const hostname = hostnameOf(url.href)
  if (shortLinkHosts.some((h) => hostnameOf(h) === hostname)) {
    return "URL can't point to a short link"
  }
  return null
}

export function urlFormSchema(shortLinkHosts: readonly string[]) {
  return z.object({
    url: z
      .string()
      .trim()
      .superRefine((value, ctx) => {
        const problem = targetUrlProblem(value, shortLinkHosts)
        if (problem) ctx.addIssue({ code: "custom", message: problem })
      }),
  })
}

/** True if `url` is safe to render as a link (http or https only). */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}
