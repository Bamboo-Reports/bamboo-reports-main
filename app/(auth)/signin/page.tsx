"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { devError } from "@/lib/utils/dev-log"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthShell } from "@/components/auth/auth-shell"
import { captureEvent, identifyUser } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { getSupabaseBrowserClient, setSupabaseAuthStoragePreference } from "@/lib/supabase/client"
import { signInSchema, type SignInValues } from "@/lib/validators/auth"

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const signupStatus = searchParams.get("signup")
  const resetStatus = searchParams.get("reset")
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true,
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

  const onSubmit = async (values: SignInValues) => {
    setSubmitError(null)

    const storagePreference = values.rememberMe ? "local" : "session"
    setSupabaseAuthStoragePreference(storagePreference)
    const supabase = getSupabaseBrowserClient(storagePreference)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (signInError) {
      setSubmitError(signInError.message)
      captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_IN_FAILED, {
        auth_provider: "email",
        remember_me: values.rememberMe,
        email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
        error_message: signInError.message,
      })
      return
    }

    const user = signInData.user ?? signInData.session?.user
    if (user) {
      identifyUser({
        id: user.id,
        email: user.email ?? values.email,
        authProvider: "email",
      })
      captureEvent(ANALYTICS_EVENTS.AUTH_SIGN_IN_SUCCEEDED, {
        auth_provider: "email",
        remember_me: values.rememberMe,
        email_domain: values.email.includes("@") ? values.email.split("@")[1] : null,
      })

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (!profileError && !profileData) {
        const fallbackFirstName = user.user_metadata?.first_name ?? "User"
        const fallbackLastName = user.user_metadata?.last_name ?? "Profile"
        const fallbackPhone = user.user_metadata?.phone ?? null

        const { error: insertError } = await supabase.from("profiles").insert({
          user_id: user.id,
          first_name: fallbackFirstName,
          last_name: fallbackLastName,
          email: user.email ?? values.email,
          phone: fallbackPhone,
        })

        if (insertError) {
          devError("Failed to create user profile:", insertError.message)
          setSubmitError("Account signed in but profile setup failed. Please try refreshing.")
          return
        }
      }
    }

    router.replace("/")
  }

  return (
    <AuthShell
      eyebrow="Secure Login"
      title="Welcome back"
      description="Sign in to access Bamboo Reports."
      footer={
        <>
          New here?{" "}
          <Link className="font-medium text-primary hover:underline" href="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-medium text-foreground/90">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="h-10 rounded-lg"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13px] font-medium text-foreground/90">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10 rounded-lg"
            {...register("password")}
          />
          {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <Controller
            control={control}
            name="rememberMe"
            render={({ field }) => (
              <Checkbox
                id="rememberMe"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="rememberMe" className="text-sm font-normal text-muted-foreground">
            Remember me
          </Label>
        </div>
        {submitError ? (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        {signupStatus === "success" ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-foreground">
            <AlertDescription>Account created. Please sign in to continue.</AlertDescription>
          </Alert>
        ) : null}
        {resetStatus === "success" ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/10 text-foreground">
            <AlertDescription>Password updated. Please sign in with your new password.</AlertDescription>
          </Alert>
        ) : null}
        {signupStatus === "pending" ? (
          <Alert className="border-amber-500/40 bg-amber-500/10 text-foreground">
            <AlertDescription>Check your email to confirm your account, then sign in.</AlertDescription>
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
              Signing in
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignInForm />
    </Suspense>
  )
}
