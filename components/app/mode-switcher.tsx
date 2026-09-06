"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import {
  ActivityIcon,
  FolderOpenIcon,
  LayoutDashboardIcon,
  FileTextIcon,
} from "lucide-react"

import { useIsLargeScreen } from "@/hooks/use-media-query"
import { useHomeView } from "@/providers/home-view-context"
import { useUser } from "@/providers/user-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface ModeSwitcherProps {
  onRequestPatientSearch?: () => void
}

export function ModeSwitcher({ onRequestPatientSearch }: ModeSwitcherProps) {
  const isLarge = useIsLargeScreen()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { user } = useUser()
  const homeView = useHomeView()

  if (user.role === "DOCTOR") {
    const options = [
      { value: "personal", label: "My records", icon: FolderOpenIcon },
      { value: "patient", label: "Patient records", icon: FileTextIcon },
    ] as const
    const current =
      options.find((option) => option.value === homeView.doctorMode) ??
      options[0]

    function selectDoctorMode(value: (typeof options)[number]["value"]) {
      setOpen(false)
      if (value === "personal") {
        homeView.exitPatientChart()
        return
      }
      if (homeView.activePatient) {
        homeView.enterPatientChart()
      } else {
        onRequestPatientSearch?.()
      }
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Switch timeline mode"
                variant="ghost"
                size="icon-lg"
                className="size-10 rounded-full text-muted-foreground hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground"
              >
                <current.icon className="size-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side={isLarge ? "left" : "top"}>
            Mode · {current.label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          side={isLarge ? "left" : "top"}
          align={isLarge ? "end" : "center"}
          className="w-48 gap-0 p-1"
        >
          <Command>
            <CommandList>
              <CommandGroup heading="Timeline mode">
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => selectDoctorMode(option.value)}
                    data-checked={homeView.doctorMode === option.value}
                  >
                    <option.icon />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  if (user.role !== "DISTRICT_ADMIN" && user.role !== "NATIONAL_ADMIN") {
    return null
  }

  const options = [
    { value: "summary", label: "Summary feed", icon: LayoutDashboardIcon },
    { value: "disease", label: "Disease analytics", icon: ActivityIcon },
    { value: "personal", label: "My records", icon: FolderOpenIcon },
  ] as const
  const current =
    options.find((option) => option.value === homeView.adminMode) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label="Switch timeline mode"
              variant="ghost"
              size="icon-lg"
              className={cn(
                "size-10 rounded-full text-muted-foreground hover:text-foreground",
                pathname === "/" &&
                  "aria-expanded:bg-secondary aria-expanded:text-secondary-foreground"
              )}
            >
              <current.icon className="size-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={isLarge ? "left" : "top"}>
          Mode · {current.label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side={isLarge ? "left" : "top"}
        align={isLarge ? "end" : "center"}
        className="w-52 gap-0 p-1"
      >
        <Command>
          <CommandList>
            <CommandGroup heading="Timeline mode">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    homeView.setAdminMode(option.value)
                    setOpen(false)
                  }}
                  data-checked={homeView.adminMode === option.value}
                >
                  <option.icon />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
