import { z } from "zod"

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  rememberMe: z.boolean().default(true),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
})

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export type SignInValues = z.infer<typeof signInSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>
