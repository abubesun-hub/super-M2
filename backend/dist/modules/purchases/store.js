const storedPurchaseReceipts = [];
function createReceiptNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequence).padStart(4, '0');
    return `PUR-${year}${month}${day}-${serial}`;
}
function createId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function listPurchaseReceipts() {
    return [...storedPurchaseReceipts].reverse();
}
export function createPurchaseReceipt(input, items, totals) {
    const receipt = {
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
    };
    storedPurchaseReceipts.push(receipt);
    return receipt;
}
