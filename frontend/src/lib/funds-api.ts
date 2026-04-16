import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type FundAccount = { id: string; name: string; code: string; type: 'revenue' | 'capital'; currentBalanceIqd: number; isSystem: boolean; isActive: boolean; createdAt: string }
export type FundMovement = { id: string; movementNo: string; movementDate: string; direction: 'inflow' | 'outflow' | 'transfer'; amountIqd: number; sourceFundAccountId?: string; sourceFundAccountName?: string; destinationFundAccountId?: string; destinationFundAccountName?: string; reason?: string; referenceType?: string; referenceId?: string; counterpartyName?: string; notes?: string; createdByEmployeeId?: string; createdByEmployeeName?: string; createdAt: string }
export type CapitalTransactionPayload = { movementDate: string; movementType: 'contribution' | 'repayment'; contributorName: string; amountIqd: number; sourceFundAccountId?: string; notes?: string }
export type CapitalTransaction = FundMovement
export type CapitalContributor = { contributorName: string; balanceIqd: number }

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchFundAccounts() {
  const res = await apiFetch('/funds/accounts')
  if (!res.ok) await parseError(res, 'تعذر تحميل الصناديق.')
  return (await res.json()).data as FundAccount[]
}

export async function fetchFundMovements() {
  const res = await apiFetch('/funds/movements')
  if (!res.ok) await parseError(res, 'تعذر تحميل حركات الصندوق.')
  return (await res.json()).data as FundMovement[]
}

export async function createCapitalTransaction(payload: CapitalTransactionPayload) {
  const res = await apiFetch('/funds/capital-transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) await parseError(res, 'تعذر تسجيل حركة رأس المال.')
  return (await res.json()).data as FundMovement
}

export async function fetchCapitalTransactions() {
  const res = await apiFetch('/funds/capital-transactions')
  if (!res.ok) await parseError(res, 'تعذر تحميل حركات رأس المال.')
  return (await res.json()).data as CapitalTransaction[]
}

export async function updateCapitalTransaction(movementId: string, payload: CapitalTransactionPayload) {
  const res = await apiFetch(`/funds/capital-transactions/${movementId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) await parseError(res, 'تعذر تعديل حركة رأس المال.')
  return (await res.json()).data as CapitalTransaction
}

export async function deleteCapitalTransaction(movementId: string) {
  const res = await apiFetch(`/funds/capital-transactions/${movementId}`, { method: 'DELETE' })
  if (!res.ok) await parseError(res, 'تعذر حذف حركة رأس المال.')
  return (await res.json()).data as { success?: boolean } | CapitalTransaction
}

export async function fetchCapitalContributors() {
  const res = await apiFetch('/funds/contributors')
  if (!res.ok) await parseError(res, 'تعذر تحميل قائمة المساهمين.')
  return (await res.json()).data as CapitalContributor[]
}
