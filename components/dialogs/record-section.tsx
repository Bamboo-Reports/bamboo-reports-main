import type { ReactNode } from "react"

/** A titled block inside a record window, with an optional count or note beside the title. */
export function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7 first:mt-0">
      <h3 className="mb-3 flex items-baseline gap-1.5 text-sm font-medium">
        {title}
        {meta !== undefined && <span className="text-xs font-normal tabular-nums text-muted-foreground">{meta}</span>}
      </h3>
      {children}
    </section>
  )
}
