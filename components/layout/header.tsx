"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Compass, LogOut, Mail, Phone, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'
import { captureEvent, resetAnalytics } from '@/lib/analytics/client'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { getEnvironmentLabel } from '@/lib/config/environment'
import { normalizeUserRole } from '@/lib/auth/roles'
import { NOTIFICATIONS_ENABLED } from '@/lib/config/notifications'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface HeaderProps {
  onRefresh: () => void
  onStartTour?: () => void
}


export const Header = React.memo(function Header({ onRefresh, onStartTour }: HeaderProps): JSX.Element {
  const environmentLabel = getEnvironmentLabel()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let isMounted = true

    const loadProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email, phone, role')
        .eq('user_id', userId)
        .single()

      if (!isMounted) return
      if (error) {
        setProfile(null)
        return
      }
      setProfile(data)
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
        setSessionEmail(null)
        setLastSignInAt(null)
        setProfile(null)
        return
      }
      setSessionEmail(session.user.email ?? null)
      setLastSignInAt(session.user.last_sign_in_at ?? null)
      loadProfile(session.user.id)
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
  const formattedLastSignIn =
    lastSignInAt && !Number.isNaN(Date.parse(lastSignInAt))
      ? new Date(lastSignInAt).toLocaleString()
      : 'Unknown'

  const environmentBadgeLabel = environmentLabel === "DEV" ? "</> DEV" : null

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
                  <Badge
                    variant="outline"
                    className="h-5 shrink-0 rounded-md px-1.5 font-mono text-[10px] tracking-[0.12em]"
                  >
                    {environmentBadgeLabel}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2" data-tour="header-actions">
            <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 px-3 group" title="Refresh" aria-label="Refresh data">
              <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-300" />
            </Button>
            {NOTIFICATIONS_ENABLED ? <NotificationDropdown /> : null}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Profile" aria-label="Open profile menu">
                  <UserRound className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
                <div className="border-b border-border/60 bg-gradient-to-r from-blue-500/10 via-sky-500/5 to-background p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/15 text-sm font-semibold text-blue-700 dark:text-blue-300">
                      {userInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">{displayName}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 p-3 text-xs">
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </span>
                    <span className="max-w-[180px] truncate text-foreground">{displayEmail}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      Phone
                    </span>
                    <span className="text-foreground">{profile?.phone ?? 'Not set'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Access Role
                    </span>
                    <span className="font-medium text-foreground">{normalizedRole === 'admin' ? 'Admin' : 'Viewer'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-2">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      Last Sign In
                    </span>
                    <span className="text-foreground">{formattedLastSignIn}</span>
                  </div>
                </div>

                <DropdownMenuSeparator />
                <div className="p-2 space-y-1.5">
                  {onStartTour && (
                    <DropdownMenuItem
                      className="h-9 cursor-pointer rounded-md font-medium"
                      onSelect={() => onStartTour()}
                    >
                      <Compass className="h-4 w-4" />
                      Take a tour
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={isLoadingProfile}
                    className="h-9 cursor-pointer rounded-md border border-destructive/25 bg-destructive/10 font-medium text-destructive focus:bg-destructive/15 focus:text-destructive"
                    onSelect={(event) => {
                      event.preventDefault()
                      handleSignOut()
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
})
