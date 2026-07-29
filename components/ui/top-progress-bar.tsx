"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Thin indeterminate progress bar fixed to the top of the viewport
 * (YouTube/GitHub style). While `active`, it ramps quickly and then trickles
 * toward 90%; when `active` drops, it completes to 100% and fades out.
 */
export function TopProgressBar({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (active) {
      if (hideRef.current) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
      setVisible(true)
      setProgress((p) => (p > 0 && p < 90 ? p : 12))
      trickleRef.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.08))
      }, 180)
      return () => {
        if (trickleRef.current) clearInterval(trickleRef.current)
      }
    }

    if (trickleRef.current) clearInterval(trickleRef.current)
    setProgress((p) => (p === 0 ? 0 : 100))
    hideRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 400)
    return () => {
      if (hideRef.current) clearTimeout(hideRef.current)
    }
  }, [active])

  if (!visible && progress === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1" aria-hidden="true">
      <div
        className={cn(
          "h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)] transition-[width,opacity] duration-300 ease-out",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
