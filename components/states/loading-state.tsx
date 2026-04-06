import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface LoadingStateProps {
  connectionStatus?: string
}

export function LoadingState(_: LoadingStateProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.14),transparent_40%),radial-gradient(circle_at_80%_15%,rgba(56,189,248,0.12),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(37,99,235,0.1),transparent_45%)] px-4 py-12">
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl animate-float-slow" />
      <div className="pointer-events-none absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-sky-500/15 blur-3xl animate-float-slow-delayed" />
      <div className="pointer-events-none absolute bottom-[-8rem] left-1/2 h-72 w-[26rem] -translate-x-1/2 rounded-full bg-blue-700/15 blur-3xl animate-breathe" />

      <Card className="relative z-10 w-full max-w-md border-border/70 bg-card/90 shadow-[0_30px_80px_-45px_rgba(59,130,246,0.5)] backdrop-blur-xl">
        <CardContent className="flex flex-col items-center p-8 sm:p-10">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40">
            <Loader2 className="h-7 w-7 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold text-foreground">Bamboo Reports is loading</h2>
            <p className="text-sm text-muted-foreground">Preparing your dashboard</p>
          </div>

          <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:150ms]" />
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:300ms]" />
          </div>

          <div className="mt-5 w-full">
            <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 animate-loading-bar" />
            </div>
          </div>
        </CardContent>
      </Card>

      <style jsx>{`
        @keyframes loading-bar {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(320%);
          }
        }

        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-14px);
          }
        }

        @keyframes breathe {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        .animate-loading-bar {
          animation: loading-bar 1.4s cubic-bezier(0.36, 0, 0.2, 1) infinite;
        }

        .animate-float-slow {
          animation: float-slow 7s ease-in-out infinite;
        }

        .animate-float-slow-delayed {
          animation: float-slow 8s ease-in-out infinite 0.8s;
        }

        .animate-breathe {
          animation: breathe 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
