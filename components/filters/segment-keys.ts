import type React from "react"

/**
 * Arrow keys (and Home/End) for a segmented control or tab row built from
 * buttons: picks the neighbouring option and moves focus to it. Pair with
 * tabIndex={selected ? 0 : -1} on each button so the group is one tab stop.
 */
export function onSegmentKeyDown<T>(
  event: React.KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void
) {
  const index = values.indexOf(current)
  let next: number
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % values.length
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + values.length) % values.length
  else if (event.key === "Home") next = 0
  else if (event.key === "End") next = values.length - 1
  else return
  event.preventDefault()
  select(values[next])
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>("button")
  buttons?.[next]?.focus()
}
