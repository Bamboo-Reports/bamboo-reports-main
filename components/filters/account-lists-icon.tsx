import { RiFileList3Line, RiUploadFill } from "@remixicon/react"
import { cn } from "@/lib/utils"

/**
 * The Account lists icon: a list with a small upload mark at its bottom-right
 * corner. The list is masked in a circle around the mark, so the two stay
 * apart on any button background and hover colour. Sizes are inline styles
 * because Button's icon sizes set every child svg to size-4 in CSS.
 */
export function AccountListsIcon({ size = 16, className }: { size?: number; className?: string }) {
  const mark = Math.round(size * 0.65)
  const offset = Math.round(size * 0.12)
  const centre = size + offset - mark / 2
  const gap = mark / 2 + 1
  const mask = `radial-gradient(circle at ${centre}px ${centre}px, transparent ${gap}px, #000 ${gap + 0.5}px)`

  return (
    <span aria-hidden className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
      <RiFileList3Line className="block" style={{ width: size, height: size, maskImage: mask }} />
      <RiUploadFill className="absolute" style={{ width: mark, height: mark, right: -offset, bottom: -offset }} />
    </span>
  )
}
