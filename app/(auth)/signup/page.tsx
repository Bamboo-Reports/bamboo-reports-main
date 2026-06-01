"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthShell } from "@/components/auth/auth-shell"
import { captureEvent, identifyUser, resetAnalytics } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { signUpSchema, type SignUpValues } from "@/lib/validators/auth"

export default function SignUpPage() {
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
    },
  })

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/")
      }
    })
  }, [router])

  const onSubmit = async (values: SignUpValues) => {
    setSubmitError(null)
    const supabase = getSupabaseBrowserClient()
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          first_name: values.firstName,
          last_name: values.lastName,
          phone: values.phone,
        },
      },
    })

    if (signUpError) {
      setSubmitError(signUpError.message)
      captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_UP_FAILED, {
        auth_provider: "email",
        email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
        error_message: signUpError.message,
      })
      return
    }

    const userId = signUpData.user?.id
    if (!userId) {
      setSubmitError("Signup succeeded but the user record was missing.")
      captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_UP_FAILED, {
        auth_provider: "email",
        email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
        error_message: "Missing user ID after signup",
      })
      return
    }

    if (signUpData.session) {
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: userId,
        first_name: values.firstName,
        last_name: values.lastName,
        email: values.email,
        phone: values.phone,
      })

      if (profileError) {
        setSubmitError(profileError.message)
        captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_UP_FAILED, {
          auth_provider: "email",
          email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
          error_message: profileError.message,
        })
        return
      }

      identifyUser({
        id: userId,
        email: values.email,
        authProvider: "email",
      })
      captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_UP_SUCCEEDED, {
        auth_provider: "email",
        email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
        requires_email_confirmation: false,
      })
      await supabase.auth.signOut()
      resetAnalytics()
      router.replace("/signin?signup=success")
      return
    }

    captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_UP_SUCCEEDED, {
      auth_provider: "email",
      email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
      requires_email_confirmation: true,
    })
    router.replace("/signin?signup=pending")
  }

  return (
    <AuthShell
      eyebrow="Create Account"
      title="Create your account"
      description="Join Bamboo Reports with email and password."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-primary hover:underline" href="/signin">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-[13px] font-medium text-foreground/90">
              First name
            </Label>
            <Input id="firstName" autoComplete="given-name" required className="h-10 rounded-lg" {...register("firstName")} />
            {errors.firstName ? <p className="text-xs text-destructive">{errors.firstName.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-[13px] font-medium text-foreground/90">
              Last name
            </Label>
            <Input id="lastName" autoComplete="family-name" required className="h-10 rounded-lg" {...register("lastName")} />
            {errors.lastName ? <p className="text-xs text-destructive">{errors.lastName.message}</p> : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-medium text-foreground/90">
            Email
          </Label>
          <Input id="email" type="email" autoComplete="email" required className="h-10 rounded-lg" {...register("email")} />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-[13px] font-medium text-foreground/90">
            Phone
          </Label>
          <Input id="phone" type="tel" autoComplete="tel" required className="h-10 rounded-lg" {...register("phone")} />
          {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-[13px] font-medium text-foreground/90">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="h-10 rounded-lg"
            {...register("password")}
          />
          {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>
        {submitError ? (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          className="h-10 w-full rounded-lg bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500 text-white shadow-[0_14px_30px_-14px_rgba(37,99,235,0.85)] hover:from-blue-600 hover:via-blue-500 hover:to-sky-500"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthShell>
  )
}
