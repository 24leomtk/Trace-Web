"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"
import { useIsLargeScreen } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface NavButtonProps {
  label: string
  onClick?: () => void
  href?: string
  active?: boolean
  children: React.ReactNode
}

export function NavButton({
  label,
  onClick,
  href,
  active,
  children,
}: NavButtonProps) {
  const isLarge = useIsLargeScreen()

  const button =
    href !== undefined ? (
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className={cn(
          "size-10 text-muted-foreground hover:text-foreground",
          active && "bg-secondary text-secondary-foreground"
        )}
      >
        <Link href={href} aria-label={label}>
          {children}
        </Link>
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "size-10 text-muted-foreground hover:text-foreground",
          active && "bg-secondary text-secondary-foreground"
        )}
      >
        {children}
      </Button>
    )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={isLarge ? "left" : "top"}>{label}</TooltipContent>
    </Tooltip>
  )
}
