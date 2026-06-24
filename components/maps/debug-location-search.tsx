"use client"

import React, { useEffect, useState } from "react"
import { Marker } from "@vis.gl/react-maplibre"

interface SearchResult {
  label: string
  lat: number
  lng: number
}

interface DebugLocationSearchProps {
  // Ref to the react-maplibre <Map> (or the underlying maplibre Map).
  mapRef: React.MutableRefObject<any>
}

// Debug-only location finder. Hidden by default; toggle with Ctrl/Cmd+Shift+F.
// Geocodes free text via OSM Nominatim (no API key) and drops a pin. Must be
// rendered as a child of <Map> so the <Marker> gets map context.
export function DebugLocationSearch({ mapRef }: DebugLocationSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pin, setPin] = useState<SearchResult | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // ponytail: Nominatim public server (1 req/sec usage policy), fine for dev use.
  // No countrycodes filter: Nominatim uses de-facto boundaries, so disputed areas
  // (e.g. Aksai Chin, filed under CN) would be dropped. Viewbox biases to India.
  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&viewbox=68,37,98,6&q=${encodeURIComponent(q)}`
      const res = await fetch(url, { headers: { Accept: "application/json" } })
      const data: Array<{ display_name: string; lat: string; lon: string }> = await res.json()
      setResults(data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) })))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSelect = (r: SearchResult) => {
    setPin(r)
    setResults([])
    setQuery(r.label.split(",")[0])
    const map = mapRef.current?.getMap?.() ?? mapRef.current
    map?.flyTo({ center: [r.lng, r.lat], zoom: 11, duration: 1000 })
  }

  if (!open) return null

  return (
    <>
      <div className="absolute top-3 right-3 z-20 w-[260px]">
        <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-popover/95 px-2 py-1 shadow-md backdrop-blur-md">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch()
              if (e.key === "Escape") setOpen(false)
            }}
            placeholder="Search a location (debug)..."
            className="w-full bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {pin && (
            <button
              type="button"
              onClick={() => {
                setPin(null)
                setQuery("")
                setResults([])
              }}
              className="px-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear pin"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-1 max-h-64 overflow-auto rounded-lg border border-border/80 bg-popover/95 shadow-lg backdrop-blur-md">
            {results.map((r, i) => (
              <li key={`${r.lat}-${r.lng}-${i}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="block w-full px-3 py-2 text-left text-xs text-popover-foreground hover:bg-accent"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pin && <Marker longitude={pin.lng} latitude={pin.lat} anchor="bottom" color="#ff6800" />}
    </>
  )
}
