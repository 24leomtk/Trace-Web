"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2Icon, LandmarkIcon, UsersIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/branches", label: "Branches", icon: Building2Icon },
  { href: "/admin/organizations", label: "Organizations", icon: LandmarkIcon },
]

export function AdminSectionNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Administration sections" className="flex gap-1 rounded-full border bg-muted/40 p-1">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <link.icon className="size-4" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
