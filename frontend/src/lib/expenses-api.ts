import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type ExpenseCategoryKind = 'operating' | 'service' | 'payroll' | 'supplier' | 'other'
export type ExpensePaymentMethod = 'cash' | 'bank'

export type ExpenseCategory = {
  id: string
  name: string
  code: string
  kind: ExpenseCategoryKind
  description?: string
  isSystem: boolean
  isActive: boolean
  createdAt: string
}

export type Expense = {
  id: string
  expenseNo: string
  expenseDate: string
  categoryId: string
  categoryName: string
  categoryKind: ExpenseCategoryKind
  amountIqd: number
  paymentMethod: ExpensePaymentMethod
  beneficiaryName?: string
  notes?: string
  createdByEmployeeId: string
  createdByEmployeeName: string
  sourceFundAccountId?: string
  sourceFundAccountName?: string
  shiftId?: string
  referenceType: 'manual' | 'supplier-payment' | 'employee-compensation'
  referenceId?: string
  status: 'posted'
  createdAt: string
}

export type ExpenseCategoryPayload = {
  name: string
  code: string
  kind: ExpenseCategoryKind
  description?: string
}

export type ExpensePayload = {
  expenseDate: string
  categoryId: string
  amountIqd: number
  paymentMethod: ExpensePaymentMethod
  sourceFundAccountId?: string
  beneficiaryName?: string
  notes?: string
  shiftId?: string
}

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchExpenseCategories() {
  const response = await apiFetch('/expenses/categories')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل فئات المصروفات.')
  }

  const body = (await response.json()) as { data: ExpenseCategory[] }
  return body.data
}

export async function createExpenseCategory(payload: ExpenseCategoryPayload) {
  const response = await apiFetch('/expenses/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر إنشاء فئة المصروف.')
  }

  const body = (await response.json()) as { data: ExpenseCategory }
  return body.data
}

export async function fetchExpenses() {
  const response = await apiFetch('/expenses')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل المصروفات.')
  }

  const body = (await response.json()) as { data: Expense[] }
  return body.data
}

export async function createExpense(payload: ExpensePayload) {
  const response = await apiFetch('/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل المصروف.')
  }

  const body = (await response.json()) as { data: Expense }
  return body.data
}