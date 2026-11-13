"use client"

import React, { useEffect, useState } from 'react'
import { RiCompass3Line, RiFileExcel2Line, RiHistoryLine, RiLogoutBoxRLine } from "@remixicon/react"
import { useTheme } from 'next-themes'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { captureEvent } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { useNumberFormatPreference, type NumberFormatPreference } from '@/hooks/use-number-format-preference'
import type { CurrentProfile } from '@/hooks/use-current-profile'

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const SEGMENT_GROUP_CLASS = "inline-grid grid-cols-3 rounded-lg bg-muted/80 p-0.5"
// Segments are menu radio items, so arrow keys reach them like the other rows.
const SEGMENT_BUTTON_CLASS = "flex h-6 cursor-default select-none items-center justify-center rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-60"
const SEGMENT_ACTIVE_CLASS = `${SEGMENT_BUTTON_CLASS} bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--border)/0.6)]`
const SEGMENT_IDLE_CLASS = `${SEGMENT_BUTTON_CLASS} text-muted-foreground hover:text-foreground data-[highlighted]:text-foreground`

/** Keeps the menu open when a segment is picked, as the old buttons did. */
const keepMenuOpen = (event: Event) => event.preventDefault()

function PreferenceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-1.5">
      <span className="text-[13px]">{label}</span>
      {children}
    </div>
  )
}

function ProfileThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme as ThemeMode | undefined) ?? 'light' : 'light'

  return (
    <PreferenceRow label="Theme">
      <DropdownMenuRadioGroup
        className={SEGMENT_GROUP_CLASS}
        aria-label="Theme"
        value={activeTheme}
        onValueChange={(value) => {
          if (value !== activeTheme) {
            captureEvent(ANALYTICS_EVENTS.THEME_CHANGED, {
              theme: value,
              previous_theme: activeTheme,
              source: 'profile_menu',
            })
          }
          setTheme(value)
        }}
      >
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuPrimitive.RadioItem
            key={option.value}
            value={option.value}
            disabled={!mounted}
            onSelect={keepMenuOpen}
            className={activeTheme === option.value ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}
          >
            {option.label}
          </DropdownMenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </PreferenceRow>
  )
}

const NUMBER_FORMAT_OPTIONS: Array<{ value: NumberFormatPreference; label: string; hint: string }> = [
  { value: 'auto', label: 'Auto', hint: 'Shortens only when a card is too narrow.' },
  { value: 'full', label: 'Full', hint: 'Always exact, for example 486,120.' },
  { value: 'short', label: 'Short', hint: 'Always shortened, for example 486K.' },
]

function ProfileNumberFormatSwitcher() {
  const [preference, setPreference] = useNumberFormatPreference()
  const active = NUMBER_FORMAT_OPTIONS.find((option) => option.value === preference) ?? NUMBER_FORMAT_OPTIONS[0]

  return (
    <>
      <PreferenceRow label="Numbers">
        <DropdownMenuRadioGroup
          className={SEGMENT_GROUP_CLASS}
          aria-label="Summary number format"
          value={preference}
          onValueChange={(value) => {
            const next = value as NumberFormatPreference
            if (next !== preference) {
              captureEvent(ANALYTICS_EVENTS.NUMBER_FORMAT_CHANGED, {
                number_format: next,
                previous_number_format: preference,
                source: 'profile_menu',
              })
            }
            setPreference(next)
          }}
        >
          {NUMBER_FORMAT_OPTIONS.map((option) => (
            <DropdownMenuPrimitive.RadioItem
              key={option.value}
              value={option.value}
              onSelect={keepMenuOpen}
              className={preference === option.value ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}
            >
              {option.label}
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </PreferenceRow>
      <p className="px-4 pb-3 pt-1 text-xs text-muted-foreground">{active.hint}</p>
    </>
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

const ITEM_CLASS = "h-8 gap-2.5 rounded-md px-2 text-[13px] [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground"

/** Who you are, theme and number format, then My exports, History, the tour and Sign out. */
export function ProfileMenu({ user, children, side = 'bottom', align = 'end', onStartTour, onOpenExports, onOpenHistory }: ProfileMenuProps) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) captureEvent(ANALYTICS_EVENTS.PROFILE_MENU_OPENED)
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8} className="w-[300px] overflow-hidden p-0">
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] font-semibold text-foreground">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground">{user.displayName}</span>
              <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs leading-5 text-muted-foreground">
                {user.roleLabel}
              </span>
            </div>
            <div className="truncate text-xs text-muted-foreground">{user.displayEmail}</div>
          </div>
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="pt-2">
          <ProfileThemeSwitcher />
          <ProfileNumberFormatSwitcher />
        </div>

        {(onOpenExports || onOpenHistory || onStartTour) && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <div className="p-1">
              {onOpenExports && (
                <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onOpenExports()}>
                  <RiFileExcel2Line />
                  My exports
                </DropdownMenuItem>
              )}
              {onOpenHistory && (
                <DropdownMenuItem
                  className={ITEM_CLASS}
                  onSelect={() => {
                    captureEvent(ANALYTICS_EVENTS.HISTORY_OPENED, { source: 'profile_menu' })
                    onOpenHistory()
                  }}
                >
                  <RiHistoryLine />
                  History
                </DropdownMenuItem>
              )}
              {onStartTour && (
                <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onStartTour()}>
                  <RiCompass3Line />
                  Take the tour
                </DropdownMenuItem>
              )}
            </div>
          </>
        )}

        <DropdownMenuSeparator className="m-0" />
        <div className="p-1">
          <DropdownMenuItem
            disabled={user.isLoading}
            className={`${ITEM_CLASS} focus:bg-exclude/[0.07] focus:text-exclude [&:focus_svg]:text-exclude`}
            onSelect={(event) => {
              event.preventDefault()
              void user.signOut()
            }}
          >
            <RiLogoutBoxRLine />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
