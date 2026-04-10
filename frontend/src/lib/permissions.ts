export type EmployeeRole = 'admin' | 'cashier' | 'inventory' | 'accountant'

export type SystemPermission =
  | 'dashboard'
  | 'inventory'
  | 'batches'
  | 'purchases'
  | 'expenses'
  | 'payroll'
  | 'employees'
  | 'customers'
  | 'sales'
  | 'shifts'
  | 'suppliers'
  | 'system-settings'

export function hasRoleAccess(role: EmployeeRole | null | undefined, allowedRoles: EmployeeRole[]) {
  if (!role) {
    return true
  }

  return allowedRoles.includes(role)
}

export function hasPermission(permissions: SystemPermission[], permission: SystemPermission) {
  return permissions.includes(permission)
}