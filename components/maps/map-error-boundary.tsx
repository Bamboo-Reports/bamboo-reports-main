"use client"

import React from "react"
import { MapErrorState } from "@/components/maps/map-error-state"
import { devError } from "@/lib/utils/dev-log"
import { captureError } from "@/lib/analytics/client"

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
    captureError(error, { boundary: "map", component_stack: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) {
      // The same screen as a map that fails to load; the message and stack go
      // to analytics and the console, not the page.
      return (
        <MapErrorState
          heightClass="h-full"
          kind="map"
          onReload={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}
