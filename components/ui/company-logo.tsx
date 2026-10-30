"use client"

import { useState } from "react"
import Image from "next/image"
import { RiBuilding2Line } from "@remixicon/react"
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
  /** Enlarge the image 2px past its box to trim the padding built into the icons. */
  zoom?: boolean
}

const sizeMap = {
  // Table rows: a slightly tighter corner than the 12px default reads better at 40px.
  // zoom is the scale that grows the image 2px inside the 1px border (38 to 40, 46 to 48).
  sm: { container: "h-10 w-10 rounded-[10px]", icon: "h-5 w-5", img: 80, zoom: "scale-105" },
  md: { container: "h-12 w-12", icon: "h-6 w-6", img: 100, zoom: "scale-[1.045]" },
  lg: { container: "h-16 w-16", icon: "h-8 w-8", img: 128, zoom: "scale-[1.033]" },
  xl: { container: "h-24 w-24", icon: "h-12 w-12", img: 150, zoom: "scale-[1.022]" },
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
  zoom = false,
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
        <span className={cn("font-semibold text-primary", size === "xl" ? "text-3xl" : "text-sm")}>
          {companyMonogram}
        </span>
      ) : (
        <RiBuilding2Line className={cn("text-primary", sizeConfig.icon)} />
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
          <RiBuilding2Line className={cn("text-primary", sizeConfig.icon)} />
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
          zoom && sizeConfig.zoom,
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
