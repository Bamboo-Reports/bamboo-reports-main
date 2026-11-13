"use client"

import { useMemo } from "react"
import { useTheme } from "next-themes"

/**
 * Resolves a CSS colour (it may use theme variables, such as
 * "hsl(var(--muted-foreground))") to a plain rgb() string MapLibre can paint,
 * and resolves it again when the theme changes. Returns the fallback on the
 * server.
 */
export function useThemeColor(cssColor: string, fallback: string): string {
  const { resolvedTheme } = useTheme()
  return useMemo(() => {
    if (typeof document === "undefined" || !resolvedTheme) return fallback
    const probe = document.createElement("span")
    probe.style.color = cssColor
    probe.style.display = "none"
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color || fallback
  }, [cssColor, fallback, resolvedTheme])
}
