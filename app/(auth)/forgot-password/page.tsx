"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RiMailSendLine } from "@remixicon/react"
import { AuthNotice, AuthShell } from "@/components/auth/auth-shell"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { captureEvent } from "@/lib/analytics/client"
import { ANALYTICS_EVENTS } from "@/lib/analytics/events"
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth"

export default function ForgotPasswordPage() {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [sentTo, setSentTo] = useState("")
  // True after a resend succeeds, so "Send it again" visibly confirms it worked.
  const [resent, setResent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (values: ForgotPasswordValues) => {
    setSubmitError(null)
    const supabase = getSupabaseBrowserClient()
    // The recovery link must land on the dedicated update-password page, which
    // is also why this redirect URL has to be in the Supabase redirect allowlist.
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo,
    })

    if (error) {
      captureEvent(ANALYTICS_EVENTS.AUTH_PASSWORD_RESET_REQUEST_FAILED, {
        error_message: error.message,
      })
      setSubmitError(error.message)
      return
    }

    captureEvent(ANALYTICS_EVENTS.AUTH_PASSWORD_RESET_REQUESTED, {
      email_domain: values.email.split("@")[1] ?? null,
    })

    // Always show success so the form does not reveal whether an email exists.
    setResent(sent)
    setSentTo(values.email.trim())
    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell
        footer={
          <Link className="font-medium text-primary hover:underline" href="/signin">
            Back to sign in
          </Link>
        }
      >
        <div className="py-1 text-center" role="status">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted text-foreground">
            <RiMailSendLine className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-[-0.015em]">Check your email</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, a link to set a new
            password is on its way. It can take a few minutes; check spam too.
          </p>
          {submitError && (
            <AuthNotice tone="error" title="Could not send the link">
              {submitError}
            </AuthNotice>
          )}
          <p className="mt-4 text-[13px] text-muted-foreground">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:opacity-60"
              disabled={isSubmitting}
              onClick={() => {
                setResent(false)
                void handleSubmit(onSubmit)()
              }}
            >
              {isSubmitting ? "Sending" : resent ? "Sent again" : "Send it again"}
            </button>{" "}
            or{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setSent(false)
                setResent(false)
                setSubmitError(null)
              }}
            >
              use a different email
            </button>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link className="font-medium text-primary hover:underline" href="/signin">
            Back to sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {submitError ? (
          <AuthNotice tone="error" title="Could not send the link">
            {submitError}
          </AuthNotice>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
        </div>
        <Button size="lg" className="w-full" type="submit" loading={isSubmitting}>
          {isSubmitting ? "Sending link" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  )
}
