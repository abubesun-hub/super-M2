import type { StoredSaleInvoice } from './sales-api'
import type { CustomerPayment } from './customers-api'

export type ShiftFinancialSummary = {
  invoicesCount: number
  returnsCount: number
  grossSalesIqd: number
  returnsValueIqd: number
  netSalesIqd: number
  invoiceCollectionsIqd: number
  customerPaymentsCount: number
  customerPaymentsIqd: number
  collectedCashIqd: number
  creditSalesIqd: number
  expectedCashIqd: number
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function getReturnValue(invoice: StoredSaleInvoice) {
  const total = invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.items.reduce((returnSum, returnedItem) => {
    const soldItem = invoice.items.find((item) => item.id === returnedItem.invoiceItemId)

    if (!soldItem || soldItem.quantity <= 0) {
      return returnSum
    }

    return returnSum + ((soldItem.lineTotal / soldItem.quantity) * returnedItem.quantity)
  }, 0), 0)

  return roundMoney(total)
}

export function buildShiftFinancialSummary(
  openingFloatIqd: number,
  invoices: StoredSaleInvoice[],
  customerPayments: CustomerPayment[] = [],
): ShiftFinancialSummary {
  const invoicesCount = invoices.length
  const returnsCount = invoices.reduce((sum, invoice) => sum + invoice.returns.length, 0)
  const grossSalesIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0))
  const returnsValueIqd = roundMoney(invoices.reduce((sum, invoice) => sum + getReturnValue(invoice), 0))
  const netSalesIqd = roundMoney(grossSalesIqd - returnsValueIqd)
  const invoiceCollectionsIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.amountPaidIqd, 0))
  const customerPaymentsCount = customerPayments.length
  const customerPaymentsIqd = roundMoney(customerPayments.reduce((sum, payment) => sum + payment.amountIqd, 0))
  const collectedCashIqd = roundMoney(invoiceCollectionsIqd + customerPaymentsIqd)
  const creditSalesIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.remainingAmountIqd, 0))
  const expectedCashIqd = roundMoney(openingFloatIqd + collectedCashIqd - returnsValueIqd)

  return {
    invoicesCount,
    returnsCount,
    grossSalesIqd,
    returnsValueIqd,
    netSalesIqd,
    invoiceCollectionsIqd,
    customerPaymentsCount,
    customerPaymentsIqd,
    collectedCashIqd,
    creditSalesIqd,
    expectedCashIqd,
  }
}