"use client"

import React, { useState } from "react"
import Image from "next/image"
import { Building2 } from "lucide-react"
import { useTheme } from "next-themes"
import { getLogoDevPublicKey } from "@/lib/config/environment"
import { cn } from "@/lib/utils"

type LogoFormat = "jpg" | "png" | "webp"
type LogoTheme = "light" | "dark" | "auto"
type LogoFallbackMode = "monogram" | "icon"

interface CompanyLogoProps {
  domain?: string
  companyName: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  theme?: LogoTheme
  format?: LogoFormat
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

const LOGO_DEV_PUBLIC_KEY = getLogoDevPublicKey() || "pk_GAZeDBqlSWS8CSE3PZ8WeA"

export function CompanyLogo({
  domain,
  companyName,
  size = "md",
  className,
  theme = "auto",
  format,
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
  const effectiveFormat: LogoFormat =
    format ?? (effectiveTheme === "auto" ? "webp" : "png")

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

  if (!cleanDomain || imageError) {
    return renderFallback()
  }

  const logoUrl = new URL(`https://img.logo.dev/${cleanDomain}`)
  logoUrl.searchParams.set("token", LOGO_DEV_PUBLIC_KEY)
  logoUrl.searchParams.set("size", String(sizeConfig.img))
  logoUrl.searchParams.set("format", effectiveFormat)
  logoUrl.searchParams.set("fallback", "404")
  if (effectiveTheme !== "auto") {
    logoUrl.searchParams.set("theme", effectiveTheme)
  }
  if (retina) {
    logoUrl.searchParams.set("retina", "true")
  }

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
