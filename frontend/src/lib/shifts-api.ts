import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'
import type { ShiftFinancialSummary } from './shift-summary'

export type CashierShift = {
  id: string
  shiftNo: string
  employeeId: string
  employeeName: string
  terminalName: string
  openingFloatIqd: number
  openingNote?: string
  openedAt: string
  closedAt?: string
  closingNote?: string
  closingCashIqd?: number
  remittedToFundAccountId?: string
  remittedToFundAccountName?: string
  remittanceMovementId?: string
  cashDifferenceIqd?: number
  closingSummary?: ShiftFinancialSummary
  status: 'open' | 'closed'
}

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchShifts(employeeId?: string) {
  const params = new URLSearchParams()

  if (employeeId) {
    params.set('employeeId', employeeId)
  }

  const response = await apiFetch(`/shifts${params.size ? `?${params.toString()}` : ''}`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل الورديات.')
  }

  const body = (await response.json()) as { data: CashierShift[] }
  return body.data
}

export async function openShift(payload: {
  employeeId: string
  terminalName: string
  openingFloatIqd: number
  openingNote?: string
}) {
  const response = await apiFetch('/shifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر فتح الوردية.')
  }

  const body = (await response.json()) as { data: CashierShift }
  return body.data
}

export async function closeShift(payload: { shiftId: string; closingCashIqd: number; closingNote?: string }) {
  const response = await apiFetch(`/shifts/${payload.shiftId}/close`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ closingCashIqd: payload.closingCashIqd, closingNote: payload.closingNote }),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر إغلاق الوردية.')
  }

  const body = (await response.json()) as { data: CashierShift }
  return body.data
}