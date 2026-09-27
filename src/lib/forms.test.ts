import { describe, expect, it, vi } from "vitest"
import { ApiError, GENERIC_ERROR } from "@/api/client"
import { applyApiError, FORM_ERROR } from "./forms"

type Values = { email: string; name: string; password: string }

function run(error: unknown) {
  const setError = vi.fn()
  applyApiError<Values>(setError, error, { fields: { email: "Email", name: "Name" } })
  return setError.mock.calls.map(([path, { message }]) => [path, message])
}

describe("applyApiError", () => {
  it("puts field messages on their inputs, prefixed with the label", () => {
    expect(run(new ApiError(409, "email is already registered", { email: "is already registered" }))).toEqual([
      ["email", "Email is already registered"],
    ])
  })

  it("sends fields without an input to the form", () => {
    expect(run(new ApiError(400, "Validation failed", { password: "must be between 8 and 72 bytes" }))).toEqual([
      [FORM_ERROR, "Password must be between 8 and 72 bytes"],
    ])
  })

  it("treats 'name: or password is required' as a form-level error", () => {
    expect(run(new ApiError(400, "Validation failed", { name: "or password is required" }))).toEqual([
      [FORM_ERROR, "Name or password is required"],
    ])
  })

  it("uses the error message when there are no fields", () => {
    expect(run(new ApiError(400, "Invalid request body"))).toEqual([[FORM_ERROR, "Invalid request body"]])
  })

  it("uses a generic message for unknown errors", () => {
    expect(run(new Error("boom"))).toEqual([[FORM_ERROR, GENERIC_ERROR]])
  })
})
