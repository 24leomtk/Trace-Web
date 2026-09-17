"use client"

import { useState } from "react"
import { CrosshairIcon, MapPinIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/** Build an OpenStreetMap link for coordinates (no tiles embedded). */
export function openStreetMapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
}

export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

/**
 * F10 GPS capture (Phase 3) — attaches precise coordinates to a filing.
 * Never required: no fix / no permission still files with the free-text
 * location. Map tiles remain deferred; coordinates display + link out.
 */
export function GeoCapture({
  latitude,
  longitude,
  onCaptured,
  onCleared,
}: {
  latitude: unknown
  longitude: unknown
  onCaptured: (coords: { latitude: number; longitude: number }) => void
  onCleared: () => void
}) {
  const [locating, setLocating] = useState(false)
  const hasFix =
    typeof latitude === "number" && typeof longitude === "number"

  function capture() {
    if (!("geolocation" in navigator)) {
      toast.error("This device has no GPS.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onCaptured({
          latitude: Math.round(position.coords.latitude * 100000) / 100000,
          longitude: Math.round(position.coords.longitude * 100000) / 100000,
        })
        toast.success("Location attached — verify the place name too.")
      },
      (error) => {
        setLocating(false)
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied — filing continues without GPS."
            : "GPS fix failed — filing continues without it."
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  if (hasFix) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={openStreetMapUrl(latitude as number, longitude as number)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <MapPinIcon className="size-4" />
          {formatCoords(latitude as number, longitude as number)}
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Remove GPS fix"
          onClick={onCleared}
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit rounded-full"
      disabled={locating}
      onClick={capture}
    >
      <CrosshairIcon data-icon="inline-start" />
      {locating ? "Locating…" : "Attach GPS location"}
    </Button>
  )
}
