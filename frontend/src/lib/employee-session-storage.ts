import type { Employee } from './employees-api'

export const employeeSessionStorageKey = 'super-m2-employee-session'
export const employeeSessionChangedEvent = 'super-m2-employee-session-changed'

let cachedEmployeeSession: StoredEmployeeSession | null | undefined

export type StoredEmployeeSession = {
  employee: Pick<Employee, 'id' | 'employeeNo' | 'name' | 'role'>
  accessToken: string
  loggedInAt: string
}

function notifySessionChanged() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(employeeSessionChangedEvent))
}

export function readStoredEmployeeSession() {
  if (cachedEmployeeSession !== undefined) {
    return cachedEmployeeSession
  }

  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.localStorage.getItem(employeeSessionStorageKey)

  if (!stored) {
    cachedEmployeeSession = null
    return null
  }

  try {
    cachedEmployeeSession = JSON.parse(stored) as StoredEmployeeSession
    return cachedEmployeeSession
  } catch {
    cachedEmployeeSession = null
    return null
  }
}

export function writeStoredEmployeeSession(session: StoredEmployeeSession, options?: { notify?: boolean }) {
  if (typeof window === 'undefined') {
    return
  }

  cachedEmployeeSession = session
  window.localStorage.setItem(employeeSessionStorageKey, JSON.stringify(session))

  if (options?.notify !== false) {
    notifySessionChanged()
  }
}

export function clearStoredEmployeeSession(options?: { notify?: boolean }) {
  if (typeof window === 'undefined') {
    return
  }

  cachedEmployeeSession = null
  window.localStorage.removeItem(employeeSessionStorageKey)

  if (options?.notify !== false) {
    notifySessionChanged()
  }
}