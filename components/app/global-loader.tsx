"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { ActivityIcon, ShieldCheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const STATUS_MESSAGES = [
  "Connecting to TRACE…",
  "Securing authenticated session…",
  "Loading case workspace…",
  "Preparing duty roster…",
]
interface GlobalLoaderProps {
  className?: string
  message?: string
  fullScreen?: boolean
  showBadge?: boolean
}

export function GlobalLoader({
  className,
  message,
  fullScreen = true,
  showBadge = true,
}: GlobalLoaderProps) {
  const [statusIndex, setStatusIndex] = useState(0)

  useEffect(() => {
    if (message) return
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [message])

  const currentMessage = message ?? STATUS_MESSAGES[statusIndex]

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-8 text-center select-none",
        fullScreen ? "min-h-svh w-full" : "w-full py-16",
        className
      )}
    >
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute -z-10 flex items-center justify-center">
        <div className="size-64 animate-pulse rounded-full bg-primary/5 blur-3xl dark:bg-primary/10" />
        <div className="size-40 rounded-full bg-emerald-500/5 blur-2xl dark:bg-emerald-400/10" />
      </div>

      {/* Main emblem / radar ring */}
      <div className="relative mb-6 flex items-center justify-center">
        {/* Outer pulsing sonar ring */}
        <motion.div
          animate={{
            scale: [1, 1.45, 1.8],
            opacity: [0.35, 0.15, 0],
          }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: "easeOut",
          }}
          className="absolute size-24 rounded-full border border-primary/40 dark:border-primary/50"
        />

        {/* Mid rotating dashed orbit */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute size-20 rounded-full border border-dashed border-primary/20 dark:border-primary/30"
        />

        {/* Center glowing badge container */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-border/80 bg-background/80 shadow-lg shadow-primary/5 backdrop-blur-md dark:border-border/60 dark:bg-card/70"
        >
          {/* Subtle pulse overlay inside icon */}
          <motion.img
            src="/logo.png"
            alt="Chipatala Registry"
            width={34}
            height={34}
            className="object-contain drop-shadow-xs dark:invert"
            animate={{
              scale: [1, 1.06, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Online/active ping beacon */}
          <span className="absolute -top-1 -right-1 flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 dark:bg-emerald-300" />
            <span className="relative inline-flex size-3 rounded-full bg-emerald-500 ring-2 ring-background dark:bg-emerald-400" />
          </span>
        </motion.div>
      </div>

      {/* Brand headers */}
      <div className="flex max-w-xs flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <span>TRACE</span>
        </div>

        {showBadge && (
          <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <ShieldCheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
            <span>Tracking · Records · Case Evidence</span>
          </div>
        )}
      </div>

      {/* Dynamic status pill */}
      <div className="mt-5 flex h-7 items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentMessage}
            initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground shadow-2xs backdrop-blur-xs"
          >
            <ActivityIcon className="size-3 animate-pulse text-primary" />
            <span>{currentMessage}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Indeterminate linear loading bar */}
      <div className="mt-5 h-1 w-44 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary/30 via-primary to-primary/30"
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.6,
            ease: "easeInOut",
          }}
          style={{ width: "60%" }}
        />
      </div>
    </div>
  )
}
