import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type FundAccount = {
  id: string
  name: string
  code: string
  type: 'revenue' | 'capital'
  currentBalanceIqd: number
  isSystem: boolean
  isActive: boolean
  createdAt: string
}

export type FundMovement = {
  id: string
  movementNo: string
  movementDate: string
  direction: 'inflow' | 'outflow' | 'transfer'
  amountIqd: number
  sourceFundAccountId?: string
  sourceFundAccountName?: string
  destinationFundAccountId?: string
  destinationFundAccountName?: string
  reason: 'customer-payment' | 'shift-remittance' | 'capital-contribution' | 'capital-repayment' | 'expense-payment' | 'supplier-payment'
  referenceType: 'customer-payment' | 'shift' | 'capital-transaction' | 'expense' | 'supplier-payment'
  referenceId?: string
  counterpartyName?: string
  notes?: string
  createdByEmployeeId?: string
  createdByEmployeeName?: string
  createdAt: string
}

export type CapitalTransactionPayload = {
  movementDate: string
  movementType: 'contribution' | 'repayment'
  contributorName: string
  amountIqd: number
  sourceFundAccountId?: string
  notes?: string
}

export type CapitalTransaction = FundMovement

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchFundAccounts() {
  const response = await apiFetch('/funds/accounts')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل الصناديق.')
  }

  const body = (await response.json()) as { data: FundAccount[] }
  return body.data
}

export async function fetchFundMovements() {
  const response = await apiFetch('/funds/movements')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل حركات الصندوق.')
  }

  const body = (await response.json()) as { data: FundMovement[] }
  return body.data
}

export async function createCapitalTransaction(payload: CapitalTransactionPayload) {
  const response = await apiFetch('/funds/capital-transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل حركة رأس المال.')
  }

  const body = (await response.json()) as { data: FundMovement }
  return body.data
}

export async function fetchCapitalTransactions() {
  const response = await apiFetch('/funds/capital-transactions')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل حركات رأس المال.')
  }

  const body = (await response.json()) as { data: CapitalTransaction[] }
  return body.data
}

export async function updateCapitalTransaction(movementId: string, payload: CapitalTransactionPayload) {
  const response = await apiFetch(`/funds/capital-transactions/${movementId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تعديل حركة رأس المال.')
  }

  const body = (await response.json()) as { data: CapitalTransaction }
  return body.data
}

export async function deleteCapitalTransaction(movementId: string) {
  const response = await apiFetch(`/funds/capital-transactions/${movementId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حذف حركة رأس المال.')
  }

  const body = (await response.json()) as { data: { success?: boolean } | CapitalTransaction }
  return body.data
}