import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"
import { ApiError } from "@/api/client"
import type { ShortLink } from "@/api/urls"
import { FormError } from "@/components/form-error"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useCreateUrl, useUpdateUrl } from "@/hooks/use-urls"
import { applyApiError } from "@/lib/forms"
import { urlFormSchema } from "@/lib/validation"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The link to edit; omit to create a new one. */
  link?: ShortLink
  shortLinkHosts: readonly string[]
}

export function UrlFormDialog({ open, onOpenChange, link, shortLinkHosts }: Props) {
  const schema = useMemo(() => urlFormSchema(shortLinkHosts), [shortLinkHosts])
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { url: link?.url ?? "" },
  })
  const { errors, isSubmitting } = form.formState
  const createMutation = useCreateUrl()
  const updateMutation = useUpdateUrl()
  const editing = link !== undefined

  const { reset } = form
  useEffect(() => {
    if (open) reset({ url: link?.url ?? "" })
  }, [open, link, reset])

  const onSubmit = form.handleSubmit(async ({ url }) => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: link.id, url })
        toast.success("Link updated")
      } else {
        const created = await createMutation.mutateAsync(url)
        toast.success("Short link created", { description: created.short_url })
      }
      onOpenChange(false)
    } catch (error) {
      if (editing && error instanceof ApiError && error.status === 404) {
        toast.error("This link no longer exists")
        onOpenChange(false)
        return
      }
      applyApiError(form.setError, error, { fields: { url: "URL" } })
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-6">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit link" : "Create a short link"}</DialogTitle>
            <DialogDescription>
              {editing ? (
                <>
                  Change where <span className="font-mono">{link.short_url}</span> points. The short
                  link stays the same.
                </>
              ) : (
                "Paste a long URL to get a short link for it."
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormError message={errors.root?.server?.message} />
            <Field data-invalid={!!errors.url}>
              <FieldLabel htmlFor="target-url">Target URL</FieldLabel>
              <Input
                id="target-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://example.com/a/long/path"
                aria-invalid={!!errors.url}
                {...form.register("url")}
              />
              <FieldError errors={[errors.url]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
