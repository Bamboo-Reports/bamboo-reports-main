import { cn } from "@/lib/utils"

/**
 * Loading placeholder with a moving shimmer sweep (the project's `shimmer`
 * keyframe), which stays clearly visible on the muted base color where the
 * default opacity pulse is too subtle.
 */
function Skeleton({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} {...props}>
      <div
        className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10"
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

export { Skeleton }
