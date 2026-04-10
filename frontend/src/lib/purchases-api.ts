import type { CurrencyCode } from './currency'
import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type Supplier = {
  id: string
  name: string
  phone?: string
  currentBalance: number
  isActive: boolean
  createdAt: string
}

export type SupplierUpsertPayload = {
  name: string
  phone?: string
}

export type SupplierPayment = {
  id: string
  paymentNo: string
  supplierId: string
  supplierName: string
  currencyCode: CurrencyCode
  exchangeRate: number
  amount: number
  amountIqd: number
  sourceFundAccountId?: string
  sourceFundAccountName?: string
  notes?: string
  createdAt: string
}

export type SupplierPaymentPayload = {
  currencyCode: CurrencyCode
  exchangeRate: number
  amount: number
  sourceFundAccountId?: string
  notes?: string
}

export type PurchaseReceiptProductDraftPayload = {
  name: string
  productFamilyName?: string
  variantLabel?: string
  barcode: string
  wholesaleBarcode?: string
  plu?: string
  department: string
  measurementType: 'unit' | 'weight'
  retailUnit: string
  wholesaleUnit?: string
  wholesaleQuantity?: number
  vatRate: number
}

export type PurchaseReceiptItemPayload = {
  productId?: string
  productDraft?: PurchaseReceiptProductDraftPayload
  entryUnit: 'retail' | 'wholesale'
  quantity: number
  unitCost: number
  batchNo?: string
  expiryDate?: string
}

export type CreatePurchaseReceiptPayload = {
  supplierId?: string
  supplierName?: string
  purchaseDate?: string
  supplierInvoiceNo?: string
  currencyCode: CurrencyCode
  exchangeRate: number
  notes?: string
  items: PurchaseReceiptItemPayload[]
}

export type StoredPurchaseReceipt = {
  id: string
  receiptNo: string
  supplierId?: string
  supplierName?: string
  purchaseDate: string
  supplierInvoiceNo?: string
  currencyCode: CurrencyCode
  exchangeRate: number
  totalCost: number
  totalCostIqd: number
  notes?: string
  createdAt: string
  items: Array<{
    receiptItemId?: string
    productId: string
    name: string
    quantity: number
    baseQuantity: number
    entryUnit: 'retail' | 'wholesale'
    entryUnitLabel: string
    batchNo?: string
    expiryDate?: string
    unitCost: number
    unitCostIqd: number
    lineTotal: number
    lineTotalIqd: number
  }>
}

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchSuppliers() {
  const response = await apiFetch('/suppliers')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل الموردين.')
  }

  const body = (await response.json()) as { data: Supplier[] }
  return body.data
}

export async function fetchSupplierPayments(supplierId: string) {
  const response = await apiFetch(`/suppliers/${supplierId}/payments`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل دفعات المورد.')
  }

  const body = (await response.json()) as { data: SupplierPayment[] }
  return body.data
}

export async function createSupplier(payload: SupplierUpsertPayload) {
  const response = await apiFetch('/suppliers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر إنشاء المورد.')
  }

  const body = (await response.json()) as { data: Supplier }
  return body.data
}

export async function updateSupplier(supplierId: string, payload: SupplierUpsertPayload) {
  const response = await apiFetch(`/suppliers/${supplierId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تعديل المورد.')
  }

  const body = (await response.json()) as { data: Supplier }
  return body.data
}

export async function deleteSupplier(supplierId: string) {
  const response = await apiFetch(`/suppliers/${supplierId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حذف المورد.')
  }

  const body = (await response.json()) as { data: Supplier }
  return body.data
}

export async function submitSupplierPayment(supplierId: string, payload: SupplierPaymentPayload) {
  const response = await apiFetch(`/suppliers/${supplierId}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل دفعة المورد.')
  }

  const body = (await response.json()) as { data: SupplierPayment }
  return body.data
}

export async function fetchPurchaseReceipts() {
  const response = await apiFetch('/purchases/receipts')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل سندات الشراء.')
  }

  const body = (await response.json()) as { data: StoredPurchaseReceipt[] }
  return body.data
}

export async function submitPurchaseReceipt(payload: CreatePurchaseReceiptPayload) {
  const response = await apiFetch('/purchases/receipts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حفظ سند الشراء.')
  }

  const body = (await response.json()) as { data: StoredPurchaseReceipt }
  return body.data
}

export async function updatePurchaseReceipt(receiptId: string, payload: CreatePurchaseReceiptPayload) {
  const response = await apiFetch(`/purchases/receipts/${receiptId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تعديل سند الشراء.')
  }

  const body = (await response.json()) as { data: StoredPurchaseReceipt }
  return body.data
}

export async function deletePurchaseReceipt(receiptId: string) {
  const response = await apiFetch(`/purchases/receipts/${receiptId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حذف سند الشراء.')
  }

  const body = (await response.json()) as { data: StoredPurchaseReceipt }
  return body.data
}