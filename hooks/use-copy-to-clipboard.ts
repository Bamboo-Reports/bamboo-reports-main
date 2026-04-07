import { useCallback } from "react"
import { toast } from "sonner"

export function useCopyToClipboard() {
  return useCallback(async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(label ? `${label} copied` : "Copied to clipboard")
    } catch {
      toast.error("Failed to copy")
    }
  }, [])
}
