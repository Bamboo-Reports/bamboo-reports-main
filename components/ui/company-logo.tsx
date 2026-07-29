"use client"

import { useState } from "react"
import Image from "next/image"
import { Building2 } from "lucide-react"
import { useTheme } from "next-themes"
import { getBrandfetchClientId } from "@/lib/config/environment"
import { cn } from "@/lib/utils"

type LogoTheme = "light" | "dark" | "auto"
type LogoFallbackMode = "monogram" | "icon"

interface CompanyLogoProps {
  domain?: string
  companyName: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  theme?: LogoTheme
  fallbackMode?: LogoFallbackMode
  retina?: boolean
  priority?: boolean
}

const sizeMap = {
  sm: { container: "h-8 w-8", icon: "h-4 w-4", img: 80 },
  md: { container: "h-12 w-12", icon: "h-6 w-6", img: 100 },
  lg: { container: "h-16 w-16", icon: "h-8 w-8", img: 128 },
  xl: { container: "h-24 w-24", icon: "h-12 w-12", img: 150 },
}

const BRANDFETCH_CLIENT_ID = getBrandfetchClientId()

export function CompanyLogo({
  domain,
  companyName,
  size = "md",
  className,
  theme = "auto",
  fallbackMode = "monogram",
  retina = true,
  priority = false,
}: CompanyLogoProps) {
  const { resolvedTheme } = useTheme()
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Extract clean domain from www.domain.com or domain.com format
  const getCleanDomain = (url?: string): string | null => {
    if (!url) return null

    try {
      // Remove www. prefix if present
      let cleanUrl = url.trim().toLowerCase()
      if (cleanUrl.startsWith("www.")) {
        cleanUrl = cleanUrl.substring(4)
      }

      // Remove any protocol if present
      cleanUrl = cleanUrl.replace(/^https?:\/\//, "")

      // Remove any path/query/hash
      cleanUrl = cleanUrl.split("/")[0]
      cleanUrl = cleanUrl.split("?")[0]
      cleanUrl = cleanUrl.split("#")[0]

      // Validate domain has at least one dot
      if (!cleanUrl.includes(".")) {
        return null
      }

      return cleanUrl
    } catch {
      return null
    }
  }

  const cleanDomain = getCleanDomain(domain)
  const sizeConfig = sizeMap[size]
  const companyMonogram = companyName.trim().charAt(0).toUpperCase() || "?"
  const effectiveTheme: LogoTheme =
    theme === "auto" ? (resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "auto") : theme

  const renderFallback = () => (
    <div
      className={cn(
        "rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden",
        sizeConfig.container,
        className
      )}
      title={companyName}
      aria-label={`${companyName} logo fallback`}
    >
      {fallbackMode === "monogram" ? (
        <span className={cn("font-semibold text-primary", size === "sm" ? "text-xs" : size === "xl" ? "text-3xl" : "text-sm")}>
          {companyMonogram}
        </span>
      ) : (
        <Building2 className={cn("text-primary", sizeConfig.icon)} />
      )}
    </div>
  )

  if (!cleanDomain || !BRANDFETCH_CLIENT_ID || imageError) {
    return renderFallback()
  }

  // Brandfetch Logo API (https://docs.brandfetch.com/logo-api/overview):
  // options are path segments. fallback/404 makes missing logos error so the
  // onError handler can render the monogram instead of a placeholder image.
  const imgSize = retina ? sizeConfig.img * 2 : sizeConfig.img
  const segments = [`domain/${cleanDomain}`, `w/${imgSize}`, `h/${imgSize}`]
  if (effectiveTheme !== "auto") {
    segments.push(`theme/${effectiveTheme}`)
  }
  segments.push("fallback/404", "type/icon.png")
  const logoUrl = new URL(`https://cdn.brandfetch.io/${segments.join("/")}`)
  logoUrl.searchParams.set("c", BRANDFETCH_CLIENT_ID)

  return (
    <div
      className={cn(
        "rounded-xl bg-background border border-border/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative",
        sizeConfig.container,
        className
      )}
      title={companyName}
    >
      {/* Fallback while loading */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
          <Building2 className={cn("text-primary", sizeConfig.icon)} />
        </div>
      )}

      <Image
        src={logoUrl.toString()}
        alt={`${companyName} logo`}
        fill
        // Brandfetch already serves exact-size WebP, and its bot protection
        // blocks the Next image optimizer's server-side fetch. Load directly
        // in the browser instead.
        unoptimized
        className={cn(
          "object-contain transition-opacity duration-300",
          imageLoaded ? "opacity-100" : "opacity-0"
        )}
        sizes={`${sizeConfig.img}px`}
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        onLoad={() => setImageLoaded(true)}
        onError={() => {
          setImageError(true)
          setImageLoaded(false)
        }}
        style={{
          padding: "1%",
        }}
      />
    </div>
  )
}
