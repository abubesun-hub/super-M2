import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  calculateMixedPayment,
  formatDualMoney,
  formatMoney,
  IQD_PER_USD,
  supportedCurrencies,
  type CurrencyCode,
} from '../lib/currency'
import {
  buildSaleInvoicePayload,
  enqueuePendingInvoice,
  readPendingInvoices,
  submitSaleInvoice,
  syncPendingInvoices,
} from '../lib/sales-api'
import { createCustomer, fetchCustomers, type Customer } from '../lib/customers-api'
import { fetchProducts } from '../lib/products-api'
import {
  addLineToCart,
  calculateTotals,
  createCartLine,
  getCartLineMaxSaleQuantity,
  findProductByScan,
  getCartLineStockSummary,
  getCartStockConflict,
  getCartWarnings,
  getProductStockSummaries,
  getProductSaleModes,
  getSaleUnitLabel,
  hasWholesaleOption,
  parseScaleBarcode,
  sampleCatalog,
  updateCartLineQuantity,
  type CartLine,
  type Product,
  type SaleUnitMode,
} from '../lib/pos'

const cartStorageKey = 'super-m2-pos-cart'
const currencyStorageKey = 'super-m2-pos-currency'
const exchangeRateStorageKey = 'super-m2-pos-exchange-rate'
const scannerHint = 'مثال باركود عادي: 6281000010012 | باركود ميزان: 2400150562574'
const retailReceiptStoreName = 'Super M2'
type PosPaymentType = 'cash' | 'credit' | 'partial'

function readStoredCart() {
  const stored = localStorage.getItem(cartStorageKey)

  if (!stored) {
    return [] as CartLine[]
  }

  try {
    const parsed = JSON.parse(stored) as Array<Partial<CartLine>>
    return parsed.filter((line): line is CartLine => Boolean(line.lineId && line.productId && typeof line.baseQuantity === 'number'))
  } catch {
    return [] as CartLine[]
  }
}

function readStoredCurrency() {
  const stored = localStorage.getItem(currencyStorageKey)

  if (stored === 'IQD' || stored === 'USD') {
    return stored
  }

  return 'IQD' as CurrencyCode
}

function readStoredExchangeRate() {
  const stored = localStorage.getItem(exchangeRateStorageKey)
  const parsed = Number(stored)

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  return IQD_PER_USD
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function buildLocalInvoiceNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()).padStart(5, '0')

  return `PENDING-${year}${month}${day}-${serial}`
}

function getPaymentTypeLabel(paymentType: PosPaymentType) {
  if (paymentType === 'credit') {
    return 'بيع آجل'
  }

  if (paymentType === 'partial') {
    return 'بيع جزئي'
  }

  return 'بيع نقدي'
}

function getPaymentStatusLabel(paymentStatus: 'paid' | 'partial' | 'credit') {
  if (paymentStatus === 'credit') {
    return 'فاتورة آجلة'
  }

  if (paymentStatus === 'partial') {
    return 'فاتورة مسددة جزئياً'
  }

  return 'فاتورة مبيعات تجزئة'
}

