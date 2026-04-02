import type { CartLine } from './pos'
import type { CurrencyCode } from './currency'

const pendingInvoicesStorageKey = 'super-m2-pending-sale-invoices'

export type SaleInvoicePayment = {
  paymentMethod: 'cash'
  currencyCode: CurrencyCode
  amountReceived: number
  amountReceivedIqd: number
  exchangeRate: number
}

export type CreateSaleInvoicePayload = {
  paymentType: 'cash' | 'credit' | 'partial'
  customerId?: string
  customerName?: string
  currencyCode: CurrencyCode
  exchangeRate: number
  subtotal: number
  vatAmount: number
  totalAmount: number
  items: Array<{
    productId: string
    name: string
    barcode: string
    quantity: number
    baseQuantity: number
    unitPrice: number
    vatRate: number
    lineTotal: number
    saleUnit: CartLine['saleUnit']
    unitLabel: string
    source: CartLine['source']
  }>
  payments: SaleInvoicePayment[]
  notes?: string
}

export type StoredSaleInvoiceItem = CreateSaleInvoicePayload['items'][number] & {
  id: string
  unitCost: number
  lineCost: number
  lineProfit: number
}

export type PendingSaleInvoice = {
  localId: string
  queuedAt: string
  payload: CreateSaleInvoicePayload
}

export type SaleInvoiceResponse = {
  id: string
  invoiceNo: string
  createdAt: string
  paymentStatus: 'paid' | 'partial' | 'credit'
  amountPaidIqd: number
  remainingAmountIqd: number
}

export type StoredSaleInvoice = Omit<CreateSaleInvoicePayload, 'items'> & {
  id: string
  invoiceNo: string
  paymentStatus: 'paid' | 'partial' | 'credit'
  amountPaidIqd: number
  remainingAmountIqd: number
  createdAt: string
  items: StoredSaleInvoiceItem[]
  returns: Array<{
    id: string
    createdAt: string
    reason: string
    items: Array<{
      invoiceItemId?: string
      productId: string
      quantity: number
    }>
  }>
}

function createPendingInvoiceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
}

export function buildSaleInvoicePayload(input: {
  cart: CartLine[]
  paymentType: CreateSaleInvoicePayload['paymentType']
  customerId?: string
  customerName?: string
  currencyCode: CurrencyCode
  exchangeRate: number
  subtotal: number
  vatAmount: number
  totalAmount: number
  payments: SaleInvoicePayment[]
}) {
  return {
    paymentType: input.paymentType,
    customerId: input.customerId,
    customerName: input.customerName,
    currencyCode: input.currencyCode,
    exchangeRate: input.exchangeRate,
    subtotal: input.subtotal,
    vatAmount: input.vatAmount,
    totalAmount: input.totalAmount,
    items: input.cart.map((line) => ({
      productId: line.productId,
      name: line.name,
      barcode: line.barcode,
      quantity: line.quantity,
      baseQuantity: line.baseQuantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      lineTotal: line.lineTotal,
      saleUnit: line.saleUnit,
      unitLabel: line.unitLabel,
      source: line.source,
    })),
    payments: input.payments,
  } satisfies CreateSaleInvoicePayload
}

export function readPendingInvoices() {
  const stored = localStorage.getItem(pendingInvoicesStorageKey)

  if (!stored) {
    return [] as PendingSaleInvoice[]
  }

  try {
    const parsed = JSON.parse(stored) as Array<CreateSaleInvoicePayload | PendingSaleInvoice>

    return parsed.map((entry) => {
      if ('payload' in entry && 'localId' in entry && 'queuedAt' in entry) {
        return entry
      }

      return {
        localId: createPendingInvoiceId(),
        queuedAt: new Date().toISOString(),
        payload: entry,
      }
    })
  } catch {
    return [] as PendingSaleInvoice[]
  }
}

export function enqueuePendingInvoice(payload: CreateSaleInvoicePayload) {
  const pending = [
    ...readPendingInvoices(),
    {
      localId: createPendingInvoiceId(),
      queuedAt: new Date().toISOString(),
      payload,
    },
  ]
  localStorage.setItem(pendingInvoicesStorageKey, JSON.stringify(pending))
  return pending.length
}

export function clearPendingInvoices() {
  localStorage.removeItem(pendingInvoicesStorageKey)
}

export function writePendingInvoices(invoices: PendingSaleInvoice[]) {
  if (invoices.length === 0) {
    clearPendingInvoices()
    return
  }

  localStorage.setItem(pendingInvoicesStorageKey, JSON.stringify(invoices))
}

export async function submitSaleInvoice(payload: CreateSaleInvoicePayload) {
  const response = await fetch(`${getApiBaseUrl()}/sales/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر حفظ الفاتورة على الخادم.')
  }

  const body = (await response.json()) as { data: SaleInvoiceResponse }
  return body.data
}

export async function fetchSaleInvoices() {
  const response = await fetch(`${getApiBaseUrl()}/sales/invoices`)

  if (!response.ok) {
    throw new Error('تعذر جلب سجل الفواتير من الخادم.')
  }

  const body = (await response.json()) as { data: StoredSaleInvoice[] }
  return body.data
}

export async function submitSaleReturn(input: {
  invoiceId: string
  reason: string
  items: Array<{
    invoiceItemId: string
    quantity: number
  }>
}) {
  const response = await fetch(`${getApiBaseUrl()}/sales/invoices/${input.invoiceId}/returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: input.reason,
      items: input.items,
    }),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر تنفيذ المرتجع على الخادم.')
  }

  const body = (await response.json()) as { data: StoredSaleInvoice }
  return body.data
}

export async function syncPendingInvoices() {
  const pendingInvoices = readPendingInvoices()

  if (pendingInvoices.length === 0) {
    return { syncedCount: 0, remainingCount: 0 }
  }

  const remainingInvoices: PendingSaleInvoice[] = []
  let syncedCount = 0

  for (const pendingInvoice of pendingInvoices) {
    try {
      await submitSaleInvoice(pendingInvoice.payload)
      syncedCount += 1
    } catch {
      remainingInvoices.push(pendingInvoice)
    }
  }

  writePendingInvoices(remainingInvoices)

  return {
    syncedCount,
    remainingCount: remainingInvoices.length,
  }
}
