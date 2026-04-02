export type Customer = {
  id: string
  name: string
  phone?: string
  address?: string
  notes?: string
  currentBalance: number
  isActive: boolean
  createdAt: string
}

export type CustomerPayment = {
  id: string
  paymentNo: string
  customerId: string
  customerName: string
  currencyCode: 'IQD' | 'USD'
  exchangeRate: number
  amount: number
  amountIqd: number
  notes?: string
  createdAt: string
}

export type CustomerUpsertInput = {
  name: string
  phone?: string
  address?: string
  notes?: string
}

export type CustomerPaymentRecordInput = {
  customerId: string
  customerName: string
  currencyCode: 'IQD' | 'USD'
  exchangeRate: number
  amount: number
  amountIqd: number
  notes?: string
}

const storedCustomers: Customer[] = []
const storedCustomerPayments: CustomerPayment[] = []

function createCustomerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cust-${crypto.randomUUID()}`
  }

  return `cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function createPaymentNo(sequence: number) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequence).padStart(4, '0')

  return `CUSTPAY-${year}${month}${day}-${serial}`
}

function assertUniqueCustomerName(name: string, excludedId?: string) {
  const normalizedName = name.trim()
  const existing = storedCustomers.find(
    (customer) => customer.name.trim() === normalizedName && customer.id !== excludedId,
  )

  if (existing) {
    throw new Error('اسم العميل مستخدم مسبقاً.')
  }
}

export function listCustomers() {
  return storedCustomers.map((customer) => ({ ...customer }))
}

export function findCustomerById(customerId: string) {
  return storedCustomers.find((customer) => customer.id === customerId) ?? null
}

export function createCustomer(input: CustomerUpsertInput) {
  assertUniqueCustomerName(input.name)

  const customer: Customer = {
    id: createCustomerId(),
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    currentBalance: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
  }

  storedCustomers.unshift(customer)
  return { ...customer }
}

export function updateCustomer(customerId: string, input: CustomerUpsertInput) {
  const customer = storedCustomers.find((entry) => entry.id === customerId)

  if (!customer) {
    throw new Error('العميل المطلوب غير موجود.')
  }

  assertUniqueCustomerName(input.name, customerId)
  customer.name = input.name.trim()
  customer.phone = input.phone?.trim() || undefined
  customer.address = input.address?.trim() || undefined
  customer.notes = input.notes?.trim() || undefined

  return { ...customer }
}

export function deleteCustomer(customerId: string) {
  const customerIndex = storedCustomers.findIndex((entry) => entry.id === customerId)

  if (customerIndex < 0) {
    throw new Error('العميل المطلوب غير موجود.')
  }

  const customer = storedCustomers[customerIndex]

  if (Math.abs(customer.currentBalance) > 0.01) {
    throw new Error('لا يمكن حذف عميل لديه رصيد قائم.')
  }

  storedCustomers.splice(customerIndex, 1)
  return { ...customer }
}

export function adjustCustomerBalance(customerId: string, amountDelta: number) {
  const customer = storedCustomers.find((entry) => entry.id === customerId)

  if (!customer) {
    throw new Error('العميل المطلوب غير موجود.')
  }

  customer.currentBalance = roundMoney(customer.currentBalance + amountDelta)
  return { ...customer }
}

export function listCustomerPayments(customerId?: string) {
  const source = customerId
    ? storedCustomerPayments.filter((payment) => payment.customerId === customerId)
    : storedCustomerPayments

  return source.map((payment) => ({ ...payment }))
}

export function createCustomerPayment(input: CustomerPaymentRecordInput) {
  const payment: CustomerPayment = {
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
  }

  storedCustomerPayments.unshift(payment)
  return { ...payment }
}