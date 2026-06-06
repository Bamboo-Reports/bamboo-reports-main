"use client"

import { useEffect, useState } from "react"
import {
  Building2,
  Cpu,
  MapPinned,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { requestAccountSummary } from "@/lib/ai/account-summary-client"
import type { AccountAISummaryResponse } from "@/lib/ai/account-summary"

const intelligenceSignals = [
  { label: "Presence", icon: MapPinned },
  { label: "Centers", icon: Building2 },
  { label: "Technology", icon: Cpu },
  { label: "Prospects", icon: Users },
]

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

  return (
    <section className="group relative isolate overflow-hidden rounded-2xl border border-border/70 bg-background/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.025]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.22] dark:opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(199 89% 48% / 0.18) 1px, transparent 1px), linear-gradient(90deg, hsl(199 89% 48% / 0.18) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(90deg, transparent 20%, black 100%)",
        }}
      />
      <div className={`relative grid min-h-[190px] gap-6 p-5 sm:p-6 lg:items-center lg:px-8 lg:py-7 ${result ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_auto]"}`}>
        <div className={result ? "w-full" : "max-w-3xl"}>
          {!result && !loading && (
            <>
              <h3 className="max-w-2xl text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-2xl">
                Turn {accountName} into a 20-second brief.
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                AI connects the most useful account signals into one concise executive readout.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {intelligenceSignals.map(({ label, icon: Icon }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/15 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur dark:border-cyan-300/10 dark:bg-white/[0.04] dark:text-slate-300"
                  >
                    <Icon className="h-3 w-3 text-cyan-600 dark:text-cyan-300" />
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}

          {loading && (
            <div className="max-w-2xl">
              <h3 className="text-xl font-semibold tracking-[-0.025em]">Reading {accountName}...</h3>
              <p className="mt-2 text-sm text-muted-foreground">Connecting account signals and writing the brief.</p>
              <div className="mt-5 h-1.5 max-w-md overflow-hidden rounded-full bg-cyan-950/10 dark:bg-white/10">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-sky-500 via-cyan-300 to-sky-500" />
              </div>
            </div>
          )}

          {result && (
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">AI Account Brief</h3>
              </div>
              <p className="mt-4 w-full text-[15px] leading-7 text-foreground/90">{result.summary.summary}</p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {!result && (
          <div className="flex items-center lg:justify-end">
            <div className={`glowing-beam-button ${loading ? "glowing-beam-button--loading" : ""}`}>
              <div aria-hidden="true" className="glowing-beam-button__glow" />
              <Button
                type="button"
                size="lg"
                onClick={generate}
                disabled={loading}
                className="glowing-beam-button__surface"
              >
                {loading ? <RefreshCw className="animate-spin" /> : <Sparkles />}
                <span className={loading ? undefined : "glowing-beam-button__label"}>{loading ? "SUMMARIZING" : "SUMMARIZE"}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
