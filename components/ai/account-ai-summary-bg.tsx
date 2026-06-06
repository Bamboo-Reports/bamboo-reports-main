import React from "react"

interface AccountAISummaryBgProps {
  state: "idle" | "loading" | "result"
}

export function AccountAISummaryBg({ state }: AccountAISummaryBgProps) {
  const isLoading = state === "loading"

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl">
      <style>{`
        @keyframes shimmer-sweep {
          0% { transform: translateX(-150%) skewX(-15deg); }
          100% { transform: translateX(250%) skewX(-15deg); }
        }
      `}</style>

      {/* Shimmering Dotted Pixel Grid (Full Coverage) */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          isLoading ? "opacity-100" : "opacity-30"
        }`}
      >
        <div
          className="absolute inset-0"
          style={{
            maskImage: "radial-gradient(black 1px, transparent 1px)",
            WebkitMaskImage: "radial-gradient(black 1px, transparent 1px)",
            maskSize: "12px 12px",
            WebkitMaskSize: "12px 12px",
          }}
        >
          {/* Base dim dots */}
          <div className="absolute inset-0 bg-white/10" />
          
          {/* Sweeping Shimmer Beams (Stops smoothly on result) */}
          <div className={`absolute inset-0 transition-opacity duration-1000 ${state === 'result' ? 'opacity-0' : 'opacity-100'}`}>
            <div 
              className="absolute top-0 bottom-0 w-[40%] bg-gradient-to-r from-transparent via-white to-transparent opacity-100"
              style={{ animation: 'shimmer-sweep 8s infinite ease-in-out' }}
            />
            <div 
              className="absolute top-0 bottom-0 w-[60%] bg-gradient-to-r from-transparent via-white to-transparent opacity-60"
              style={{ animation: 'shimmer-sweep 12s infinite linear reverse' }}
            />
            <div 
              className="absolute top-0 bottom-0 w-[30%] bg-gradient-to-r from-transparent via-white to-transparent opacity-80"
              style={{ animation: 'shimmer-sweep 6s infinite ease-out 1s' }}
            />
          </div>
        </div>
      </div>

      {/* Soft Text Readability Wash / Vignette */}
      <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-background/20" />
    </div>
  )
}
