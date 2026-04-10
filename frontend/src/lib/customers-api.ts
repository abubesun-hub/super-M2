import type { CurrencyCode } from './currency'
import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type Customer = {
  id: string
  name: string
  phone?: string
  address?: string
  notes?: string
  currentBalance: number
  isActive: boolean
  createdAt: string
}

export type CustomerPayment = {
  id: string
  paymentNo: string
  customerId: string
  customerName: string
  currencyCode: CurrencyCode
  exchangeRate: number
  amount: number
  amountIqd: number
  shiftId?: string
  terminalName?: string
  destinationFundAccountId?: string
  destinationFundAccountName?: string
  notes?: string
  createdAt: string
}

export type CustomerUpsertPayload = {
  name: string
  phone?: string
  address?: string
  notes?: string
}

export type CustomerPaymentPayload = {
  currencyCode: CurrencyCode
  exchangeRate: number
  amount: number
  notes?: string
}

export async function fetchCustomers() {
  const response = await apiFetch('/customers')

  if (!response.ok) {
    throw new Error('تعذر تحميل العملاء من الخادم.')
  }

  const body = (await response.json()) as { data: Customer[] }
  return body.data
}

export async function createCustomer(payload: CustomerUpsertPayload) {
  const response = await apiFetch('/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر إنشاء العميل.'))
  }

  const body = (await response.json()) as { data: Customer }
  return body.data
}

export async function updateCustomer(customerId: string, payload: CustomerUpsertPayload) {
  const response = await apiFetch(`/customers/${customerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر تعديل العميل.'))
  }

  const body = (await response.json()) as { data: Customer }
  return body.data
}

export async function deleteCustomer(customerId: string) {
  const response = await apiFetch(`/customers/${customerId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر حذف العميل.'))
  }

  const body = (await response.json()) as { data: Customer }
  return body.data
}

export async function fetchCustomerPayments(customerId: string) {
  const response = await apiFetch(`/customers/${customerId}/payments`)

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر تحميل تسديدات العميل.'))
  }

  const body = (await response.json()) as { data: CustomerPayment[] }
  return body.data
}

export async function createCustomerPayment(customerId: string, payload: CustomerPaymentPayload) {
  const response = await apiFetch(`/customers/${customerId}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر تسجيل التسديد.'))
  }

  const body = (await response.json()) as { data: CustomerPayment }
  return body.data
}