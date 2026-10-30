"use client"

import React, { useEffect, useState } from 'react'
import { RiCollapseHorizontalLine, RiCompass3Line, RiComputerLine, RiExpandHorizontalLine, RiFileZipLine, RiLogoutBoxRLine, RiMagicLine, RiMoonLine, RiSunLine, RiTimeLine } from "@remixicon/react"
import { useTheme } from 'next-themes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { captureEvent } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { useNumberFormatPreference, type NumberFormatPreference } from '@/hooks/use-number-format-preference'
import type { CurrentProfile } from '@/hooks/use-current-profile'

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'light', label: 'Light', icon: RiSunLine },
  { value: 'dark', label: 'Dark', icon: RiMoonLine },
  { value: 'system', label: 'System', icon: RiComputerLine },
]

const SEGMENT_GROUP_CLASS = "grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/35 p-1"
const SEGMENT_ACTIVE_CLASS = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-background px-2 py-1.5 text-xs font-semibold text-foreground shadow-sm ring-1 ring-border/60 transition-colors"
const SEGMENT_IDLE_CLASS = "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"

function ProfileThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme as ThemeMode | undefined) ?? 'light' : 'light'

  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Appearance</div>
      <div
        className={SEGMENT_GROUP_CLASS}
        role="tablist"
        aria-label="Theme preference"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const isActive = activeTheme === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={!mounted}
              onClick={() => {
                if (option.value !== activeTheme) {
                  captureEvent(ANALYTICS_EVENTS.THEME_CHANGED, {
                    theme: option.value,
                    previous_theme: activeTheme,
                    source: 'profile_menu',
                  })
                }
                setTheme(option.value)
              }}
              className={isActive ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const NUMBER_FORMAT_OPTIONS: Array<{
  value: NumberFormatPreference
  label: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'auto', label: 'Auto', hint: 'Shortens only when a card is too narrow', icon: RiMagicLine },
  { value: 'full', label: 'Full', hint: 'Always exact, for example 486,120', icon: RiExpandHorizontalLine },
  { value: 'short', label: 'Short', hint: 'Always shortened, for example 486K', icon: RiCollapseHorizontalLine },
]

function ProfileNumberFormatSwitcher() {
  const [preference, setPreference] = useNumberFormatPreference()
  const active = NUMBER_FORMAT_OPTIONS.find((option) => option.value === preference) ?? NUMBER_FORMAT_OPTIONS[0]

  return (
    <div className="px-4 pb-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Summary numbers</div>
      <div className={SEGMENT_GROUP_CLASS} role="tablist" aria-label="Summary number format">
        {NUMBER_FORMAT_OPTIONS.map((option) => {
          const Icon = option.icon
          const isActive = preference === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={option.hint}
              onClick={() => {
                if (option.value !== preference) {
                  captureEvent(ANALYTICS_EVENTS.NUMBER_FORMAT_CHANGED, {
                    number_format: option.value,
                    previous_number_format: preference,
                    source: 'profile_menu',
                  })
                }
                setPreference(option.value)
              }}
              className={isActive ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}
            >
              <Icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{active.hint}</p>
    </div>
  )
}

interface ProfileMenuProps {
  user: CurrentProfile
  /** The element that opens the menu (rendered with asChild). */
  children: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  onStartTour?: () => void
  onOpenExports?: () => void
  onOpenHistory?: () => void
}

/** Account details, appearance and number format, tour, exports, history and sign out. */
export function ProfileMenu({ user, children, side = 'bottom', align = 'end', onStartTour, onOpenExports, onOpenHistory }: ProfileMenuProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) captureEvent(ANALYTICS_EVENTS.PROFILE_MENU_OPENED)
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-80 p-0 overflow-hidden">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="truncate text-sm font-semibold text-foreground">{user.displayName}</div>
              <span
                className={
                  user.role === 'admin'
                    ? 'shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary'
                    : 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
                }
              >
                {user.roleLabel}
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.displayEmail}</div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <div className="px-4 py-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span className={user.profile?.phone ? 'text-foreground' : 'text-muted-foreground'}>
              {user.profile?.phone ?? 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last sign in</span>
            <span className="text-foreground tabular-nums">{user.formattedLastSignIn}</span>
          </div>
        </div>

        <DropdownMenuSeparator />

        <ProfileThemeSwitcher />
        <ProfileNumberFormatSwitcher />

        <DropdownMenuSeparator />

        <div className="flex items-stretch gap-1 p-1.5">
          {onStartTour && (
            <DropdownMenuItem
              className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus:text-foreground"
              onSelect={() => onStartTour()}
            >
              <RiCompass3Line className="h-4 w-4" />
              Tour
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={user.isLoading}
            className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-destructive/25 bg-destructive/5 px-2 py-2.5 text-[11px] font-medium text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10 focus:border-destructive/40 focus:bg-destructive/10 focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault()
              void user.signOut()
            }}
          >
            <RiLogoutBoxRLine className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </div>

        <div className="flex items-stretch gap-1 px-1.5 pb-1.5">
          {onOpenExports && (
            <DropdownMenuItem
              className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus:text-foreground"
              onSelect={() => onOpenExports()}
            >
              <RiFileZipLine className="h-4 w-4" />
              Exports
            </DropdownMenuItem>
          )}
          {onOpenHistory && (
            <DropdownMenuItem
              className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-border/60 bg-muted/20 px-2 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus:text-foreground"
              onSelect={() => {
                captureEvent(ANALYTICS_EVENTS.HISTORY_OPENED, { source: 'profile_menu' })
                onOpenHistory()
              }}
            >
              <RiTimeLine className="h-4 w-4" />
              History
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
