"use client"

import React from "react"
import { devError } from "@/lib/utils/dev-log"

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    devError("[MapErrorBoundary] Caught error:", error)
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    devError("[MapErrorBoundary] Error details:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-[600px] bg-muted rounded-lg">
          <div className="text-center p-6">
            <p className="text-lg font-semibold text-red-500 mb-2">Map Error</p>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message || "An error occurred while rendering the map"}
            </p>
            <details className="text-left max-w-md mx-auto">
              <summary className="text-xs text-muted-foreground cursor-pointer mb-2">
                Error Details
              </summary>
              <pre className="text-xs bg-background p-2 rounded overflow-auto max-h-40">
                {this.state.error?.stack || "No stack trace available"}
              </pre>
            </details>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
