"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { RiCompass3Line, RiComputerLine, RiFileZipLine, RiLogoutBoxRLine, RiMoonLine, RiRefreshLine, RiSearchLine, RiSunLine, RiTerminalBoxLine, RiTimeLine, RiUserLine } from "@remixicon/react"
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { captureEvent, identifyUser, resetAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { getEnvironmentLabel } from '@/lib/config/environment'
import { normalizeUserRole } from '@/lib/auth/roles'
import { NOTIFICATIONS_ENABLED } from '@/lib/config/notifications'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { markManualSignOut } from '@/hooks/use-auth-guard'
import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onRefresh: () => void
  /** True while a refresh is in flight; spins the icon and blocks re-entry. */
  refreshing?: boolean
  onStartTour?: () => void
  onOpenSearch?: () => void
  onOpenExports?: () => void
  onOpenHistory?: () => void
}

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

function ProfileThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme as ThemeMode | undefined) ?? 'light' : 'light'
  const activeIndex = Math.max(THEME_OPTIONS.findIndex((option) => option.value === activeTheme), 0)

  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Appearance</div>
      <div
        className="relative grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-muted/35 p-1 shadow-[inset_0_1px_2px_hsl(0_0%_0%/0.05)]"
        role="group"
        aria-label="Theme preference"
      >
        {/* Sliding indicator, matching the tab lists. Each step is one column plus the 0.25rem gap. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-1rem)/3)] rounded-md bg-background shadow-[0_1px_2px_hsl(0_0%_0%/0.08),0_0_0_1px_hsl(0_0%_0%/0.06)] transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none dark:shadow-[0_1px_2px_hsl(0_0%_0%/0.3),0_0_0_1px_hsl(0_0%_100%/0.1)]"
          style={{ transform: `translateX(calc(${activeIndex} * (100% + 0.25rem)))` }}
        />
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const isActive = activeTheme === option.value

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
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
              className={cn(
                "relative z-10 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:bg-background/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
              )}
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

export const Header = React.memo(function Header({ onRefresh, refreshing = false, onStartTour, onOpenSearch, onOpenExports, onOpenHistory }: HeaderProps): React.JSX.Element {
  const environmentLabel = getEnvironmentLabel()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    // getSession and the INITIAL_SESSION / SIGNED_IN / hourly TOKEN_REFRESHED
    // events all report the same user, so share one profile fetch per user.
    let profileLoad: { userId: string; promise: Promise<void> } | null = null

    const fetchProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email, phone, role')
        .eq('user_id', userId)
        .single()

      if (error) profileLoad = null
      if (!isMounted) return
      if (error) {
        setProfile(null)
        return
      }
      setProfile(data)
      identifyUser({
        id: userId,
        email: data.email,
        role: normalizeUserRole(data.role),
        firstName: data.first_name,
        lastName: data.last_name,
      })
    }

    const loadProfile = (userId: string) => {
      if (profileLoad?.userId !== userId) {
        profileLoad = { userId, promise: fetchProfile(userId) }
      }
      return profileLoad.promise
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      const user = data.session?.user
      if (!user) {
        setIsLoadingProfile(false)
        setSessionEmail(null)
        setLastSignInAt(null)
        setProfile(null)
        return
      }
      setSessionEmail(user.email ?? null)
      setLastSignInAt(user.last_sign_in_at ?? null)
      loadProfile(user.id).finally(() => setIsLoadingProfile(false))
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      if (!session?.user) {
        profileLoad = null
        setSessionEmail(null)
        setLastSignInAt(null)
        setProfile(null)
        return
      }
      setSessionEmail(session.user.email ?? null)
      setLastSignInAt(session.user.last_sign_in_at ?? null)
      void loadProfile(session.user.id)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    captureEvent(ANALYTICS_EVENTS.AUTH_SIGNED_OUT, {
      auth_provider: "email",
    })
    markManualSignOut()
    await supabase.auth.signOut()
    resetAnalytics()
    router.replace('/signin')
  }

  const displayName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : 'User'
  const displayEmail = profile?.email ?? sessionEmail ?? 'No email'
  const normalizedRole = normalizeUserRole(profile?.role)
  const userInitials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
  const formattedLastSignIn = (() => {
    if (!lastSignInAt || Number.isNaN(Date.parse(lastSignInAt))) return 'Unknown'
    const d = new Date(lastSignInAt)
    const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${date} · ${time}`
  })()
  const roleLabel = normalizedRole === 'admin' ? 'Admin' : 'Viewer'

  const environmentBadgeLabel = environmentLabel === "DEV" ? "DEV" : null

  return (
    <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto w-full px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-primary/20 bg-background">
              <Image
                src="/logo.svg"
                alt="Bamboo Reports logo"
                fill
                sizes="40px"
                className="object-contain p-1"
                priority
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-bold text-foreground">Bamboo Reports</p>
                {environmentBadgeLabel ? (
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/8 px-2 py-0.5 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <RiTerminalBoxLine className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="font-mono text-[10px] font-bold uppercase leading-none tracking-widest text-amber-700 dark:text-amber-300">
                      {environmentBadgeLabel}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" data-tour="header-actions">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search (⌘K)"
                aria-label="Open search"
                className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-muted-foreground hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 w-56"
              >
                <RiSearchLine className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left text-xs">Search…</span>
              </button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              title={refreshing ? 'Refreshing…' : 'Refresh'}
              aria-label={refreshing ? 'Refreshing data' : 'Refresh data'}
            >
              <RiRefreshLine className={refreshing ? 'animate-spin' : undefined} />
            </Button>
            {NOTIFICATIONS_ENABLED ? <NotificationDropdown /> : null}
            <DropdownMenu
              onOpenChange={(open) => {
                if (open) captureEvent(ANALYTICS_EVENTS.PROFILE_MENU_OPENED)
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" title="Profile" aria-label="Open profile menu">
                  <RiUserLine className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
                <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                    {userInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                      <span
                        className={
                          normalizedRole === 'admin'
                            ? 'shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary'
                            : 'shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
                        }
                      >
                        {roleLabel}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{displayEmail}</div>
                  </div>
                </div>

                <DropdownMenuSeparator />

                <div className="px-4 py-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className={profile?.phone ? 'text-foreground' : 'text-muted-foreground'}>
                      {profile?.phone ?? 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last sign in</span>
                    <span className="text-foreground tabular-nums">{formattedLastSignIn}</span>
                  </div>
                </div>

                <DropdownMenuSeparator />

                <ProfileThemeSwitcher />

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
                    disabled={isLoadingProfile}
                    className="flex flex-1 flex-col items-center justify-center gap-1 cursor-pointer rounded-md border border-destructive/25 bg-destructive/5 px-2 py-2.5 text-[11px] font-medium text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/10 focus:border-destructive/40 focus:bg-destructive/10 focus:text-destructive"
                    onSelect={(event) => {
                      event.preventDefault()
                      handleSignOut()
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
          </div>
        </div>
      </div>
    </div>
  )
})
