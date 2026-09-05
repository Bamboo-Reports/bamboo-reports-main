"use client"

/**
 * The brand mark from public/logo.svg, inlined so its four petals can settle
 * into place once when it appears. Colors match the logo file.
 */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <>
      <svg
        viewBox="0 0 65 45"
        className={className}
        role="img"
        aria-label="Bamboo Reports logo"
      >
        <path
          className="petal petal-1"
          d="M47.4656 7.10152C50.5784 3.9887 55.6252 3.98871 58.7381 7.10152V7.10152C61.8509 10.2143 61.8509 15.2612 58.7381 18.374L43.4038 33.7082L32.1313 22.4358L47.4656 7.10152Z"
          fill="#FFAE71"
        />
        <path
          className="petal petal-2"
          d="M16.8235 37.9412C13.7264 41.0383 8.70492 41.0384 5.60778 37.9412V37.9412C2.51065 34.8441 2.51065 29.8226 5.60778 26.7255L20.9704 11.3629L32.1861 22.5786L16.8235 37.9412Z"
          fill="#6EC4EA"
        />
        <path
          className="petal petal-3"
          d="M43.3475 11.1967C41.8631 9.72636 40.1036 8.56279 38.1695 7.77242C36.2355 6.98206 34.1646 6.58038 32.0753 6.59031C29.986 6.60025 27.9191 7.02161 25.9926 7.83034C24.0662 8.63907 22.3178 9.81933 20.8475 11.3037C19.3771 12.7881 18.2136 14.5476 17.4232 16.4817C16.6328 18.4158 16.2312 20.4866 16.2411 22.5759C16.251 24.6652 16.6724 26.7321 17.4811 28.6586C18.2899 30.5851 19.4701 32.3334 20.9545 33.8037L32.151 22.5002L43.3475 11.1967Z"
          fill="#3AACEE"
        />
        <path
          className="petal petal-4"
          d="M20.9545 33.8037C23.9524 36.7732 28.0071 38.4302 32.2267 38.4101C36.4462 38.3901 40.485 36.6946 43.4545 33.6967C46.424 30.6988 48.081 26.6441 48.0609 22.4245C48.0408 18.205 46.3454 14.1662 43.3475 11.1967L32.151 22.5002L20.9545 33.8037Z"
          fill="#F17C1D"
        />
      </svg>

      <style jsx>{`
        @keyframes petal-in {
          from {
            opacity: 0;
            transform: scale(0.55);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .petal {
          transform-box: fill-box;
          transform-origin: center;
          animation: petal-in 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }

        .petal-1 {
          animation-delay: 60ms;
        }
        .petal-2 {
          animation-delay: 160ms;
        }
        .petal-3 {
          animation-delay: 260ms;
        }
        .petal-4 {
          animation-delay: 360ms;
        }
      `}</style>
    </>
  )
}
