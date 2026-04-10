import type { StoredSaleInvoice } from '../sales/store.js'
import type { CustomerPayment } from '../customers/store.js'

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
  return roundMoney(invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.returnValueIqd, 0))
}

function getCashRefundValue(invoice: StoredSaleInvoice) {
  return roundMoney(invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.cashRefundIqd, 0))
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
  const cashRefundsIqd = roundMoney(invoices.reduce((sum, invoice) => sum + getCashRefundValue(invoice), 0))
  const netSalesIqd = roundMoney(grossSalesIqd - returnsValueIqd)
  const invoiceCollectionsIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.amountPaidIqd, 0))
  const customerPaymentsCount = customerPayments.length
  const customerPaymentsIqd = roundMoney(customerPayments.reduce((sum, payment) => sum + payment.amountIqd, 0))
  const collectedCashIqd = roundMoney(invoiceCollectionsIqd + customerPaymentsIqd)
  const creditSalesIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.remainingAmountIqd, 0))
  const expectedCashIqd = roundMoney(openingFloatIqd + collectedCashIqd - cashRefundsIqd)

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