import { cn } from "@/lib/utils"

/**
 * Loading placeholder with a moving shimmer sweep (the project's `shimmer`
 * keyframe), which stays clearly visible where the default opacity pulse is
 * too subtle.
 *
 * Light mode uses a tinted base from the muted foreground rather than
 * `bg-muted`: the muted surface (94% lightness) sits on a 98% page background
 * and the white sweep on top of it was invisible, so a loading section read
 * as empty. Dark mode keeps the muted base, which already contrasts.
 */
function Skeleton({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted-foreground/[0.14] dark:bg-muted", className)}
      {...props}
    >
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10"
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

export { Skeleton }
