import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useEmployeeSession } from './auth'
import { fetchViewerSystemSettings, systemPermissionKeys, type SystemPermission, type ViewerSystemSettings } from './system-settings-api'

function getDefaultPermissionsForRole(role: 'admin' | 'cashier' | 'inventory' | 'accountant'): SystemPermission[] {
  if (role === 'admin') {
    return [...systemPermissionKeys]
  }

  if (role === 'cashier') {
    return ['customers', 'sales', 'shifts']
  }

  if (role === 'inventory') {
    return ['inventory', 'batches', 'purchases', 'suppliers']
  }

  return ['expenses', 'payroll', 'employees']
}

type SystemSettingsContextValue = {
  viewerSettings: ViewerSystemSettings | null
  permissions: SystemPermission[]
  isLoading: boolean
  refresh: () => Promise<void>
}

const SystemSettingsContext = createContext<SystemSettingsContextValue | null>(null)

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useEmployeeSession()
  const [viewerSettings, setViewerSettings] = useState<ViewerSystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function refresh() {
    if (!session) {
      setViewerSettings(null)
      return
    }

    setIsLoading(true)

    try {
      setViewerSettings(await fetchViewerSystemSettings())
    } catch {
      setViewerSettings(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [session?.accessToken])

  const fallbackPermissions = session ? getDefaultPermissionsForRole(session.employee.role) : []

  const value = useMemo<SystemSettingsContextValue>(() => ({
    viewerSettings,
    permissions: viewerSettings?.permissions?.length ? viewerSettings.permissions : fallbackPermissions,
    isLoading,
    refresh,
  }), [viewerSettings, fallbackPermissions, isLoading])

  return <SystemSettingsContext.Provider value={value}>{children}</SystemSettingsContext.Provider>
}

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext)

  if (!context) {
    throw new Error('useSystemSettings must be used within SystemSettingsProvider.')
  }

  return context
}