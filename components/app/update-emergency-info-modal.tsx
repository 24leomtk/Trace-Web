"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { isValidPhoneNumber } from "react-phone-number-input"
import { toast } from "sonner"
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"

import { updateMyEmergencyInfo } from "@/lib/actions/access"
import type { EmergencyInfo } from "@/lib/types"
import { ResponsiveModal } from "@/components/app/responsive-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PhoneInput } from "@/components/reui/phone-input"

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const

interface UpdateEmergencyInfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: EmergencyInfo
}

export function UpdateEmergencyInfoModal({
  open,
  onOpenChange,
  initialData,
}: UpdateEmergencyInfoModalProps) {
  const router = useRouter()
  const [bloodType, setBloodType] = useState<string>(initialData?.bloodType ?? "")
  const [allergies, setAllergies] = useState<string[]>(
    initialData?.allergies ?? []
  )
  const [allergyInput, setAllergyInput] = useState("")

  const [chronicConditions, setChronicConditions] = useState<string[]>(
    initialData?.chronicConditions ?? []
  )
  const [conditionInput, setConditionInput] = useState("")

  const [contactName, setContactName] = useState(
    initialData?.emergencyContact?.name ?? ""
  )
  const [contactRelation, setContactRelation] = useState(
    initialData?.emergencyContact?.relation ?? ""
  )
  const [contactPhone, setContactPhone] = useState(
    initialData?.emergencyContact?.phone ?? ""
  )

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setBloodType(initialData?.bloodType ?? "")
      setAllergies(initialData?.allergies ?? [])
      setAllergyInput("")
      setChronicConditions(initialData?.chronicConditions ?? [])
      setConditionInput("")
      setContactName(initialData?.emergencyContact?.name ?? "")
      setContactRelation(initialData?.emergencyContact?.relation ?? "")
      setContactPhone(initialData?.emergencyContact?.phone ?? "")
    }
  }, [open, initialData])

  function addAllergy() {
    const trimmed = allergyInput.trim()
    if (!trimmed) return
    if (!allergies.includes(trimmed)) {
      setAllergies([...allergies, trimmed])
    }
    setAllergyInput("")
  }

  function removeAllergy(item: string) {
    setAllergies(allergies.filter((a) => a !== item))
  }

  function addCondition() {
    const trimmed = conditionInput.trim()
    if (!trimmed) return
    if (!chronicConditions.includes(trimmed)) {
      setChronicConditions([...chronicConditions, trimmed])
    }
    setConditionInput("")
  }

  function removeCondition(item: string) {
    setChronicConditions(chronicConditions.filter((c) => c !== item))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (contactPhone && !isValidPhoneNumber(contactPhone)) {
      toast.error("Please enter a valid phone number for the emergency contact.")
      return
    }

    if (contactPhone && !contactName.trim()) {
      toast.error("Please provide a contact name if specifying a phone number.")
      return
    }

    setSubmitting(true)
    try {
      await updateMyEmergencyInfo({
        bloodType: bloodType || undefined,
        allergies,
        chronicConditions,
        emergencyContact:
          contactName.trim() && contactPhone.trim()
            ? {
                name: contactName.trim(),
                phone: contactPhone.trim(),
                relation: contactRelation.trim() || undefined,
              }
            : undefined,
      })
      toast.success("Emergency info updated successfully")
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error("Failed to update emergency information.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit emergency info"
      description="Keep your critical medical information up to date for emergency first responders and doctors."
      className="max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 text-left">
        {/* Blood Group */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Blood Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {BLOOD_TYPES.map((type) => {
              const selected = bloodType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBloodType(selected ? "" : type)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground font-semibold"
                      : "border-border bg-background hover:bg-muted text-foreground"
                  }`}
                >
                  {type}
                </button>
              )
            })}
          </div>
        </div>

        {/* Allergies */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Known Allergies
          </label>
          <div className="flex gap-2">
            <Input
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addAllergy()
                }
              }}
              placeholder="e.g. Penicillin, Peanuts"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAllergy}
              disabled={!allergyInput.trim()}
            >
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>
          {allergies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {allergies.map((allergy) => (
                <Badge
                  key={allergy}
                  variant="secondary"
                  className="flex items-center gap-1 py-1 pr-1.5 pl-2.5 text-xs"
                >
                  <span>{allergy}</span>
                  <button
                    type="button"
                    onClick={() => removeAllergy(allergy)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${allergy}`}
                  >
                    <Trash2Icon className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Chronic Conditions */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Chronic Conditions
          </label>
          <div className="flex gap-2">
            <Input
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addCondition()
                }
              }}
              placeholder="e.g. Asthma, Hypertension, Diabetes"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCondition}
              disabled={!conditionInput.trim()}
            >
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>
          {chronicConditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {chronicConditions.map((condition) => (
                <Badge
                  key={condition}
                  variant="secondary"
                  className="flex items-center gap-1 py-1 pr-1.5 pl-2.5 text-xs"
                >
                  <span>{condition}</span>
                  <button
                    type="button"
                    onClick={() => removeCondition(condition)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${condition}`}
                  >
                    <Trash2Icon className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Emergency Contact
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact name (e.g. Mary Banda)"
              autoComplete="off"
            />
            <Input
              value={contactRelation}
              onChange={(e) => setContactRelation(e.target.value)}
              placeholder="Relationship (e.g. Spouse, Sister)"
              autoComplete="off"
            />
          </div>
          <PhoneInput
            value={contactPhone}
            onChange={setContactPhone}
            countries={["MW"]}
            defaultCountry="MW"
            placeholder="Phone number — e.g. 991 778 899"
            aria-label="Emergency contact phone number"
            autoComplete="tel"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            <SaveIcon data-icon="inline-start" />
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  )
}
