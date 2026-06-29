"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthShell } from "@/components/auth/auth-shell"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth"

export default function ForgotPasswordPage() {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
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
      setSubmitError(error.message)
      return
    }

    // Always show success so the form does not reveal whether an email exists.
    setSent(true)
  }

  return (
    <AuthShell
      eyebrow="Account Recovery"
      title="Reset your password"
      description="Enter your email and we will send you a link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link className="font-medium text-primary hover:underline" href="/signin">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-foreground">
          <AlertDescription>
            If an account exists for that email, a password reset link is on its way. Check your inbox
            and spam folder.
          </AlertDescription>
        </Alert>
      ) : (
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
                Sending link
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
