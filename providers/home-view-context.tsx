"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { getConnectedPatients } from "@/lib/actions/access"
import type { PatientSummary } from "@/lib/types"
import type { RecordType } from "@/validations/record"

export type DoctorMode = "personal" | "patient"
export type AdminMode = "summary" | "disease" | "personal"

export interface RecordTimelineFilters {
  type: RecordType | null
  from?: Date
  to?: Date
}

export const EMPTY_RECORD_FILTERS: RecordTimelineFilters = { type: null }

interface OpenPatientChartOptions {
  breakGlassReason?: string
}

interface HomeViewContextValue {
  connectedPatients: PatientSummary[]
  doctorMode: DoctorMode
  activePatient: PatientSummary | null
  openPatientChart: (
    patientId: string,
    options?: OpenPatientChartOptions
  ) => void
  enterPatientChart: () => void
  exitPatientChart: () => void
  breakGlassReason: string | null

  adminMode: AdminMode
  setAdminMode: (mode: AdminMode) => void
  selectedDiseaseId: string | null
  selectDisease: (diseaseId: string) => void

  recordFilters: RecordTimelineFilters
  setRecordFilters: (filters: RecordTimelineFilters) => void
}

const HomeViewContext = createContext<HomeViewContextValue | undefined>(undefined)

export function HomeViewProvider({
  initialPatients,
  children,
}: {
  initialPatients: PatientSummary[]
  children: React.ReactNode
}) {
  // Server-rendered list seeds the cache; mutations invalidate
  // ["connected-patients"] to refetch without a full page reload.
  const { data: connectedPatients = [] } = useQuery({
    queryKey: ["connected-patients"],
    queryFn: getConnectedPatients,
    initialData: initialPatients,
    staleTime: 30_000,
  })
  const [doctorMode, setDoctorMode] = useState<DoctorMode>("personal")
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [breakGlassReason, setBreakGlassReason] = useState<string | null>(null)
  const [adminMode, setAdminMode] = useState<AdminMode>("summary")
  const [selectedDiseaseId, setSelectedDiseaseId] = useState<string | null>(null)
  const [recordFilters, setRecordFilters] =
    useState<RecordTimelineFilters>(EMPTY_RECORD_FILTERS)

  const openPatientChart = useCallback(
    (patientId: string, options?: OpenPatientChartOptions) => {
      setSelectedPatientId(patientId)
      setBreakGlassReason(options?.breakGlassReason ?? null)
      setDoctorMode("patient")
    },
    []
  )

  const enterPatientChart = useCallback(() => {
    setDoctorMode("patient")
  }, [])

  const exitPatientChart = useCallback(() => {
    setDoctorMode("personal")
    setSelectedPatientId(null)
    setBreakGlassReason(null)
  }, [])

  const selectDisease = useCallback((diseaseId: string) => {
    setSelectedDiseaseId(diseaseId)
    setAdminMode("disease")
  }, [])

  const value = useMemo(
    () => ({
      connectedPatients,
      doctorMode,
      activePatient:
        connectedPatients.find((p) => p.id === selectedPatientId) ?? null,
      openPatientChart,
      enterPatientChart,
      exitPatientChart,
      breakGlassReason,
      adminMode,
      setAdminMode,
      selectedDiseaseId,
      selectDisease,
      recordFilters,
      setRecordFilters,
    }),
    [
      connectedPatients,
      doctorMode,
      selectedPatientId,
      breakGlassReason,
      openPatientChart,
      enterPatientChart,
      exitPatientChart,
      adminMode,
      selectedDiseaseId,
      selectDisease,
      recordFilters,
    ]
  )

  return (
    <HomeViewContext.Provider value={value}>
      {children}
    </HomeViewContext.Provider>
  )
}

export function useHomeView() {
  const context = useContext(HomeViewContext)
  if (!context) {
    throw new Error("useHomeView must be used within a HomeViewProvider")
  }
  return context
}
