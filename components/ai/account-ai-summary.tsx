"use client"

import { useEffect, useState } from "react"
import {
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { requestAccountSummary } from "@/lib/ai/account-summary-client"
import type { AccountAISummaryResponse } from "@/lib/ai/account-summary"
import { AccountAISummaryBg } from "./account-ai-summary-bg"

function AnimatedText({ text }: { text: string }) {
  // Split by whitespace but keep the whitespace tokens so wrapping works naturally
  const tokens = text.split(/(\s+)/)
  let wordCount = 0

  return (
    <p className="mt-4 w-full text-[15px] leading-7 text-foreground/90">
      {tokens.map((token, i) => {
        if (!token.trim()) {
          return <span key={i}>{token}</span>
        }
        wordCount++
        return (
          <span
            key={i}
            className="inline-block animate-in fade-in slide-in-from-bottom-[2px] fill-mode-both"
            style={{ animationDuration: "500ms", animationDelay: `${wordCount * 25}ms` }}
          >
            {token}
          </span>
        )
      })}
    </p>
  )
}

export function AccountAISummary({ accountName }: { accountName: string }) {
  const [result, setResult] = useState<AccountAISummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    setLoading(false)
  }, [accountName])

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await requestAccountSummary(accountName))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to generate the AI account brief.")
    } finally {
      setLoading(false)
    }
  }

  const state = loading ? "loading" : result ? "result" : "idle"

  return (
    <section className="group relative isolate overflow-hidden rounded-2xl border border-border/70 bg-background/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.025]">
      <AccountAISummaryBg state={state} />

      <div className={`relative z-10 grid min-h-[190px] gap-6 p-5 sm:p-6 lg:items-center lg:px-8 lg:py-7 ${result ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_auto]"}`}>
        <div className={result ? "w-full" : "max-w-3xl"}>
          {!result && !loading && !error && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">
              <h3 className="max-w-2xl text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[22px]">
                Instant Executive Intelligence on {accountName}
              </h3>
              <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                Ditch the endless scrolling. Bamboo Reports AI instantly synthesizes global footprints, tech stacks, and key leadership signals into a single, hyper-targeted executive brief so you can engage with precision.
              </p>
            </div>
          )}

          {loading && (
            <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">
              <h3 className="text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-[22px]">
                Analyzing {accountName}...
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                Bamboo Reports AI is compiling real-time signals to generate your executive brief.
              </p>
            </div>
          )}

          {result && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 fill-mode-both">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">AI Account Brief</h3>
              </div>
              <AnimatedText text={result.summary.summary} />
            </div>
          )}

          {error && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both">
              <h3 className="max-w-2xl text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-[22px]">
                Our AI is in high demand right now and needs a quick breather.
              </h3>
              <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                Give it a moment, then hit Summarize again. Your executive brief is worth the short wait.
              </p>
            </div>
          )}
        </div>

        {!result && (
          <div className="flex items-center lg:justify-end">
            <div className="glowing-beam-button">
              <div aria-hidden="true" className="glowing-beam-button__glow" />
              <Button
                type="button"
                size="lg"
                onClick={generate}
                disabled={loading}
                className="glowing-beam-button__surface disabled:opacity-100 disabled:text-white/50"
              >
                {loading ? <RefreshCw className="animate-spin" /> : <Sparkles />}
                <span className="glowing-beam-button__label">{loading ? "SUMMARIZING" : "SUMMARIZE"}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
