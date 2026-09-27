import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Link, useNavigate, useSearchParams } from "react-router"
import type { z } from "zod"
import { ApiError } from "@/api/client"
import { AuthLayout } from "@/components/auth-layout"
import { FormError } from "@/components/form-error"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useLogin } from "@/hooks/use-auth"
import { applyApiError, FORM_ERROR } from "@/lib/forms"
import { safeNextPath } from "@/lib/session"
import { loginSchema } from "@/lib/validation"

type LoginValues = z.input<typeof loginSchema>

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const loginMutation = useLogin()
  const form = useForm<LoginValues, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await loginMutation.mutateAsync(values)
      navigate(safeNextPath(searchParams.get("next")), { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        form.setError(FORM_ERROR, { message: "Invalid email or password" })
        return
      }
      applyApiError(form.setError, error, { fields: { email: "Email", password: "Password" } })
    }
  })

  return (
    <AuthLayout title="Log in to your account" description="Enter your email and password to manage your links.">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <FormError message={errors.root?.server?.message} />
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Log in
            </Button>
            <FieldDescription className="text-center">
              Don&apos;t have an account? <Link to="/register">Sign up</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
