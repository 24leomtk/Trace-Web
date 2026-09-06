"use client"

import { cn } from "@/lib/utils"
import { motion, type SVGMotionProps } from "motion/react"

const SIZE_MAP = {
  sm: 18,
  lg: 32,
  xl: 48,
} as const

const TEXT_SIZE_MAP = {
  sm: "text-base",
  lg: "text-base",
  xl: "text-4xl",
} as const

export const Logo = ({
  containerClassName,
  size = "lg",
  showName = true,
}: {
  containerClassName?: string
  showName?: boolean
  size?: keyof typeof SIZE_MAP
} & SVGMotionProps<SVGSVGElement>) => {
  const dimension = SIZE_MAP[size]
  const textSize = TEXT_SIZE_MAP[size]

  return (
    <div className={cn("relative flex items-center gap-2", containerClassName)}>
      <motion.img
        src="/logo.png"
        width={dimension}
        height={dimension}
        className="transition-all duration-200 hover:scale-105 dark:invert"
        alt="Chipatala Registry"
      />

      {showName && (
        <span className={cn("font-bold tracking-tight", textSize)}>
          Chipatala Registry
        </span>
      )}
    </div>
  )
}
