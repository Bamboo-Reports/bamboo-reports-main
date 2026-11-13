import * as React from "react"
import { cn } from "@/lib/utils"
import type { ChartTooltipContent } from "@/lib/tooltip/markup"

/**
 * The React twin of chartTooltipHtml (lib/tooltip/markup.ts): a name on top, an
 * optional large figure, then muted detail lines. Used where React draws the
 * tooltip itself (the treemap, the maps, the revenue chart); Highcharts charts
 * use the HTML string. Both share the .br-tip classes in app/globals.css.
 */
export function ChartTooltipCard({
  title,
  swatch,
  lead,
  leadUnit,
  subtitle,
  lines = [],
  variant = "chart",
  className,
  style,
}: ChartTooltipContent & { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("br-tip", variant === "card" ? "br-tip-card" : "br-tip-chart", className)} style={style}>
      <div className="br-tip-title">
        {swatch && <span className="br-tip-swatch" style={{ background: swatch }} />}
        <span>{title}</span>
      </div>
      {subtitle && <div className="br-tip-sub">{subtitle}</div>}
      {lead && (
        <span className="br-tip-lead">
          {lead}
          {leadUnit && <span className="br-tip-unit">{leadUnit}</span>}
        </span>
      )}
      {lines.length > 0 && (
        <div className="br-tip-lines">
          {lines.map(({ label, value }) => (
            <div key={`${label ?? ""}-${value}`} className="br-tip-line">
              {label ? (
                <>
                  {label}: <b>{value}</b>
                </>
              ) : (
                value
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
