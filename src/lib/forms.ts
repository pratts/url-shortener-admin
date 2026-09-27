import type { FieldValues, Path, UseFormSetError } from "react-hook-form"
import { ApiError, GENERIC_ERROR } from "@/api/client"

export const FORM_ERROR = "root.server" as const

type Options<T extends FieldValues> = {
  /** Form fields that server `fields` keys map onto, with their labels. */
  fields: Partial<Record<Path<T>, string>>
  /** Server field keys that exist on the API but not as inputs here. */
  labels?: Record<string, string>
}

function sentence(label: string, message: string) {
  return `${label} ${message}`
}

/**
 * Show an API error on a form: `fields` messages go next to their inputs
 * ("Email is already registered"), anything else becomes a form-level error.
 */
export function applyApiError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  { fields, labels = {} }: Options<T>
) {
  if (!(error instanceof ApiError)) {
    setError(FORM_ERROR as Path<T>, { message: GENERIC_ERROR })
    return
  }

  const formMessages: string[] = []
  if (error.fields) {
    for (const [key, message] of Object.entries(error.fields)) {
      const label = fields[key as Path<T>]
      if (label !== undefined) {
        setError(key as Path<T>, { message: sentence(label, message) }, { shouldFocus: true })
      } else {
        const otherLabel = labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
        formMessages.push(sentence(otherLabel, message))
      }
    }
  }

  if (formMessages.length > 0) {
    setError(FORM_ERROR as Path<T>, { message: formMessages.join(". ") })
  } else if (!error.fields) {
    setError(FORM_ERROR as Path<T>, { message: error.message })
  }
}
