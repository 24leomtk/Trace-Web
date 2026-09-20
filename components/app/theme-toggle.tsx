"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

/**
 * Segmented appearance control for the profile dialog — the floating nav's
 * icon-only toggle (tap = light/dark, hold = system) is undiscoverable, so
 * here all three modes get explicit icon + label buttons with room to spare.
 */
export function ThemePreferenceControl() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = mounted
    ? (THEME_OPTIONS.find((option) => option.value === theme) ??
      THEME_OPTIONS[2])
    : THEME_OPTIONS[2]

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Appearance
      </span>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-1 rounded-none border bg-muted/40 p-1"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const active = current.value === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-none px-3 py-1 text-sm font-medium transition-colors",
                active
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {option.label}
            </button>
          )
        })}
      </div>
      <span className="text-[11px] text-muted-foreground">
        System follows your device setting.
      </span>
    </div>
  )
}
