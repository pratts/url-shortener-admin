import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import type { z } from "zod"
import { AuthLayout } from "@/components/auth-layout"
import { FormError } from "@/components/form-error"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useRegister } from "@/hooks/use-auth"
import { applyApiError } from "@/lib/forms"
import { registerSchema } from "@/lib/validation"

type RegisterValues = z.input<typeof registerSchema>

export default function Register() {
  const navigate = useNavigate()
  const registerMutation = useRegister()
  const form = useForm<RegisterValues, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", name: "", password: "", confirmPassword: "" },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email, name, password }) => {
    try {
      const { loggedIn } = await registerMutation.mutateAsync({ email, name, password })
      if (loggedIn) {
        navigate("/urls", { replace: true })
      } else {
        toast.success("Account created. Log in to continue.")
        navigate("/login", { replace: true })
      }
    } catch (error) {
      applyApiError(form.setError, error, {
        fields: { email: "Email", name: "Name", password: "Password" },
      })
    }
  })

  return (
    <AuthLayout title="Create an account" description="Sign up to start shortening links.">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <FormError message={errors.root?.server?.message} />
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
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
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby="password-hint"
              {...form.register("password")}
            />
            <FieldDescription id="password-hint">At least 8 characters.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
          <Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              Create account
            </Button>
            <FieldDescription className="text-center">
              Already have an account? <Link to="/login">Log in</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
