const storedCustomers = [];
const storedCustomerPayments = [];
function createCustomerId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `cust-${crypto.randomUUID()}`;
    }
    return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    return `CUSTPAY-${year}${month}${day}-${serial}`;
}
function assertUniqueCustomerName(name, excludedId) {
    const normalizedName = name.trim();
    const existing = storedCustomers.find((customer) => customer.name.trim() === normalizedName && customer.id !== excludedId);
    if (existing) {
        throw new Error('اسم العميل مستخدم مسبقاً.');
    }
}
export function listCustomers() {
    return storedCustomers.map((customer) => ({ ...customer }));
}
export function findCustomerById(customerId) {
    return storedCustomers.find((customer) => customer.id === customerId) ?? null;
}
export function createCustomer(input) {
    assertUniqueCustomerName(input.name);
    const customer = {
        id: createCustomerId(),
        name: input.name.trim(),
        phone: input.phone?.trim() || undefined,
        address: input.address?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        currentBalance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
    };
    storedCustomers.unshift(customer);
    return { ...customer };
}
export function updateCustomer(customerId, input) {
    const customer = storedCustomers.find((entry) => entry.id === customerId);
    if (!customer) {
        throw new Error('العميل المطلوب غير موجود.');
    }
    assertUniqueCustomerName(input.name, customerId);
    customer.name = input.name.trim();
    customer.phone = input.phone?.trim() || undefined;
    customer.address = input.address?.trim() || undefined;
    customer.notes = input.notes?.trim() || undefined;
    return { ...customer };
}
export function deleteCustomer(customerId) {
    const customerIndex = storedCustomers.findIndex((entry) => entry.id === customerId);
    if (customerIndex < 0) {
        throw new Error('العميل المطلوب غير موجود.');
    }
    const customer = storedCustomers[customerIndex];
    if (Math.abs(customer.currentBalance) > 0.01) {
        throw new Error('لا يمكن حذف عميل لديه رصيد قائم.');
    }
    storedCustomers.splice(customerIndex, 1);
    return { ...customer };
}
export function adjustCustomerBalance(customerId, amountDelta) {
    const customer = storedCustomers.find((entry) => entry.id === customerId);
    if (!customer) {
        throw new Error('العميل المطلوب غير موجود.');
    }
    customer.currentBalance = roundMoney(customer.currentBalance + amountDelta);
    return { ...customer };
}
export function listCustomerPayments(customerId) {
    const source = customerId
        ? storedCustomerPayments.filter((payment) => payment.customerId === customerId)
        : storedCustomerPayments;
    return source.map((payment) => ({ ...payment }));
}
export function createCustomerPayment(input) {
    const payment = {
        id: createCustomerId(),
        paymentNo: createPaymentNo(storedCustomerPayments.length + 1),
        customerId: input.customerId,
        customerName: input.customerName,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        amount: roundMoney(input.amount),
        amountIqd: roundMoney(input.amountIqd),
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    storedCustomerPayments.unshift(payment);
    return { ...payment };
}
