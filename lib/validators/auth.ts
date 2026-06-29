import { z } from "zod"

const requiredPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required.")
  .min(7, "Phone number is too short.")
  .max(20, "Phone number is too long.")

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  rememberMe: z.boolean().default(true),
})

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Enter a valid email."),
  phone: requiredPhoneSchema,
  password: z.string().min(6, "Password must be at least 6 characters."),
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
export type SignUpValues = z.infer<typeof signUpSchema>
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>
export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>
