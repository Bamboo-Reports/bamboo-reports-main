'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { type MouseEvent, useEffect, useState } from 'react'

type ThemeName = 'light' | 'dark'
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => void
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className="h-8 w-8 px-0" aria-label="Toggle theme">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const nextTheme: ThemeName = resolvedTheme === 'dark' ? 'light' : 'dark'
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const documentWithTransition = document as DocumentWithViewTransition
    const root = document.documentElement
    const rect = event.currentTarget.getBoundingClientRect()
    const centerX = event.clientX || rect.left + rect.width / 2
    const centerY = event.clientY || rect.top + rect.height / 2
    const maxX = Math.max(centerX, window.innerWidth - centerX)
    const maxY = Math.max(centerY, window.innerHeight - centerY)
    const revealRadius = Math.hypot(maxX, maxY)
    root.style.setProperty('--theme-transition-x', `${centerX}px`)
    root.style.setProperty('--theme-transition-y', `${centerY}px`)
    root.style.setProperty('--theme-transition-radius', `${revealRadius}px`)

    if (!prefersReducedMotion && documentWithTransition.startViewTransition) {
      documentWithTransition.startViewTransition(() => setTheme(nextTheme))
      return
    }

    setTheme(nextTheme)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="h-8 w-8 px-0 relative overflow-hidden group"
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <div className="relative">
        {resolvedTheme === 'dark' ? (
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 group-hover:rotate-90 group-hover:scale-110" />
        ) : (
          <Moon className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 group-hover:-rotate-12 group-hover:scale-110" />
        )}
      </div>
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
