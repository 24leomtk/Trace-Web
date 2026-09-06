import Link from "next/link"
import {
  BuildingIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ShieldCheckIcon,
  SyringeIcon,
  UsersIcon,
} from "lucide-react"

const SECTIONS = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Create staff accounts, review medical staff first, import patients from Excel.",
    icon: UsersIcon,
  },
  {
    href: "/admin/hospitals",
    title: "Hospitals",
    description: "Facilities that doctors belong to across all districts.",
    icon: BuildingIcon,
  },
  {
    href: "/admin/codes?tab=diagnoses",
    title: "Diagnosis codes",
    description: "ICD-10 codebook used across outpatient, pathology and discharge records.",
    icon: ClipboardListIcon,
  },
  {
    href: "/admin/codes?tab=medications",
    title: "Medication codes",
    description: "Formulary behind every prescription and stock report.",
    icon: ShieldCheckIcon,
  },
  {
    href: "/admin/codes?tab=immunizations",
    title: "Immunization codes",
    description: "Vaccine codebook behind the immunization schedule.",
    icon: SyringeIcon,
  },
  {
    href: "/admin/codes?tab=guidelines",
    title: "Treatment guidelines",
    description: "First-line links between diagnoses and medications.",
    icon: ClipboardListIcon,
  },
]

export default function AdminHubPage() {
  return (
    <nav aria-label="Administration sections" className="flex flex-col gap-2">
      {SECTIONS.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-3 transition-colors hover:bg-muted"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background [&_svg]:size-4">
            <section.icon />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{section.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {section.description}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </nav>
  )
}
