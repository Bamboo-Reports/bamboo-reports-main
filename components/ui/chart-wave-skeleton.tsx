import { cn } from "@/lib/utils"

/**
 * Loading placeholder for charts: a faint line that drifts sideways like a
 * resting time series (the Cloudflare analytics style). The SVG holds two
 * identical wave periods and slides by exactly half its width, so the loop
 * is seamless. Respects reduced-motion preferences.
 */
export function ChartWaveSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      role="status"
      aria-label="Loading chart"
    >
      <svg
        className="absolute left-0 top-0 h-full w-[200%] animate-chart-wave motion-reduce:animate-none"
        viewBox="0 0 2400 400"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,200 Q150,130 300,200 T600,200 T900,200 T1200,200 T1500,200 T1800,200 T2100,200 T2400,200"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
