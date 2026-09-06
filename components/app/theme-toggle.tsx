"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { useIsLargeScreen } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const

const LONG_PRESS_MS = 500

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLarge = useIsLargeScreen()

  const current = mounted
    ? (THEME_OPTIONS.find((option) => option.value === theme) ??
      THEME_OPTIONS[2])
    : THEME_OPTIONS[2]

  // Show the icon for the actual selected mode, not the resolved one,
  // so "system" has its own distinct icon instead of looking like light/dark.
  const TriggerIcon = current.icon

  const pressTimer = useState<{
    current: ReturnType<typeof setTimeout> | null
  }>(() => ({ current: null }))[0]
  const longPressFired = useState<{ current: boolean }>(() => ({
    current: false,
  }))[0]

  function toggleLightDark() {
    const base = current.value === "system" ? resolvedTheme : current.value
    setTheme(base === "dark" ? "light" : "dark")
  }

  function handlePointerDown() {
    longPressFired.current = false
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setTheme("system")
    }, LONG_PRESS_MS)
  }

  function clearPressTimer() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function handlePointerUp() {
    clearPressTimer()
  }

  function handleClick() {
    // Skip the click action if it was actually a long press.
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    toggleLightDark()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={`Theme · ${current.label}`}
          variant="ghost"
          size="icon-lg"
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={clearPressTimer}
          className={cn(
            "size-10 rounded-full text-muted-foreground hover:text-foreground",
            current.value !== "system" &&
              "bg-secondary text-secondary-foreground"
          )}
        >
          <TriggerIcon className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={isLarge ? "left" : "top"}>
        Theme: {current.label} (tap to toggle, hold for system)
      </TooltipContent>
    </Tooltip>
  )
}
