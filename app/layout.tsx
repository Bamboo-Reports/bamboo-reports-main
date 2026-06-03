import type { Metadata } from "next"
import { DM_Sans } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppProviders } from "@/app/providers"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { MaintenancePage } from "@/components/maintenance-page"
import { Toaster } from "sonner"
import { validateEnv } from "@/lib/config/env-schema"

validateEnv()

const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true"

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
})

export const metadata: Metadata = {
  title: "Bamboo Reports - A Research NXT Product",
  description: "Intelligence-driven insights for accounts, centers, and services",
  generator: "Next.js",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <body>
        <AppProviders>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {isMaintenanceMode ? <MaintenancePage /> : children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </AppProviders>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
