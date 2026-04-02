const storedInvoices = [];
function createInvoiceNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequence).padStart(4, '0');
    return `POS-${year}${month}${day}-${serial}`;
}
function generateInvoiceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function generateSaleReturnId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `return-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function listSaleInvoices() {
    return [...storedInvoices].reverse();
}
export function createSaleInvoice(input, items) {
    const amountPaidIqd = Number(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0).toFixed(2));
    const remainingAmountIqd = Number(Math.max(0, input.totalAmount - amountPaidIqd).toFixed(2));
    const invoice = {
        ...input,
        items,
        id: generateInvoiceId(),
        invoiceNo: createInvoiceNo(storedInvoices.length + 1),
        paymentStatus: remainingAmountIqd <= 0.01 ? 'paid' : amountPaidIqd > 0 ? 'partial' : 'credit',
        amountPaidIqd,
        remainingAmountIqd,
        createdAt: new Date().toISOString(),
        returns: [],
    };
    storedInvoices.push(invoice);
    return invoice;
}
export function findSaleInvoiceById(invoiceId) {
    return storedInvoices.find((invoice) => invoice.id === invoiceId) ?? null;
}
export function getReturnedQuantity(invoice, invoiceItemId) {
    return invoice.returns.reduce((sum, saleReturn) => {
        const returnedItem = saleReturn.items.find((item) => item.invoiceItemId === invoiceItemId);
        return sum + (returnedItem?.quantity ?? 0);
    }, 0);
}
export function createSaleReturn(invoice, input) {
    const saleReturn = {
        ...input,
        id: generateSaleReturnId(),
        createdAt: new Date().toISOString(),
    };
    invoice.returns.unshift(saleReturn);
    return saleReturn;
}
