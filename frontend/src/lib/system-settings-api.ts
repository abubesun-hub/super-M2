import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'
import type { EmployeeRole } from './employees-api'

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

export type ViewerSystemSettings = {
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
  permissions: SystemPermission[]
  updatedAt: string
}

export type StorageInfo = {
  driver: 'memory' | 'postgres'
  persistence: boolean
  connected: boolean
  message: string
}

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchViewerSystemSettings() {
  const response = await apiFetch('/settings/me')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل إعدادات العرض الحالية.')
  }

  const body = (await response.json()) as { data: ViewerSystemSettings }
  return body.data
}

export async function fetchSystemSettings() {
  const response = await apiFetch('/settings')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل إعدادات النظام.')
  }

  const body = (await response.json()) as { data: SystemSettings }
  return body.data
}

export async function updateSystemSettings(payload: Omit<SystemSettings, 'updatedAt'>) {
  const response = await apiFetch('/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حفظ إعدادات النظام.')
  }

  const body = (await response.json()) as { data: SystemSettings }
  return body.data
}

export async function fetchStorageInfo() {
  const response = await apiFetch('/settings/storage')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل حالة التخزين.')
  }

  const body = (await response.json()) as { data: StorageInfo }
  return body.data
}

export async function resetAllSystemData() {
  const response = await apiFetch('/settings/data', {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseError(response, 'تعذر مسح جميع البيانات.')
  }

  const body = (await response.json()) as { data: { storage: StorageInfo; message: string } }
  return body.data
}