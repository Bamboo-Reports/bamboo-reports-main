import { z } from "zod"

export const accountSummarySchema = z.object({
  summary: z.string().min(1).max(700),
})

export type AccountAISummary = z.infer<typeof accountSummarySchema>

export type AccountAISummaryResponse = {
  summary: AccountAISummary
  generatedAt: string
  model: string
}
