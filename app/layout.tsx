import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { AppProviders } from '@/app/providers'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { MaintenancePage } from '@/components/maintenance-page'
import { Toaster } from 'sonner'

const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true'

export const metadata: Metadata = {
  title: 'Bamboo Reports - A Research NXT Product',
  description: 'Intelligence-driven insights for accounts, centers, and services',
  generator: 'Next.js',
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
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
