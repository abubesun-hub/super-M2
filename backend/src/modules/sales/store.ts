import { type CreateSaleInvoiceInput, type CreateSaleReturnInput } from './schemas.js'

export type StoredSaleInvoiceItem = CreateSaleInvoiceInput['items'][number] & {
  id: string
  unitCost: number
  lineCost: number
  lineProfit: number
}

export type StoredSaleReturn = {
  id: string
  createdAt: string
  reason: string
  items: Array<{
    invoiceItemId?: string
    productId?: string
    quantity: number
  }>
}

export type StoredSaleInvoice = Omit<CreateSaleInvoiceInput, 'items'> & {
  id: string
  invoiceNo: string
  paymentStatus: 'paid' | 'partial' | 'credit'
  amountPaidIqd: number
  remainingAmountIqd: number
  createdAt: string
  items: StoredSaleInvoiceItem[]
  returns: StoredSaleReturn[]
}

const storedInvoices: StoredSaleInvoice[] = []

function createInvoiceNo(sequence: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequence).padStart(4, '0')

  return `POS-${year}${month}${day}-${serial}`
}

function generateInvoiceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function generateSaleReturnId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `return-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function listSaleInvoices() {
  return [...storedInvoices].reverse()
}

export function createSaleInvoice(input: CreateSaleInvoiceInput, items: StoredSaleInvoiceItem[]) {
  const amountPaidIqd = Number(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0).toFixed(2))
  const remainingAmountIqd = Number(Math.max(0, input.totalAmount - amountPaidIqd).toFixed(2))
  const invoice: StoredSaleInvoice = {
    ...input,
    items,
    id: generateInvoiceId(),
    invoiceNo: createInvoiceNo(storedInvoices.length + 1),
    paymentStatus: remainingAmountIqd <= 0.01 ? 'paid' : amountPaidIqd > 0 ? 'partial' : 'credit',
    amountPaidIqd,
    remainingAmountIqd,
    createdAt: new Date().toISOString(),
    returns: [],
  }

  storedInvoices.push(invoice)

  return invoice
}

export function findSaleInvoiceById(invoiceId: string) {
  return storedInvoices.find((invoice) => invoice.id === invoiceId) ?? null
}

export function getReturnedQuantity(invoice: StoredSaleInvoice, invoiceItemId: string) {
  return invoice.returns.reduce((sum, saleReturn) => {
    const returnedItem = saleReturn.items.find((item) => item.invoiceItemId === invoiceItemId)
    return sum + (returnedItem?.quantity ?? 0)
  }, 0)
}

export function createSaleReturn(invoice: StoredSaleInvoice, input: CreateSaleReturnInput) {
  const saleReturn: StoredSaleReturn = {
    ...input,
    id: generateSaleReturnId(),
    createdAt: new Date().toISOString(),
  }

  invoice.returns.unshift(saleReturn)

  return saleReturn
}
