import type { EmployeeRole } from '../employees/store.js'

export const systemPermissionKeys = [
  'dashboard',
  'inventory',
  'batches',
  'purchases',
  'expenses',
  'payroll',
  'employees',
  'customers',
  'sales',
  'shifts',
  'suppliers',
  'system-settings',
] as const

export type SystemPermission = (typeof systemPermissionKeys)[number]

export type RolePermissions = Record<EmployeeRole, SystemPermission[]>

export type SystemSettings = {
  storeName: string
  legalName?: string
  primaryPhone?: string
  secondaryPhone?: string
  whatsapp?: string
  email?: string
  address?: string
  invoiceFooter?: string
  defaultDiscountPercent: number
  maxManualDiscountPercent: number
  allowPriceDiscounts: boolean
  rolePermissions: RolePermissions
  updatedAt: string
}

export type SystemSettingsUpdateInput = Omit<SystemSettings, 'updatedAt'>

function uniqPermissions(permissions: SystemPermission[]) {
  return [...new Set(permissions)].filter((permission): permission is SystemPermission => systemPermissionKeys.includes(permission))
}

export function createDefaultRolePermissions(): RolePermissions {
  return {
    admin: [...systemPermissionKeys],
    cashier: ['customers', 'sales', 'shifts'],
    inventory: ['inventory', 'batches', 'purchases', 'suppliers'],
    accountant: ['expenses', 'payroll', 'employees'],
  }
}

export function createDefaultSystemSettings(): SystemSettings {
  return {
    storeName: 'Super M2',
    legalName: 'سوبر ماركت Super M2',
    primaryPhone: '',
    secondaryPhone: '',
    whatsapp: '',
    email: '',
    address: '',
    invoiceFooter: 'شكراً لتسوقكم معنا',
    defaultDiscountPercent: 0,
    maxManualDiscountPercent: 15,
    allowPriceDiscounts: false,
    rolePermissions: createDefaultRolePermissions(),
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeSystemSettings(input?: Partial<SystemSettingsUpdateInput> & { updatedAt?: string }): SystemSettings {
  const defaults = createDefaultSystemSettings()
  const rolePermissionsInput = input?.rolePermissions

  return {
    storeName: input?.storeName?.trim() || defaults.storeName,
    legalName: input?.legalName?.trim() || undefined,
    primaryPhone: input?.primaryPhone?.trim() || undefined,
    secondaryPhone: input?.secondaryPhone?.trim() || undefined,
    whatsapp: input?.whatsapp?.trim() || undefined,
    email: input?.email?.trim() || undefined,
    address: input?.address?.trim() || undefined,
    invoiceFooter: input?.invoiceFooter?.trim() || defaults.invoiceFooter,
    defaultDiscountPercent: typeof input?.defaultDiscountPercent === 'number' ? Math.max(0, Math.min(100, Number(input.defaultDiscountPercent.toFixed(2)))) : defaults.defaultDiscountPercent,
    maxManualDiscountPercent: typeof input?.maxManualDiscountPercent === 'number' ? Math.max(0, Math.min(100, Number(input.maxManualDiscountPercent.toFixed(2)))) : defaults.maxManualDiscountPercent,
    allowPriceDiscounts: typeof input?.allowPriceDiscounts === 'boolean' ? input.allowPriceDiscounts : defaults.allowPriceDiscounts,
    rolePermissions: {
      admin: [...systemPermissionKeys],
      cashier: uniqPermissions(rolePermissionsInput?.cashier ?? defaults.rolePermissions.cashier),
      inventory: uniqPermissions(rolePermissionsInput?.inventory ?? defaults.rolePermissions.inventory),
      accountant: uniqPermissions(rolePermissionsInput?.accountant ?? defaults.rolePermissions.accountant),
    },
    updatedAt: input?.updatedAt || defaults.updatedAt,
  }
}

export function resolvePermissionsForRole(settings: Pick<SystemSettings, 'rolePermissions'>, role: EmployeeRole): SystemPermission[] {
  if (role === 'admin') {
    return [...systemPermissionKeys]
  }

  return uniqPermissions(settings.rolePermissions[role] ?? [])
}

export function hasSystemPermission(settings: Pick<SystemSettings, 'rolePermissions'>, role: EmployeeRole, permission: SystemPermission) {
  return resolvePermissionsForRole(settings, role).includes(permission)
}