"use client"

import { createContext, useContext, useMemo } from "react"

import type { User } from "@/lib/types"

interface UserContextValue {
  user: User
}

const UserContext = createContext<UserContextValue | undefined>(undefined)

export function UserProvider({
  user,
  children,
}: {
  user: User
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ user }), [user])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}
