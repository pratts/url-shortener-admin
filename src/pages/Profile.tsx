import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"
import { ApiError } from "@/api/client"
import type { Profile as ProfileData } from "@/api/users"
import { FormError } from "@/components/form-error"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useCurrentUser, useUpdateProfile } from "@/hooks/use-auth"
import { applyApiError } from "@/lib/forms"
import { passwordChangeSchema, profileNameSchema } from "@/lib/validation"

function NameForm({ user }: { user: ProfileData }) {
  const update = useUpdateProfile()
  const form = useForm<z.input<typeof profileNameSchema>, unknown, z.output<typeof profileNameSchema>>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { name: user.name },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const { reset } = form
  useEffect(() => reset({ name: user.name }), [user.name, reset])

  const onSubmit = form.handleSubmit(async ({ name }) => {
    try {
      await update.mutateAsync({ name })
      toast.success("Name updated")
    } catch (error) {
      applyApiError(form.setError, error, { fields: { name: "Name" } })
    }
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <CardHeader>
          <CardTitle>
            <h2>Account</h2>
          </CardTitle>
          <CardDescription>Your name is shown in the sidebar.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FormError message={errors.root?.server?.message} />
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" value={user.email} readOnly disabled aria-describedby="email-hint" />
              <FieldDescription id="email-hint">Your email can't be changed.</FieldDescription>
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                autoComplete="name"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Spinner />}
            Save name
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordForm({ email }: { email: string }) {
  const update = useUpdateProfile()
  const form = useForm<z.input<typeof passwordChangeSchema>, unknown, z.output<typeof passwordChangeSchema>>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current_password: "", password: "", confirmPassword: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ current_password, password }) => {
    try {
      await update.mutateAsync({ current_password, password })
      form.reset()
      toast.success("Password changed")
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        form.setError("current_password", { message: "Current password is incorrect" }, { shouldFocus: true })
        return
      }
      applyApiError(form.setError, error, {
        fields: { current_password: "Current password", password: "New password" },
      })
    }
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="grid gap-6">
        <CardHeader>
          <CardTitle>
            <h2>Change password</h2>
          </CardTitle>
          <CardDescription>You stay logged in after changing it.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FormError message={errors.root?.server?.message} />
            {/* Lets password managers associate the new password with the account. */}
            <input type="text" name="username" autoComplete="username" value={email} hidden readOnly />
            <Field data-invalid={!!errors.current_password}>
              <FieldLabel htmlFor="current_password">Current password</FieldLabel>
              <Input
                id="current_password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.current_password}
                {...form.register("current_password")}
              />
              <FieldError errors={[errors.current_password]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="new_password">New password</FieldLabel>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                aria-describedby="new-password-hint"
                {...form.register("password")}
              />
              <FieldDescription id="new-password-hint">At least 8 characters.</FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirm_password">Confirm new password</FieldLabel>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...form.register("confirmPassword")}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function Profile() {
  const { data: user, isPending, isError, error, refetch } = useCurrentUser()

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your name and password.</p>
      </div>
      {isPending ? (
        <Skeleton className="h-64 w-full" aria-label="Loading profile" />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error instanceof ApiError ? error.message : "Couldn't load your profile."}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <NameForm user={user} />
          <PasswordForm email={user.email} />
        </>
      )}
    </div>
  )
}

