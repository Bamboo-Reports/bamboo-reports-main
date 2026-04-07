"use client"

import React, { useState } from "react"
import Image from "next/image"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface CompanyLogoProps {
  domain?: string
  companyName: string
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
  theme?: "light" | "dark" | "auto"
}

const sizeMap = {
  sm: { container: "h-8 w-8", icon: "h-4 w-4", img: 80 },
  md: { container: "h-12 w-12", icon: "h-6 w-6", img: 100 },
  lg: { container: "h-16 w-16", icon: "h-8 w-8", img: 128 },
  xl: { container: "h-24 w-24", icon: "h-12 w-12", img: 150 },
}

export function CompanyLogo({
  domain,
  companyName,
  size = "md",
  className,
  theme = "auto",
}: CompanyLogoProps) {
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

  // If no valid domain or image failed to load, show fallback
  if (!cleanDomain || imageError) {
    return (
      <div
        className={cn(
          "rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0",
          sizeConfig.container,
          className
        )}
        title={companyName}
      >
        <Building2 className={cn("text-primary", sizeConfig.icon)} />
      </div>
    )
  }

  // Construct Hunter.io logo URL (no authentication required)
  const logoUrl = `https://logos.hunter.io/${cleanDomain}`

  return (
    <div
      className={cn(
        "rounded-lg bg-background border border-border/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative",
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
        src={logoUrl}
        alt={`${companyName} logo`}
        fill
        className={cn(
          "object-contain transition-opacity duration-300",
          imageLoaded ? "opacity-100" : "opacity-0"
        )}
        sizes={`${sizeConfig.img}px`}
        onLoadingComplete={() => setImageLoaded(true)}
        onError={() => {
          setImageError(true)
          setImageLoaded(false)
        }}
        style={{
          padding: "8%",
          transform: "scale(1.2)",
        }}
      />
    </div>
  )
}
