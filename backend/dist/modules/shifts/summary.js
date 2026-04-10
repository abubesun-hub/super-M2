function roundMoney(value) {
    return Number(value.toFixed(2));
}
function getReturnValue(invoice) {
    return roundMoney(invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.returnValueIqd, 0));
}
function getCashRefundValue(invoice) {
    return roundMoney(invoice.returns.reduce((sum, saleReturn) => sum + saleReturn.cashRefundIqd, 0));
}
export function buildShiftFinancialSummary(openingFloatIqd, invoices, customerPayments = []) {
    const invoicesCount = invoices.length;
    const returnsCount = invoices.reduce((sum, invoice) => sum + invoice.returns.length, 0);
    const grossSalesIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0));
    const returnsValueIqd = roundMoney(invoices.reduce((sum, invoice) => sum + getReturnValue(invoice), 0));
    const cashRefundsIqd = roundMoney(invoices.reduce((sum, invoice) => sum + getCashRefundValue(invoice), 0));
    const netSalesIqd = roundMoney(grossSalesIqd - returnsValueIqd);
    const invoiceCollectionsIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.amountPaidIqd, 0));
    const customerPaymentsCount = customerPayments.length;
    const customerPaymentsIqd = roundMoney(customerPayments.reduce((sum, payment) => sum + payment.amountIqd, 0));
    const collectedCashIqd = roundMoney(invoiceCollectionsIqd + customerPaymentsIqd);
    const creditSalesIqd = roundMoney(invoices.reduce((sum, invoice) => sum + invoice.remainingAmountIqd, 0));
    const expectedCashIqd = roundMoney(openingFloatIqd + collectedCashIqd - cashRefundsIqd);
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
    };
}
