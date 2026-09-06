"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BuildingIcon, ClipboardListIcon, UsersIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin/users", label: "Users", icon: UsersIcon },
  { href: "/admin/hospitals", label: "Hospitals", icon: BuildingIcon },
  { href: "/admin/codes", label: "Codes", icon: ClipboardListIcon },
]

export function AdminSectionNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Administration sections"
      className="flex gap-1 rounded-[min(var(--radius-3xl),20px)] border bg-card p-1.5"
    >
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <link.icon className="size-3.5" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
