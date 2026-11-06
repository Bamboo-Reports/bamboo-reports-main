"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RiCheckboxBlankCircleLine, RiCheckboxCircleFill, RiLoader4Line } from "@remixicon/react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { AuthNotice, AuthShell } from "@/components/auth/auth-shell"
import { cn } from "@/lib/utils"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { updatePasswordSchema, type UpdatePasswordValues } from "@/lib/validators/auth"

type Status = "checking" | "ready" | "invalid"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  // The recovery link carries the token in the URL; the browser client parses it
  // (detectSessionInUrl) and establishes a recovery session. We accept either the
  // PASSWORD_RECOVERY event or an already-present session as proof the link is valid.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let resolved = false

    const markReady = (email?: string | null) => {
      if (!resolved) captureEvent(ANALYTICS_EVENTS.AUTH_PASSWORD_RECOVERY_LINK_OPENED)
      resolved = true
      if (email) setAccountEmail(email)
      setStatus("ready")
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady(session?.user.email)
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady(data.session.user.email)
    })

    // If no recovery session materializes shortly, the link is missing or expired.
    const timeout = setTimeout(() => {
      if (!resolved) setStatus("invalid")
    }, 3000)

    return () => {
      authListener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const onSubmit = async (values: UpdatePasswordValues) => {
    setSubmitError(null)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: values.password })

    if (error) {
      captureEvent(ANALYTICS_EVENTS.AUTH_PASSWORD_RESET_FAILED, {
        error_message: error.message,
      })
      setSubmitError(error.message)
      return
    }

    captureEvent(ANALYTICS_EVENTS.AUTH_PASSWORD_RESET_SUCCEEDED)

    // Sign the recovery session out so the user re-authenticates with the new
    // password. This also avoids dropping them onto the app while still on a
    // short-lived recovery session.
    await supabase.auth.signOut()
    router.replace("/signin?reset=success")
  }

  const password = useWatch({ control, name: "password" }) ?? ""
  const confirmPassword = useWatch({ control, name: "confirmPassword" }) ?? ""
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Both passwords match", met: password.length > 0 && password === confirmPassword },
  ]
  const backToSignIn = (
    <Link className="font-medium text-primary hover:underline" href="/signin">
      Back to sign in
    </Link>
  )

  if (status === "invalid") {
    return (
      <AuthShell title="This link has expired" description="Reset links work once and expire after a short time." footer={backToSignIn}>
        <div className="space-y-4">
          <AuthNotice tone="error" title="Request a new link">
            We&apos;ll email you a fresh one; it replaces this one.
          </AuthNotice>
          <Button asChild size="lg" className="w-full">
            <Link href="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set a new password"
      description={accountEmail ? `Choose a new password for ${accountEmail}.` : "Choose a new password for your account."}
      footer={backToSignIn}
    >
      {status === "checking" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <RiLoader4Line className="h-4 w-4 animate-spin" />
          Checking your reset link
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {submitError ? (
            <AuthNotice tone="error" title="Could not update your password">
              {submitError}
            </AuthNotice>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              New password
            </Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              className="h-10 rounded-lg"
              aria-describedby="password-rules"
              {...register("password")}
            />
            {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm new password
            </Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              required
              className="h-10 rounded-lg"
              aria-describedby="password-rules"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword.message}</p> : null}
          </div>
          {/* The same rules the form checks on submit, ticked off as you type. */}
          <ul id="password-rules" className="space-y-1 text-xs">
            {rules.map((rule) => (
              <li key={rule.label} className={cn("flex items-center gap-1.5", rule.met ? "text-include" : "text-muted-foreground")}>
                {rule.met ? <RiCheckboxCircleFill className="h-4 w-4" /> : <RiCheckboxBlankCircleLine className="h-4 w-4" />}
                {rule.label}
                <span className="sr-only">{rule.met ? "(done)" : "(not yet)"}</span>
              </li>
            ))}
          </ul>
          <Button size="lg" className="w-full" type="submit" loading={isSubmitting}>
            {isSubmitting ? "Updating password" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
