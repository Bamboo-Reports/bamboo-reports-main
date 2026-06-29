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
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { updatePasswordSchema, type UpdatePasswordValues } from "@/lib/validators/auth"

type Status = "checking" | "ready" | "invalid"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
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

    const markReady = () => {
      resolved = true
      setStatus("ready")
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady()
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
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
      setSubmitError(error.message)
      return
    }

    // Sign the recovery session out so the user re-authenticates with the new
    // password. This also avoids dropping them onto the app while still on a
    // short-lived recovery session.
    await supabase.auth.signOut()
    router.replace("/signin?reset=success")
  }

  return (
    <AuthShell
      eyebrow="Account Recovery"
      title="Set a new password"
      description="Choose a new password for your account."
      footer={
        <>
          Back to{" "}
          <Link className="font-medium text-primary hover:underline" href="/signin">
            sign in
          </Link>
        </>
      }
    >
      {status === "checking" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying your reset link
        </div>
      ) : status === "invalid" ? (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertDescription>
            This reset link is invalid or has expired.{" "}
            <Link className="font-medium underline" href="/forgot-password">
              Request a new one
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[13px] font-medium text-foreground/90">
              New password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              className="h-10 rounded-lg"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-[13px] font-medium text-foreground/90">
              Confirm new password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="h-10 rounded-lg"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            ) : null}
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
                Updating password
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
