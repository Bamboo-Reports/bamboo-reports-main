/** A map camera: where it looks and how far in. */
export interface MapCamera {
  latitude: number
  longitude: number
  zoom: number
}

/** The view both centre maps open on and recentre to: all of India. */
export const INDIA_MAP_VIEW: MapCamera = { latitude: 20.5937, longitude: 78.9629, zoom: 3.5 }
