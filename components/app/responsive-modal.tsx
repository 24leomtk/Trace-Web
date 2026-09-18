"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const SHEET_CLASS =
  "max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:-translate-x-0 max-lg:-translate-y-0 max-lg:w-full max-lg:max-w-full max-lg:rounded-b-none  max-lg:border-x-0 max-lg:border-b-0 max-lg:p-5 max-lg:pb-8 max-lg:data-open:slide-in-from-bottom-6 max-lg:data-open:zoom-in-100 max-lg:data-closed:slide-out-to-bottom-6 max-lg:data-closed:zoom-out-100"

interface ResponsiveModalProps extends React.ComponentProps<typeof Dialog> {
  title: string
  description?: string
  className?: string
  showCloseButton?: boolean
}

function ResponsiveModal({
  title,
  description,
  children,
  className,
  showCloseButton = true,
  ...props
}: ResponsiveModalProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn("gap-4 sm:max-w-md", SHEET_CLASS, className)}
        showCloseButton={showCloseButton}
      >
        <div
          aria-hidden="true"
          className="mx-auto -mt-1 h-1 w-10 shrink-0 rounded-none bg-muted-foreground/20 lg:hidden"
        />
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export {
  ResponsiveModal,
  DialogFooter as ResponsiveModalFooter,
  DialogHeader as ResponsiveModalHeader,
}
