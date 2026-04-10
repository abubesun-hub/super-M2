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
    return [...storedPurchaseReceipts]
        .reverse()
        .map((receipt) => ({
        ...receipt,
        items: receipt.items.map((item) => ({ ...item })),
    }));
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
export function findPurchaseReceiptById(receiptId) {
    return storedPurchaseReceipts.find((receipt) => receipt.id === receiptId) ?? null;
}
export function updatePurchaseReceipt(receiptId, input, items, totals) {
    const receipt = storedPurchaseReceipts.find((entry) => entry.id === receiptId);
    if (!receipt) {
        throw new Error('سند الشراء المطلوب غير موجود.');
    }
    receipt.supplierId = input.supplierId || undefined;
    receipt.supplierName = input.supplierName || undefined;
    receipt.purchaseDate = input.purchaseDate || receipt.purchaseDate;
    receipt.supplierInvoiceNo = input.supplierInvoiceNo || undefined;
    receipt.currencyCode = input.currencyCode;
    receipt.exchangeRate = input.exchangeRate;
    receipt.totalCost = totals.totalCost;
    receipt.totalCostIqd = totals.totalCostIqd;
    receipt.notes = input.notes || undefined;
    receipt.items = items.map((item) => ({ ...item }));
    return receipt;
}
export function deletePurchaseReceipt(receiptId) {
    const receiptIndex = storedPurchaseReceipts.findIndex((receipt) => receipt.id === receiptId);
    if (receiptIndex < 0) {
        throw new Error('سند الشراء المطلوب غير موجود.');
    }
    const [receipt] = storedPurchaseReceipts.splice(receiptIndex, 1);
    return receipt;
}
export function resetPurchasesStore() {
    storedPurchaseReceipts.splice(0, storedPurchaseReceipts.length);
}
