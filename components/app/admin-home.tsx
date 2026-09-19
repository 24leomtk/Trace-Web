import Link from "next/link"
import {
  Building2Icon,
  KeyRoundIcon,
  LandmarkIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"

const LINKS = [
  {
    href: "/admin/users",
    label: "Manage users",
    detail: "Provision accounts across all 8 roles.",
    icon: UsersIcon,
  },
  {
    href: "/admin/access-review",
    label: "Access review",
    detail: "Recertify accounts — dormant users, blocked transitions.",
    icon: ShieldCheckIcon,
  },
  {
    href: "/admin/branches",
    label: "Branches",
    detail: "Stations and posts per domain and district.",
    icon: Building2Icon,
  },
  {
    href: "/admin/organizations",
    label: "Organizations",
    detail: "Courts, insurers, vehicle registry.",
    icon: LandmarkIcon,
  },
  {
    href: "/admin/api-keys",
    label: "API keys",
    detail: "Machine credentials for integrations.",
    icon: KeyRoundIcon,
  },
  {
    href: "/audit",
    label: "Audit log",
    detail: "Full visibility, all districts.",
    icon: ScrollTextIcon,
  },
]

export function AdminHome() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Accounts and reference data. Case data is out of scope for this role.
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center gap-3 rounded-none border bg-card px-4 py-3 transition-colors hover:bg-accent"
            >
              <link.icon className="size-5 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-[15px] font-medium">
                  {link.label}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {link.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
