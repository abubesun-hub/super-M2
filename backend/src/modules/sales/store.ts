import { type CreateSaleInvoiceInput, type CreateSaleReturnInput } from './schemas.js'

export type SaleReturnSettlementType = 'cash-refund' | 'deduct-customer-balance'

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
  settlementType: SaleReturnSettlementType
  returnValueIqd: number
  cashRefundIqd: number
  debtReliefIqd: number
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

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

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
  const amountPaidIqd = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0))
  const remainingAmountIqd = roundMoney(Math.max(0, input.totalAmount - amountPaidIqd))
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

export function calculateSaleReturnValue(
  invoice: StoredSaleInvoice,
  items: Array<{ invoiceItemId?: string; productId?: string; quantity: number }>,
) {
  return roundMoney(items.reduce((sum, returnItem) => {
    const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId)

    if (!soldItem || soldItem.quantity <= 0) {
      return sum
    }

    return sum + ((soldItem.lineTotal / soldItem.quantity) * returnItem.quantity)
  }, 0))
}

export function getInvoiceReturnedValue(invoice: StoredSaleInvoice) {
  return roundMoney(invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.returnValueIqd, 0))
}

export function resolveSaleReturnSettlement(invoice: StoredSaleInvoice, input: CreateSaleReturnInput) {
  const returnValueIqd = calculateSaleReturnValue(invoice, input.items)

  if (returnValueIqd <= 0) {
    throw new Error('تعذر احتساب قيمة المرتجع المحددة.')
  }

  if (input.settlementType === 'cash-refund') {
    if (invoice.amountPaidIqd + 0.01 < returnValueIqd) {
      throw new Error('قيمة المرتجع النقدي تتجاوز المبلغ المدفوع والقابل للاسترداد في الفاتورة.')
    }

    const nextAmountPaidIqd = roundMoney(invoice.amountPaidIqd - returnValueIqd)
    const nextRemainingAmountIqd = roundMoney(Math.max(0, invoice.remainingAmountIqd))

    return {
      returnValueIqd,
      cashRefundIqd: returnValueIqd,
      debtReliefIqd: 0,
      nextAmountPaidIqd,
      nextRemainingAmountIqd,
      nextPaymentStatus: nextRemainingAmountIqd <= 0.01 ? 'paid' as const : nextAmountPaidIqd > 0 ? 'partial' as const : 'credit' as const,
    }
  }

  if (invoice.remainingAmountIqd + 0.01 < returnValueIqd) {
    throw new Error('قيمة المرتجع تتجاوز الرصيد الآجل القابل للتخفيض على العميل. استخدم رد نقدي إذا لزم الأمر.')
  }

  const nextRemainingAmountIqd = roundMoney(Math.max(0, invoice.remainingAmountIqd - returnValueIqd))

  return {
    returnValueIqd,
    cashRefundIqd: 0,
    debtReliefIqd: returnValueIqd,
    nextAmountPaidIqd: roundMoney(invoice.amountPaidIqd),
    nextRemainingAmountIqd,
    nextPaymentStatus: nextRemainingAmountIqd <= 0.01 ? 'paid' as const : invoice.amountPaidIqd > 0 ? 'partial' as const : 'credit' as const,
  }
}

export function createSaleReturn(invoice: StoredSaleInvoice, input: CreateSaleReturnInput) {
  const settlement = resolveSaleReturnSettlement(invoice, input)

  const saleReturn: StoredSaleReturn = {
    id: generateSaleReturnId(),
    createdAt: new Date().toISOString(),
    reason: input.reason,
    settlementType: input.settlementType,
    returnValueIqd: settlement.returnValueIqd,
    cashRefundIqd: settlement.cashRefundIqd,
    debtReliefIqd: settlement.debtReliefIqd,
    items: input.items,
  }

  invoice.amountPaidIqd = settlement.nextAmountPaidIqd
  invoice.remainingAmountIqd = settlement.nextRemainingAmountIqd
  invoice.paymentStatus = settlement.nextPaymentStatus
  invoice.returns.unshift(saleReturn)

  return saleReturn
}

export function resetSalesStore() {
  storedInvoices.splice(0, storedInvoices.length)
}