function printRetailReceipt(input: {
  printWindow: Window | null
  invoiceNo: string
  createdAt: string
  items: ReturnType<typeof buildSaleInvoicePayload>['items']
  payments: ReturnType<typeof buildSaleInvoicePayload>['payments']
  paymentType: PosPaymentType
  customerName?: string
  subtotalIqd: number
  vatAmountIqd: number
  totalAmountIqd: number
  totalPaidIqd: number
  remainingAmountIqd: number
  changeIqd: number
  exchangeRate: number
  primaryCurrency: CurrencyCode
  statusLabel?: string
}) {
  if (!input.printWindow) {
    return false
  }

  const itemsMarkup = input.items.map((item, index) => `
    <tr>
      <td class="index">${index + 1}</td>
      <td class="name-cell">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${escapeHtml(item.unitLabel)} | ${item.saleUnit === 'wholesale' ? 'جملة' : 'مفرد'}</div>
      </td>
      <td class="qty">${escapeHtml(formatQuantity(item.quantity))}</td>
      <td class="price">${escapeHtml(formatMoney(item.unitPrice, input.primaryCurrency, input.exchangeRate))}</td>
      <td class="total">${escapeHtml(formatMoney(item.lineTotal, input.primaryCurrency, input.exchangeRate))}</td>
    </tr>
  `).join('')

  const paymentsMarkup = input.payments.map((payment, index) => `
    <div class="payment-row">
      <span>دفعة ${index + 1} - ${payment.currencyCode === 'USD' ? 'دولار' : 'دينار'}</span>
      <strong>${escapeHtml(payment.currencyCode === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.amountReceived) : formatMoney(payment.amountReceivedIqd, 'IQD', input.exchangeRate))}</strong>
    </div>
  `).join('')
  const customerMarkup = input.customerName
    ? `<div>العميل: ${escapeHtml(input.customerName)}</div>`
    : ''
  const paymentTypeMarkup = `<div>نوع الدفع: ${escapeHtml(getPaymentTypeLabel(input.paymentType))}</div>`
  const paymentsSectionMarkup = paymentsMarkup || '<div class="payment-row"><span>لا يوجد قبض مسجل الآن</span><strong>-</strong></div>'

  input.printWindow.document.write(`
    <html lang="ar" dir="rtl">
      <head>
        <title>${escapeHtml(input.invoiceNo)}</title>
        <style>
          @page { size: 80mm auto; margin: 6mm; }
          body { margin: 0; font-family: Tahoma, Arial, sans-serif; color: #111827; background: #fff; }
          .receipt { width: 72mm; margin: 0 auto; }
          .header { text-align: center; border-bottom: 1px dashed #9ca3af; padding-bottom: 10px; }
          .store { font-size: 22px; font-weight: 800; }
          .type { margin-top: 4px; font-size: 11px; letter-spacing: 0.18em; color: #b45309; font-weight: 700; }
          .meta { margin-top: 10px; font-size: 12px; line-height: 1.8; }
          .status { margin-top: 6px; display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ecfccb; color: #365314; font-size: 11px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px dashed #d1d5db; padding: 7px 0; font-size: 11px; vertical-align: top; }
          th { color: #6b7280; font-weight: 700; }
          .index { width: 16px; }
          .name-cell { width: 34%; }
          .item-name { font-weight: 700; color: #111827; }
          .item-meta { margin-top: 3px; color: #6b7280; font-size: 10px; }
          .qty, .price, .total { text-align: left; white-space: nowrap; }
          .totals { margin-top: 12px; border-top: 1px dashed #9ca3af; padding-top: 10px; }
          .total-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 7px; font-size: 12px; }
          .total-row strong { font-size: 13px; }
          .grand-total { font-size: 15px; font-weight: 800; color: #0f766e; }
          .payments { margin-top: 12px; border-top: 1px dashed #d1d5db; padding-top: 10px; }
          .payments-title { font-size: 11px; font-weight: 800; color: #92400e; margin-bottom: 6px; }
          .payment-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; margin-top: 5px; }
          .footer { margin-top: 14px; border-top: 1px dashed #9ca3af; padding-top: 10px; text-align: center; font-size: 11px; color: #4b5563; line-height: 1.8; }
        </style>
      </head>
      <body>
        <main class="receipt">
          <section class="header">
            <div class="store">${escapeHtml(retailReceiptStoreName)}</div>
            <div class="type">Retail Receipt</div>
            ${input.statusLabel ? `<div class="status">${escapeHtml(input.statusLabel)}</div>` : ''}
            <div class="meta">
              <div>رقم الفاتورة: ${escapeHtml(input.invoiceNo)}</div>
              <div>التاريخ: ${escapeHtml(formatDateTime(input.createdAt))}</div>
              ${paymentTypeMarkup}
              ${customerMarkup}
            </div>
          </section>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الصنف</th>
                <th>كمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>${itemsMarkup}</tbody>
          </table>

          <section class="totals">
            <div class="total-row"><span>الإجمالي قبل الضريبة</span><strong>${escapeHtml(formatMoney(input.subtotalIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>
            <div class="total-row"><span>ضريبة القيمة المضافة</span><strong>${escapeHtml(formatMoney(input.vatAmountIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>
            <div class="total-row grand-total"><span>الإجمالي النهائي</span><strong>${escapeHtml(formatMoney(input.totalAmountIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>
            <div class="total-row"><span>إجمالي المقبوض</span><strong>${escapeHtml(formatMoney(input.totalPaidIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>
            ${input.remainingAmountIqd > 0.01 ? `<div class="total-row"><span>المتبقي على العميل</span><strong>${escapeHtml(formatMoney(input.remainingAmountIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>` : ''}
            ${input.changeIqd > 0.01 ? `<div class="total-row"><span>الباقي للعميل</span><strong>${escapeHtml(formatMoney(input.changeIqd, input.primaryCurrency, input.exchangeRate))}</strong></div>` : ''}
          </section>

          <section class="payments">
            <div class="payments-title">تفاصيل الدفع</div>
            ${paymentsSectionMarkup}
          </section>

          <section class="footer">
            <div>شكراً لتسوقكم معنا</div>
            <div>تم إصدار فاتورة مبيعات تجزئة بنجاح</div>
          </section>
        </main>
      </body>
    </html>
  `)
  input.printWindow.document.close()
  input.printWindow.focus()
  input.printWindow.print()
  return true
}

export function PosPage() {
  const [scanInput, setScanInput] = useState('')
  const [cart, setCart] = useState<CartLine[]>(() => readStoredCart())
  const [products, setProducts] = useState<Product[]>(sampleCatalog)
  const [message, setMessage] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>(() => readStoredCurrency())
  const [exchangeRate, setExchangeRate] = useState(() => readStoredExchangeRate())
  const [payments, setPayments] = useState({ IQD: '', USD: '' })
  const [paymentType, setPaymentType] = useState<PosPaymentType>('cash')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customerNameInput, setCustomerNameInput] = useState('')
  const [isQuickCustomerFormOpen, setIsQuickCustomerFormOpen] = useState(false)
  const [quickCustomerName, setQuickCustomerName] = useState('')
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('')
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(() => readPendingInvoices().length)
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isUsingFallbackCatalog, setIsUsingFallbackCatalog] = useState(true)
  const [isCustomersLoading, setIsCustomersLoading] = useState(true)

  async function loadProducts() {
    setIsCatalogLoading(true)

    try {
      const catalog = await fetchProducts()
      setProducts(catalog)
      setIsUsingFallbackCatalog(false)
    } catch {
      setProducts(sampleCatalog)
      setIsUsingFallbackCatalog(true)
    } finally {
      setIsCatalogLoading(false)
    }
  }

  async function loadCustomers() {
    setIsCustomersLoading(true)

    try {
      const customerList = await fetchCustomers()
      setCustomers(customerList)
    } catch {
      setCustomers([])
    } finally {
      setIsCustomersLoading(false)
    }
  }

  async function handleCreateQuickCustomer() {
    const normalizedName = quickCustomerName.trim() || customerNameInput.trim()
    const normalizedPhone = quickCustomerPhone.trim()

    if (normalizedName.length < 2) {
      setMessage('أدخل اسم عميل لا يقل عن حرفين قبل الحفظ السريع.')
      return
    }

    if (!isOnline) {
      setMessage('الحفظ السريع للعميل يحتاج اتصالاً بالخادم. يمكنك كتابة اسم العميل مؤقتاً وإكمال البيع.')
      return
    }

    setIsCreatingCustomer(true)

    try {
      const createdCustomer = await createCustomer({
        name: normalizedName,
        phone: normalizedPhone || undefined,
      })

      setCustomers((currentCustomers) => {
        const nextCustomers = currentCustomers.filter((customer) => customer.id !== createdCustomer.id)
        return [createdCustomer, ...nextCustomers]
      })
      setSelectedCustomerId(createdCustomer.id)
      setCustomerNameInput('')
      setQuickCustomerName('')
      setQuickCustomerPhone('')
      setIsQuickCustomerFormOpen(false)
      setMessage(`تم إنشاء العميل ${createdCustomer.name} وربطه بالفاتورة الحالية.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء العميل من شاشة الكاشير.')
    } finally {
      setIsCreatingCustomer(false)
    }
  }

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem(currencyStorageKey, activeCurrency)
  }, [activeCurrency])

  useEffect(() => {
    localStorage.setItem(exchangeRateStorageKey, String(exchangeRate))
  }, [exchangeRate])

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    if (!isOnline || isSubmitting) {
      return
    }

    let cancelled = false

    async function flushPendingInvoices() {
      const result = await syncPendingInvoices()

      if (cancelled) {
        return
      }

      setPendingInvoicesCount(result.remainingCount)

      if (result.syncedCount > 0) {
        await Promise.all([loadProducts(), loadCustomers()])
        setMessage(
          `تمت مزامنة ${result.syncedCount} فاتورة معلقة بنجاح. المتبقي في الطابور: ${result.remainingCount}.`,
        )
      }
    }

    void flushPendingInvoices()

    return () => {
      cancelled = true
    }
  }, [isOnline, isSubmitting])

  useEffect(() => {
    async function loadProductsOnMount() {
      await Promise.all([loadProducts(), loadCustomers()])
    }

    void loadProductsOnMount()
  }, [])

  useEffect(() => {
    if (paymentType === 'credit') {
      setPayments({ IQD: '', USD: '' })
    }
  }, [paymentType])

  const totals = calculateTotals(cart)
  const warnings = getCartWarnings(cart)
  const subtotalBeforeVat = totals.subtotal - totals.vat
  const totalDisplay = {
    primary: formatMoney(totals.total, activeCurrency, exchangeRate),
    secondary: formatMoney(
      totals.total,
      activeCurrency === 'IQD' ? 'USD' : 'IQD',
      exchangeRate,
    ),
  }
  const subtotalDisplay = {
    primary: formatMoney(subtotalBeforeVat, activeCurrency, exchangeRate),
    secondary: formatMoney(
      subtotalBeforeVat,
      activeCurrency === 'IQD' ? 'USD' : 'IQD',
      exchangeRate,
    ),
  }
  const vatDisplay = {
    primary: formatMoney(totals.vat, activeCurrency, exchangeRate),
    secondary: formatMoney(
      totals.vat,
      activeCurrency === 'IQD' ? 'USD' : 'IQD',
      exchangeRate,
    ),
  }
  const paymentInputs = paymentType === 'credit'
    ? { IQD: 0, USD: 0 }
    : {
        IQD: Number(payments.IQD) || 0,
        USD: Number(payments.USD) || 0,
      }
  const paymentSummary = calculateMixedPayment(
    totals.total,
    paymentInputs,
    exchangeRate,
  )
  const paidDisplay = formatDualMoney(paymentSummary.totalPaidIqd, activeCurrency, exchangeRate)
  const dueDisplay = formatDualMoney(paymentSummary.dueIqd, activeCurrency, exchangeRate)
  const changeDisplay = formatDualMoney(paymentSummary.changeIqd, activeCurrency, exchangeRate)
  const subtotalIqd = Number(subtotalBeforeVat.toFixed(2))
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null
  const manualCustomerName = customerNameInput.trim()
  const resolvedCustomerName = selectedCustomer?.name ?? (manualCustomerName || undefined)
  const customerBalanceDisplay = selectedCustomer
    ? formatDualMoney(selectedCustomer.currentBalance, activeCurrency, exchangeRate)
    : null

  const paymentEntries = paymentType === 'credit' ? [] : [
    payments.IQD
      ? {
          paymentMethod: 'cash' as const,
          currencyCode: 'IQD' as const,
          amountReceived: Number(payments.IQD),
          amountReceivedIqd: Number(payments.IQD),
          exchangeRate,
        }
      : null,
    payments.USD
      ? {
          paymentMethod: 'cash' as const,
          currencyCode: 'USD' as const,
          amountReceived: Number(payments.USD),
          amountReceivedIqd: Number((Number(payments.USD) * exchangeRate).toFixed(2)),
          exchangeRate,
        }
      : null,
  ].filter((entry) => entry !== null)

  function resetCheckoutState() {
    setCart([])
    setPayments({ IQD: '', USD: '' })
    setPaymentType('cash')
    setSelectedCustomerId('')
    setCustomerNameInput('')
    setQuickCustomerName('')
    setQuickCustomerPhone('')
    setIsQuickCustomerFormOpen(false)
  }

  function applyCartChange(nextCartFactory: (currentCart: CartLine[]) => CartLine[], successMessage?: string) {
    let applied = false

    setCart((currentCart) => {
      const nextCart = nextCartFactory(currentCart)
      const stockConflictWarning = getCartStockConflict(nextCart)

      if (stockConflictWarning) {
        setMessage(stockConflictWarning)
        return currentCart
      }

      applied = true
      return nextCart
    })

    if (applied && successMessage) {
      setMessage(successMessage)
    }
  }

  function addProduct(product: Product, source: CartLine['source'], quantity = 1, saleUnit: SaleUnitMode = 'retail') {
    const nextLine = createCartLine(product, source, quantity, saleUnit)
    applyCartChange(
      (currentCart) => addLineToCart(currentCart, nextLine),
      `تمت إضافة ${product.name} بوحدة ${getSaleUnitLabel(product, saleUnit)} إلى السلة.`,
    )
  }

  function addScannedProduct(
    product: Product,
    quantity: number,
    saleUnit: SaleUnitMode,
    source: CartLine['source'],
    matchedBarcode: string,
  ) {
    const nextLine = {
      ...createCartLine(product, source, quantity, saleUnit),
      barcode: matchedBarcode,
    }

    applyCartChange(
      (currentCart) => addLineToCart(currentCart, nextLine),
      `تمت إضافة ${product.name} بوحدة ${getSaleUnitLabel(product, saleUnit)} إلى السلة.`,
    )
  }

  function handleScanSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const scan = scanInput.trim()
    if (!scan) {
      return
    }

    const scanMatch = findProductByScan(products, scan)
    if (!scanMatch) {
      setMessage('لم يتم العثور على الصنف. تحقق من الباركود أو سجل الصنف أولاً.')
      return
    }

    const { product, saleUnit, matchedBarcode } = scanMatch

    const parsedScale = parseScaleBarcode(scan)
    if (parsedScale && product.soldByWeight) {
      const quantity = parsedScale.totalPrice / product.unitPrice
      addScannedProduct(product, quantity, 'retail', 'scale', matchedBarcode)
      setScanInput('')
      return
    }

    addScannedProduct(product, 1, saleUnit, 'barcode', matchedBarcode)
    setScanInput('')
  }

  function handleQuickAdd(product: Product, saleUnit: SaleUnitMode) {
    addProduct(product, 'manual', saleUnit === 'wholesale' ? 1 : (product.soldByWeight ? 0.5 : 1), saleUnit)
  }

  function clearCart() {
    resetCheckoutState()
    setMessage('تم تفريغ السلة الحالية.')
  }

  function handlePaymentAmountChange(currency: CurrencyCode, value: string) {
    if (value === '') {
      setPayments((current) => ({ ...current, [currency]: '' }))
      return
    }

    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return
    }

    setPayments((current) => ({ ...current, [currency]: value }))
  }

  async function finalizeSale() {
    if (cart.length === 0) {
      setMessage('السلة فارغة حالياً ولا توجد فاتورة للدفع.')
      return
    }

    const stockConflictWarning = getCartStockConflict(cart)

    if (stockConflictWarning) {
      setMessage(stockConflictWarning)
      return
    }

    if (paymentType === 'cash') {
      if (!paymentSummary.isSettled) {
        setMessage(`المبلغ المدخل غير كافٍ. المتبقي ${formatMoney(paymentSummary.dueIqd, 'IQD', exchangeRate)}.`)
        return
      }

      if (paymentEntries.length === 0) {
        setMessage('أدخل مبلغاً مقبوضاً بالدينار أو الدولار قبل تثبيت الدفع.')
        return
      }
    }

    if (paymentType !== 'cash' && !selectedCustomerId && !resolvedCustomerName) {
      setMessage('حدد العميل أو أدخل اسمه قبل تسجيل البيع الآجل أو الجزئي.')
      return
    }

    if (paymentType === 'partial') {
      if (paymentEntries.length === 0 || paymentSummary.totalPaidIqd <= 0) {
        setMessage('البيع الجزئي يحتاج إلى دفعة أولية أكبر من صفر.')
        return
      }

      if (paymentSummary.totalPaidIqd + 0.01 >= totals.total) {
        setMessage('إذا تم دفع كامل المبلغ فاستخدم نوع الدفع النقدي بدلاً من الجزئي.')
        return
      }
    }

    const payload = buildSaleInvoicePayload({
      cart,
      paymentType,
      customerId: paymentType === 'cash' ? undefined : (selectedCustomerId || undefined),
      customerName: paymentType === 'cash' ? undefined : resolvedCustomerName,
      currencyCode: activeCurrency,
      exchangeRate,
      subtotal: subtotalIqd,
      vatAmount: totals.vat,
      totalAmount: totals.total,
      payments: paymentEntries,
    })
    const printWindow = window.open('', '_blank', 'width=420,height=900')

    setIsSubmitting(true)

    try {
      if (!isOnline) {
        const pendingCount = enqueuePendingInvoice(payload)
        const receiptPrinted = printRetailReceipt({
          printWindow,
          invoiceNo: buildLocalInvoiceNo(),
          createdAt: new Date().toISOString(),
          items: payload.items,
          payments: payload.payments,
          paymentType,
          customerName: payload.customerName,
          subtotalIqd,
          vatAmountIqd: totals.vat,
          totalAmountIqd: totals.total,
          totalPaidIqd: paymentSummary.totalPaidIqd,
          remainingAmountIqd: paymentSummary.dueIqd,
          changeIqd: paymentSummary.changeIqd,
          exchangeRate,
          primaryCurrency: activeCurrency,
          statusLabel: paymentType === 'cash' ? 'محفوظة محلياً بانتظار المزامنة' : `محفوظة محلياً - ${getPaymentTypeLabel(paymentType)}`,
        })
        setPendingInvoicesCount(pendingCount)
        resetCheckoutState()
        setMessage(`تم حفظ الفاتورة محلياً بانتظار المزامنة. عدد الفواتير المعلقة: ${pendingCount}.${receiptPrinted ? ' تم فتح فاتورة التجزئة للطباعة.' : ' تعذر فتح نافذة الطباعة.'}`)
        return
      }

      const savedInvoice = await submitSaleInvoice(payload)
      const remainingAmountIqd = savedInvoice.remainingAmountIqd
      const receiptPrinted = printRetailReceipt({
        printWindow,
        invoiceNo: savedInvoice.invoiceNo,
        createdAt: savedInvoice.createdAt,
        items: payload.items,
        payments: payload.payments,
        paymentType,
        customerName: payload.customerName,
        subtotalIqd,
        vatAmountIqd: totals.vat,
        totalAmountIqd: totals.total,
        totalPaidIqd: savedInvoice.amountPaidIqd,
        remainingAmountIqd,
        changeIqd: paymentSummary.changeIqd,
        exchangeRate,
        primaryCurrency: activeCurrency,
        statusLabel: getPaymentStatusLabel(savedInvoice.paymentStatus),
      })
      await Promise.all([loadProducts(), loadCustomers()])
      const changeText = paymentSummary.changeIqd > 0
        ? ` والباقي للعميل ${formatMoney(paymentSummary.changeIqd, 'IQD', exchangeRate)}.`
        : '.'
      const remainingText = remainingAmountIqd > 0.01
        ? ` المتبقي على العميل ${formatMoney(remainingAmountIqd, 'IQD', exchangeRate)}.`
        : ''

      resetCheckoutState()
      setMessage(`تم حفظ الفاتورة ${savedInvoice.invoiceNo} بنجاح${remainingText || changeText}${receiptPrinted ? ' تم فتح فاتورة التجزئة للطباعة.' : ' تعذر فتح نافذة الطباعة.'}`)
    } catch (error) {
      printWindow?.close()
      const pendingCount = enqueuePendingInvoice(payload)
      setPendingInvoicesCount(pendingCount)
      resetCheckoutState()
      const reason = error instanceof Error ? error.message : 'تعذر الوصول إلى الخادم.'
      setMessage(`تعذر الحفظ على الخادم: ${reason} تم حفظ الفاتورة محلياً للمزامنة لاحقاً. المعلق حالياً: ${pendingCount}.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 via-emerald-500 to-amber-400 font-display text-lg font-black text-white shadow-lg shadow-emerald-900/20">
                POS
              </div>
              <div>
                <p className="font-display text-2xl font-black text-stone-950">واجهة الكاشير</p>
                <p className="text-sm text-stone-600">
                  بيع سريع، قراءة باركود عادي وباركود ميزان، وحساب الضريبة تلقائياً.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-2 text-sm font-bold ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isOnline ? 'متصل: ستتم مزامنة الفواتير فوراً' : 'غير متصل: الحفظ محلي مؤقت'}
              </span>
              <span className="rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                فواتير معلقة: {pendingInvoicesCount}
              </span>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/invoices">
                سجل الفواتير
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700" to="/customers">
                حسابات العملاء
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/">
                العودة للرئيسية
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black tracking-[0.3em] text-teal-200/80">SCANNER INPUT</p>
                  <h1 className="mt-2 font-display text-3xl font-black">مسح الباركود وإضافة الأصناف</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-300">{scannerHint}</p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/8 px-4 py-3 text-sm text-stone-200">
                  <p>ضريبة القيمة المضافة: 15%</p>
                  <p className="mt-1">العملة الأساسية: الدينار العراقي</p>
                  <p className="mt-1">سعر الصرف الحالي: 1 USD = {exchangeRate.toLocaleString('en-US')} IQD</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {supportedCurrencies.map((currency) => (
                  <button
                    key={currency.code}
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${
                      activeCurrency === currency.code
                        ? 'bg-amber-400 text-stone-950'
                        : 'border border-white/15 bg-white/8 text-white hover:border-teal-300'
                    }`}
                    onClick={() => setActiveCurrency(currency.code)}
                    type="button"
                  >
                    {currency.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:max-w-xs">
                <label className="text-sm font-bold text-stone-200">
                  سعر صرف الدولار مقابل الدينار
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                    min="1"
                    step="1"
                    type="number"
                    value={exchangeRate}
                    onChange={(event) => {
                      const value = Number(event.target.value)

                      if (Number.isFinite(value) && value > 0) {
                        setExchangeRate(value)
                      }
                    }}
                  />
                </label>
              </div>

              <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={handleScanSubmit}>
                <input
                  className="h-14 rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none ring-0 placeholder:text-stone-400 focus:border-teal-400"
                  value={scanInput}
                  onChange={(event) => setScanInput(event.target.value)}
                  placeholder="امسح الباركود أو أدخله يدوياً"
                />
                <button className="h-14 rounded-2xl bg-amber-400 px-6 text-base font-black text-stone-950 transition hover:bg-amber-300" type="submit">
                  إضافة للسلة
                </button>
              </form>

              {message ? (
                <div className="mt-4 rounded-2xl border border-teal-400/20 bg-teal-400/10 px-4 py-3 text-sm text-teal-100">
                  {message}
                </div>
              ) : null}
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-amber-700">CART</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-stone-950">سلة البيع الحالية</h2>
                </div>
                <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-red-400 hover:text-red-600" onClick={clearCart} type="button">
                  تفريغ السلة
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {cart.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                    لا توجد أصناف بعد. ابدأ بمسح باركود أو اختر من المنتجات السريعة.
                  </div>
                ) : (
                  cart.map((line) => {
                    const stockSummary = getCartLineStockSummary(line)
                    const maxSaleQuantity = getCartLineMaxSaleQuantity(line)

                    return (
                    <article key={line.lineId} className="rounded-[26px] border border-stone-200/80 bg-stone-50/80 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-xl font-black text-stone-950">{line.name}</h3>
                            <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">
                              {line.source === 'scale' ? 'ميزان' : line.source === 'barcode' ? 'باركود' : 'إضافة سريعة'}
                            </span>
                            <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-black text-teal-800">
                              {line.saleUnit === 'wholesale' ? 'بيع جملة' : 'بيع مفرد'}
                            </span>
                            {line.stockQty <= line.minStock ? (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                                قرب الحد الأدنى
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-stone-600">
                            سعر الوحدة: {formatMoney(line.unitPrice, activeCurrency, exchangeRate)}
                            <span className="mx-2 text-stone-400">|</span>
                            ما يعادله: {formatMoney(line.unitPrice, activeCurrency === 'IQD' ? 'USD' : 'IQD', exchangeRate)}
                            <span className="mx-2 text-stone-400">|</span>
                            وحدة البيع الحالية: {line.unitLabel}
                          </p>
                          <p className="mt-1 text-xs font-bold text-stone-500">الرصيد المتبقي لهذه المادة: {stockSummary}</p>
                          {line.saleUnit === 'wholesale' && line.wholesaleQuantity ? (
                            <p className="mt-1 text-xs font-bold text-stone-500">الكمية الأساسية لهذا السطر: {formatQuantity(line.baseQuantity)} {line.retailUnit}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <label className="text-sm font-bold text-stone-600">
                            الكمية
                            <input
                              className="mt-2 h-11 w-28 rounded-2xl border border-stone-300 bg-white px-3 text-center text-base font-bold text-stone-900 outline-none focus:border-teal-500"
                              min="0"
                              max={maxSaleQuantity}
                              step={line.saleUnit === 'wholesale' || (line.retailUnit !== 'كجم' && line.retailUnit !== 'كغم') ? '1' : '0.125'}
                              type="number"
                              value={line.quantity}
                              onChange={(event) => {
                                const nextQuantity = Number(event.target.value)

                                applyCartChange((currentCart) =>
                                  updateCartLineQuantity(
                                    currentCart,
                                    line.lineId,
                                    nextQuantity,
                                  ),
                                )
                              }}
                            />
                            <p className="mt-2 text-xs font-bold text-stone-500">
                              المتاح للبيع الآن: {stockSummary}
                            </p>
                          </label>

                          <div className="min-w-40 rounded-2xl bg-white px-4 py-3 text-center">
                            <p className="text-xs text-stone-500">الإجمالي</p>
                            <p className="mt-1 font-display text-2xl font-black text-teal-700">{formatMoney(line.lineTotal, activeCurrency, exchangeRate)}</p>
                            <p className="mt-1 text-xs font-bold text-stone-500">
                              {formatMoney(line.lineTotal, activeCurrency === 'IQD' ? 'USD' : 'IQD', exchangeRate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                    )
                  })
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">TOTALS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">ملخص الفاتورة</h2>
              <p className="mt-2 text-sm text-stone-600">
                يتم تسجيل الفاتورة بالدينار العراقي مع إمكانية العرض والدفع المرجعي بالدولار.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-4">
                  <span className="text-sm font-bold text-stone-600">الإجمالي قبل الضريبة</span>
                  <div className="text-left">
                    <p className="font-display text-2xl font-black text-stone-950">{subtotalDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-500">{subtotalDisplay.secondary}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-4">
                  <span className="text-sm font-bold text-stone-600">ضريبة القيمة المضافة</span>
                  <div className="text-left">
                    <p className="font-display text-2xl font-black text-amber-600">{vatDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-500">{vatDisplay.secondary}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-[24px] bg-stone-950 px-4 py-5 text-white">
                  <span className="text-sm font-bold text-stone-200">الإجمالي المستحق</span>
                  <div className="text-left">
                    <p className="font-display text-3xl font-black">{totalDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-300">{totalDisplay.secondary}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[26px] border border-stone-200 bg-stone-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black tracking-[0.18em] text-emerald-700">PAYMENT</p>
                    <h3 className="mt-1 font-display text-2xl font-black text-stone-950">طريقة الدفع والتحصيل</h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-stone-600">
                    {paymentType === 'cash' ? 'يمكن إدخال دينار ودولار في نفس الفاتورة' : 'اربط الفاتورة بعميل عند البيع الآجل أو الجزئي'}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {([
                    ['cash', 'نقدي'],
                    ['partial', 'جزئي'],
                    ['credit', 'آجل'],
                  ] as const).map(([type, label]) => (
                    <button
                      key={type}
                      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${paymentType === type ? 'bg-stone-950 text-white' : 'border border-stone-300 bg-white text-stone-700 hover:border-emerald-500 hover:text-emerald-700'}`}
                      onClick={() => setPaymentType(type)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {paymentType !== 'cash' ? (
                  <div className="mt-4 space-y-3 rounded-[22px] border border-emerald-200 bg-emerald-50/80 p-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className="text-sm font-bold text-stone-700">
                        اختر عميلاً محفوظاً
                        <select
                          className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                          value={selectedCustomerId}
                          onChange={(event) => {
                            setSelectedCustomerId(event.target.value)
                            if (event.target.value) {
                              setCustomerNameInput('')
                            }
                          }}
                        >
                          <option value="">{isCustomersLoading ? 'جارٍ تحميل العملاء...' : 'بدون اختيار عميل محفوظ'}</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>{customer.name}</option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm font-bold text-stone-700">
                        أو اكتب اسم العميل مباشرة
                        <input
                          className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                          placeholder="اسم العميل للحساب الآجل"
                          value={customerNameInput}
                          onChange={(event) => {
                            setCustomerNameInput(event.target.value)
                            if (event.target.value.trim()) {
                              setSelectedCustomerId('')
                            }
                          }}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-black text-emerald-800 transition hover:border-emerald-500 hover:text-emerald-900"
                        onClick={() => {
                          setQuickCustomerName(customerNameInput.trim())
                          setQuickCustomerPhone('')
                          setIsQuickCustomerFormOpen((current) => !current)
                        }}
                        type="button"
                      >
                        {isQuickCustomerFormOpen ? 'إخفاء الحفظ السريع' : 'إنشاء عميل سريع'}
                      </button>
                      <Link
                        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700"
                        to="/customers"
                      >
                        فتح صفحة العملاء
                      </Link>
                    </div>

                    {isQuickCustomerFormOpen ? (
                      <div className="grid gap-3 rounded-[20px] border border-emerald-200/80 bg-white/90 p-4 lg:grid-cols-[1fr_0.8fr_auto]">
                        <label className="text-sm font-bold text-stone-700">
                          اسم العميل الجديد
                          <input
                            className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                            placeholder="مثال: أحمد علي"
                            value={quickCustomerName}
                            onChange={(event) => setQuickCustomerName(event.target.value)}
                          />
                        </label>
                        <label className="text-sm font-bold text-stone-700">
                          رقم الهاتف
                          <input
                            className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                            placeholder="اختياري"
                            value={quickCustomerPhone}
                            onChange={(event) => setQuickCustomerPhone(event.target.value)}
                          />
                        </label>
                        <button
                          className="h-12 self-end rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                          disabled={isCreatingCustomer}
                          onClick={handleCreateQuickCustomer}
                          type="button"
                        >
                          {isCreatingCustomer ? 'جارٍ الإنشاء...' : 'حفظ واختيار'}
                        </button>
                      </div>
                    ) : null}

                    {selectedCustomer && customerBalanceDisplay ? (
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-700">
                        الرصيد الحالي على العميل: {customerBalanceDisplay.primary}
                        <span className="mx-2 text-stone-400">|</span>
                        {customerBalanceDisplay.secondary}
                      </div>
                    ) : null}

                    <p className="text-xs font-bold text-emerald-800">
                      {paymentType === 'credit'
                        ? 'سيتم تسجيل كامل الفاتورة كدين على العميل.'
                        : 'سيتم تسجيل الفرق غير المقبوض كرصيد مستحق على العميل.'}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-700">
                    المقبوض بالدينار العراقي
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={paymentType === 'credit'}
                      min="0"
                      step="250"
                      type="number"
                      value={payments.IQD}
                      onChange={(event) => handlePaymentAmountChange('IQD', event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-700">
                    المقبوض بالدولار الأمريكي
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-teal-500 disabled:cursor-not-allowed disabled:bg-stone-100"
                      disabled={paymentType === 'credit'}
                      min="0"
                      step="0.01"
                      type="number"
                      value={payments.USD}
                      onChange={(event) => handlePaymentAmountChange('USD', event.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-xs font-bold text-stone-500">إجمالي المقبوض</p>
                    <p className="mt-1 font-display text-2xl font-black text-stone-950">{paidDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-500">{paidDisplay.secondary}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-xs font-bold text-stone-500">{paymentType === 'cash' ? 'المتبقي' : 'المتبقي على العميل'}</p>
                    <p className="mt-1 font-display text-2xl font-black text-amber-600">{dueDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-500">{dueDisplay.secondary}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-xs font-bold text-stone-500">الباقي للعميل</p>
                    <p className="mt-1 font-display text-2xl font-black text-emerald-700">{changeDisplay.primary}</p>
                    <p className="text-xs font-bold text-stone-500">{changeDisplay.secondary}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-base font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  disabled={cart.length === 0 || isSubmitting}
                  onClick={finalizeSale}
                  type="button"
                >
                  {isSubmitting ? 'جارٍ حفظ الفاتورة...' : paymentType === 'cash' ? 'تثبيت الدفع النقدي' : paymentType === 'partial' ? 'تسجيل بيع جزئي' : 'تسجيل بيع آجل'}
                </button>
                <button className="rounded-2xl border border-stone-300 px-4 py-3 text-base font-black text-stone-800 transition hover:border-teal-500 hover:text-teal-700" type="button">
                  تعليق الفاتورة
                </button>
              </div>
            </section>

            <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">QUICK PRODUCTS</p>
              <h2 className="mt-2 font-display text-3xl font-black">إضافة سريعة</h2>
              <div className="mt-5 grid gap-3">
                {products.map((product) => {
                  const stockSummaries = getProductStockSummaries(product)

                  return (
                  <div key={product.id} className="rounded-[24px] border border-white/10 bg-white/6 p-4 text-right">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-display text-xl font-black text-white">{product.name}</p>
                        <p className="mt-1 text-sm text-stone-300">{product.department}</p>
                        <p className="mt-1 text-xs text-stone-400">
                          المتبقي بالمفرد: {stockSummaries.retail}
                        </p>
                        {stockSummaries.wholesale ? (
                          <p className="mt-1 text-xs text-stone-400">
                            المتبقي بالجملة: {stockSummaries.wholesale}
                          </p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-teal-100">
                        {product.soldByWeight ? 'وزني' : hasWholesaleOption(product) ? 'مفرد + جملة' : 'مفرد'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {getProductSaleModes(product).map((saleUnit) => {
                        const unitLabel = getSaleUnitLabel(product, saleUnit)
                        const unitPrice = saleUnit === 'wholesale' && product.wholesaleSalePrice !== undefined ? product.wholesaleSalePrice : product.unitPrice

                        return (
                          <button
                            key={`${product.id}-${saleUnit}`}
                            className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-right transition hover:border-teal-300 hover:bg-white/12"
                            onClick={() => handleQuickAdd(product, saleUnit)}
                            type="button"
                          >
                            <p className="text-sm font-black text-white">{saleUnit === 'wholesale' ? 'إضافة بالجملة' : 'إضافة بالمفرد'}</p>
                            <p className="mt-1 text-sm text-stone-300">{formatMoney(unitPrice, activeCurrency, exchangeRate)} / {unitLabel}</p>
                            <p className="mt-1 text-xs text-stone-400">{formatMoney(unitPrice, activeCurrency === 'IQD' ? 'USD' : 'IQD', exchangeRate)}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  )
                })}
              </div>
              <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-black/15 px-4 py-3 text-sm text-stone-300">
                {isCatalogLoading
                  ? 'جارٍ تحميل الأصناف من الخادم...'
                  : isUsingFallbackCatalog
                    ? 'يتم حالياً استخدام كتالوج محلي احتياطي لعدم توفر الخادم.'
                    : `تم تحميل ${products.length} صنف من الخادم.`}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">ALERTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تنبيهات التشغيل</h2>
              <div className="mt-4 space-y-3">
                {warnings.length === 0 ? (
                  <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    لا توجد تنبيهات حرجة حالياً في السلة الحالية.
                  </div>
                ) : (
                  warnings.map((warning) => (
                    <div key={warning} className="rounded-2xl bg-amber-50 px-4 py-4 text-sm font-bold text-amber-800">
                      {warning}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-600">
                تم تفعيل حفظ السلة محلياً في المتصفح كبداية لوضع عدم الاتصال. لاحقاً سنربط
                ذلك بطابور مزامنة للفواتير عند عودة الإنترنت. الفواتير التي يتعذر رفعها الآن
                يتم وضعها في طابور محلي مبدئي.
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
