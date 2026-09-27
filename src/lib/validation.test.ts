import { describe, expect, it } from "vitest"
import {
  byteLength,
  isHttpUrl,
  loginSchema,
  passwordChangeSchema,
  profileNameSchema,
  registerSchema,
  targetUrlProblem,
  urlFormSchema,
} from "./validation"

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join("."), i.message])
  )
}

const validRegistration = {
  email: "alice@example.com",
  name: "Alice",
  password: "correct-horse",
  confirmPassword: "correct-horse",
}

describe("registerSchema", () => {
  it("accepts valid input and trims email and name", () => {
    const result = registerSchema.parse({
      ...validRegistration,
      email: "  alice@example.com ",
      name: "  Alice  ",
    })
    expect(result.email).toBe("alice@example.com")
    expect(result.name).toBe("Alice")
  })

  it("rejects invalid emails, including the display-name form", () => {
    for (const email of ["", "alice", "Alice <alice@example.com>"]) {
      const result = registerSchema.safeParse({ ...validRegistration, email })
      expect(result.success, email).toBe(false)
      expect(errors(result)).toHaveProperty("email")
    }
  })

  it("rejects emails over 254 characters", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(185)}.com` // 254 chars
    expect(email.length).toBe(254)
    expect(registerSchema.safeParse({ ...validRegistration, email }).success).toBe(true)
    const tooLong = `a${email}`
    expect(errors(registerSchema.safeParse({ ...validRegistration, email: tooLong }))).toHaveProperty(
      "email",
      "Email must be at most 254 characters"
    )
  })

  it("requires a name of 1-100 characters after trimming, counting code points", () => {
    expect(errors(registerSchema.safeParse({ ...validRegistration, name: "   " }))).toHaveProperty("name")
    expect(registerSchema.safeParse({ ...validRegistration, name: "a".repeat(100) }).success).toBe(true)
    expect(registerSchema.safeParse({ ...validRegistration, name: "a".repeat(101) }).success).toBe(false)
    // 100 emoji are 200 UTF-16 units but 100 characters.
    expect(registerSchema.safeParse({ ...validRegistration, name: "😀".repeat(100) }).success).toBe(true)
  })

  it("requires matching passwords", () => {
    const result = registerSchema.safeParse({ ...validRegistration, confirmPassword: "different" })
    expect(errors(result)).toEqual({ confirmPassword: "Passwords do not match" })
  })
})

describe("password byte-length rule", () => {
  const check = (password: string) =>
    registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password }).success

  it("counts bytes, not characters", () => {
    expect(byteLength("é")).toBe(2)
    expect(byteLength("😀")).toBe(4)
  })

  it("accepts 8 to 72 bytes", () => {
    expect(check("a".repeat(7))).toBe(false)
    expect(check("a".repeat(8))).toBe(true)
    expect(check("a".repeat(72))).toBe(true)
    expect(check("a".repeat(73))).toBe(false)
  })

  it("rejects 72 characters that are more than 72 bytes", () => {
    const password = "é".repeat(37) // 37 characters, 74 bytes
    expect(password.length).toBeLessThan(72)
    expect(check(password)).toBe(false)
  })

  it("accepts fewer than 8 characters when they are at least 8 bytes", () => {
    expect(check("😀😀")).toBe(true) // 2 characters, 8 bytes
  })
})

describe("loginSchema", () => {
  it("only requires a password, without length rules", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true)
    expect(errors(loginSchema.safeParse({ email: "a@b.co", password: "" }))).toHaveProperty("password")
  })
})

describe("profile schemas", () => {
  it("validates the name", () => {
    expect(profileNameSchema.safeParse({ name: "Alice B" }).success).toBe(true)
    expect(profileNameSchema.safeParse({ name: "" }).success).toBe(false)
  })

  it("requires the current password and a matching new password", () => {
    expect(
      errors(passwordChangeSchema.safeParse({ current_password: "", password: "new-password", confirmPassword: "new-password" }))
    ).toHaveProperty("current_password")
    expect(
      errors(passwordChangeSchema.safeParse({ current_password: "old", password: "new-password", confirmPassword: "nope" }))
    ).toEqual({ confirmPassword: "Passwords do not match" })
  })
})

describe("target URL rules", () => {
  const hosts = ["tidylnk.com", "localhost:8085"]

  it("accepts absolute http and https URLs", () => {
    expect(targetUrlProblem("https://example.com/some/path?q=1", hosts)).toBeNull()
    expect(targetUrlProblem("  http://example.com  ", hosts)).toBeNull()
  })

  it("rejects relative, non-http and hostless URLs", () => {
    expect(targetUrlProblem("", hosts)).toBe("URL is required")
    expect(targetUrlProblem("example.com", hosts)).not.toBeNull()
    expect(targetUrlProblem("/path", hosts)).not.toBeNull()
    expect(targetUrlProblem("ftp://example.com", hosts)).not.toBeNull()
    expect(targetUrlProblem("javascript:alert(1)", hosts)).not.toBeNull()
    expect(targetUrlProblem("mailto:a@b.co", hosts)).not.toBeNull()
  })

  it("rejects credentials", () => {
    expect(targetUrlProblem("https://user:pass@example.com", hosts)).toBe(
      "URL must not contain a username or password"
    )
    expect(targetUrlProblem("https://user@example.com", hosts)).not.toBeNull()
  })

  it("rejects URLs over 2048 characters", () => {
    const base = "https://example.com/"
    expect(targetUrlProblem(base + "a".repeat(2048 - base.length), hosts)).toBeNull()
    expect(targetUrlProblem(base + "a".repeat(2049 - base.length), hosts)).not.toBeNull()
  })

  it("rejects the short-link host, case-insensitively and with a port", () => {
    expect(targetUrlProblem("https://TidyLnk.com/abc", hosts)).toBe("URL can't point to a short link")
    expect(targetUrlProblem("http://localhost:8085/abc", hosts)).not.toBeNull()
    expect(targetUrlProblem("http://localhost:3000/abc", hosts)).toBeNull()
    expect(targetUrlProblem("https://sub.tidylnk.com/abc", hosts)).toBeNull()
  })

  it("trims the value in the form schema", () => {
    expect(urlFormSchema(hosts).parse({ url: "  https://example.com  " })).toEqual({
      url: "https://example.com",
    })
  })
})

describe("isHttpUrl", () => {
  it("only allows http and https", () => {
    expect(isHttpUrl("https://example.com")).toBe(true)
    expect(isHttpUrl("http://example.com")).toBe(true)
    expect(isHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isHttpUrl("data:text/html,hi")).toBe(false)
    expect(isHttpUrl("not a url")).toBe(false)
  })
})
