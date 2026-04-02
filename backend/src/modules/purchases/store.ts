import type { CreatePurchaseReceiptInput } from './schemas.js'

export type StoredPurchaseReceipt = {
  id: string
  receiptNo: string
  supplierId?: string
  supplierName?: string
  purchaseDate: string
  supplierInvoiceNo?: string
  currencyCode: 'IQD' | 'USD'
  exchangeRate: number
  totalCost: number
  totalCostIqd: number
  notes?: string
  createdAt: string
  items: Array<{
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

const storedPurchaseReceipts: StoredPurchaseReceipt[] = []

function createReceiptNo(sequence: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequence).padStart(4, '0')

  return `PUR-${year}${month}${day}-${serial}`
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function listPurchaseReceipts() {
  return [...storedPurchaseReceipts].reverse()
}

export function createPurchaseReceipt(
  input: CreatePurchaseReceiptInput,
  items: StoredPurchaseReceipt['items'],
  totals: Pick<StoredPurchaseReceipt, 'totalCost' | 'totalCostIqd'>,
) {
  const receipt: StoredPurchaseReceipt = {
    id: createId('purchase'),
    receiptNo: createReceiptNo(storedPurchaseReceipts.length + 1),
    supplierId: input.supplierId || undefined,
    supplierName: input.supplierName || undefined,
    purchaseDate: input.purchaseDate || new Date().toISOString().slice(0, 10),
    supplierInvoiceNo: input.supplierInvoiceNo || undefined,
    currencyCode: input.currencyCode,
    exchangeRate: input.exchangeRate,
    totalCost: totals.totalCost,
    totalCostIqd: totals.totalCostIqd,
    notes: input.notes || undefined,
    createdAt: new Date().toISOString(),
    items,
  }

  storedPurchaseReceipts.push(receipt)
  return receipt
}