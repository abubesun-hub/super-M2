import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { EmployeeAuthenticationResult } from './employees-api'
import {
  clearStoredEmployeeSession,
  readStoredEmployeeSession,
  writeStoredEmployeeSession,
  type StoredEmployeeSession,
  employeeSessionChangedEvent,
} from './employee-session-storage'

export type EmployeeSession = StoredEmployeeSession

type EmployeeSessionContextValue = {
  session: EmployeeSession | null
  login: (result: EmployeeAuthenticationResult) => void
  logout: () => void
}

const EmployeeSessionContext = createContext<EmployeeSessionContextValue | null>(null)

export function EmployeeSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<EmployeeSession | null>(() => readStoredEmployeeSession())

  useEffect(() => {
    if (session) {
      writeStoredEmployeeSession(session, { notify: false })
      return
    }

    clearStoredEmployeeSession({ notify: false })
  }, [session])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    function syncSessionFromStorage() {
      setSession(readStoredEmployeeSession())
    }

    window.addEventListener('storage', syncSessionFromStorage)
    window.addEventListener(employeeSessionChangedEvent, syncSessionFromStorage)

    return () => {
      window.removeEventListener('storage', syncSessionFromStorage)
      window.removeEventListener(employeeSessionChangedEvent, syncSessionFromStorage)
    }
  }, [])

  const value = useMemo<EmployeeSessionContextValue>(() => ({
    session,
    login(result) {
      const nextSession: EmployeeSession = {
        employee: {
          id: result.employee.id,
          employeeNo: result.employee.employeeNo,
          name: result.employee.name,
          role: result.employee.role,
        },
        accessToken: result.accessToken,
        loggedInAt: new Date().toISOString(),
      }

      setSession(nextSession)
      writeStoredEmployeeSession(nextSession)
    },
    logout() {
      setSession(null)
      clearStoredEmployeeSession()
    },
  }), [session])

  return <EmployeeSessionContext.Provider value={value}>{children}</EmployeeSessionContext.Provider>
}

export function useEmployeeSession() {
  const context = useContext(EmployeeSessionContext)

  if (!context) {
    throw new Error('useEmployeeSession must be used within EmployeeSessionProvider.')
  }

  return context
}