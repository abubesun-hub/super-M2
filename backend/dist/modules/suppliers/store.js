function createDefaultSuppliers() {
    return [
        {
            id: 'supp-nahrain',
            name: 'شركة النهرين للتجهيز',
            phone: '07700000001',
            currentBalance: 0,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'supp-baghdad-foods',
            name: 'بغداد فودز',
            phone: '07700000002',
            currentBalance: 0,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
    ];
}
const storedSuppliers = createDefaultSuppliers();
const storedSupplierPayments = [];
function createSupplierId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `supp-${crypto.randomUUID()}`;
    }
    return `supp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function createPaymentNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequence).padStart(4, '0');
    return `SUPPAY-${year}${month}${day}-${serial}`;
}
function assertUniqueSupplierName(name, excludedId) {
    const normalizedName = name.trim();
    const existing = storedSuppliers.find((supplier) => supplier.name.trim() === normalizedName && supplier.id !== excludedId);
    if (existing) {
        throw new Error('اسم المورد مستخدم مسبقاً.');
    }
}
export function listSuppliers() {
    return storedSuppliers.map((supplier) => ({ ...supplier }));
}
export function findSupplierById(supplierId) {
    return storedSuppliers.find((supplier) => supplier.id === supplierId) ?? null;
}
export function createSupplier(input) {
    assertUniqueSupplierName(input.name);
    const supplier = {
        id: createSupplierId(),
        name: input.name.trim(),
        phone: input.phone?.trim() || undefined,
        currentBalance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
    };
    storedSuppliers.unshift(supplier);
    return { ...supplier };
}
export function updateSupplier(supplierId, input) {
    const supplier = storedSuppliers.find((entry) => entry.id === supplierId);
    if (!supplier) {
        throw new Error('المورد المطلوب غير موجود.');
    }
    assertUniqueSupplierName(input.name, supplierId);
    supplier.name = input.name.trim();
    supplier.phone = input.phone?.trim() || undefined;
    return { ...supplier };
}
export function deleteSupplier(supplierId) {
    const supplierIndex = storedSuppliers.findIndex((entry) => entry.id === supplierId);
    if (supplierIndex < 0) {
        throw new Error('المورد المطلوب غير موجود.');
    }
    const supplier = storedSuppliers[supplierIndex];
    if (Math.abs(supplier.currentBalance) > 0.01) {
        throw new Error('لا يمكن حذف مورد لديه رصيد قائم.');
    }
    storedSuppliers.splice(supplierIndex, 1);
    return { ...supplier };
}
export function adjustSupplierBalance(supplierId, amountDelta) {
    const supplier = storedSuppliers.find((entry) => entry.id === supplierId);
    if (!supplier) {
        throw new Error('المورد المطلوب غير موجود.');
    }
    supplier.currentBalance = roundMoney(supplier.currentBalance + amountDelta);
    return { ...supplier };
}
export function listSupplierPayments(supplierId) {
    const source = supplierId
        ? storedSupplierPayments.filter((payment) => payment.supplierId === supplierId)
        : storedSupplierPayments;
    return source.map((payment) => ({ ...payment }));
}
export function createSupplierPayment(input) {
    const payment = {
        id: createSupplierId(),
        paymentNo: createPaymentNo(storedSupplierPayments.length + 1),
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        amount: roundMoney(input.amount),
        amountIqd: roundMoney(input.amountIqd),
        sourceFundAccountId: input.sourceFundAccountId,
        sourceFundAccountName: input.sourceFundAccountName,
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    storedSupplierPayments.unshift(payment);
    return { ...payment };
}
export function resetSuppliersStore() {
    storedSuppliers.splice(0, storedSuppliers.length, ...createDefaultSuppliers());
    storedSupplierPayments.splice(0, storedSupplierPayments.length);
}
