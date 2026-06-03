import { z } from "zod"

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_MAPTILER_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_LOGO_DEV_KEY: z.string().min(1).optional(),
})

let validated = false

export function validateEnv(): void {
  if (validated) return
  if (typeof window !== "undefined") return

  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues
      .filter((i) => i.code === "invalid_type" && i.received === "undefined")
      .map((i) => i.path.join("."))
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}.\n` +
          `Check .env.example for the full list of required variables.`
      )
    }
  }
  validated = true
}
