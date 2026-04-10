import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import { formatMoney, IQD_PER_USD, type CurrencyCode } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import {
  createCustomer,
  createCustomerPayment,
  deleteCustomer,
  fetchCustomerPayments,
  fetchCustomers,
  updateCustomer,
  type Customer,
  type CustomerPayment,
} from '../lib/customers-api'
import { fetchSaleInvoices, type StoredSaleInvoice } from '../lib/sales-api'

type CustomerLedgerEntry = {
  id: string
  createdAt: string
  kind: 'invoice' | 'payment'
  title: string
  debitIqd: number
  creditIqd: number
  balanceAfterIqd: number
  subtitle?: string
  notes?: string
  invoice?: StoredSaleInvoice
  payment?: CustomerPayment
}

type OverdueFilter = 'all' | '15' | '30'

type PreferredCustomerSelection = {
  customerId?: string | null
  customerName?: string | null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getDaysSince(dateValue: string) {
  const start = new Date(dateValue)
  const now = new Date()
  const diff = now.getTime() - start.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

function normalizeWhatsAppPhone(phone?: string) {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, '')

  if (!digits) {
    return null
  }

  if (digits.startsWith('964')) {
    return digits
  }

  if (digits.startsWith('00')) {
    return digits.slice(2)
  }

  if (digits.startsWith('0')) {
    return `964${digits.slice(1)}`
  }

  return digits
}

function buildCustomerReminderMessage(customer: Customer, overdueInvoices: ReturnType<typeof getCustomerOverdueInvoices>) {
  const unpaidSummary = overdueInvoices
    .slice(0, 3)
    .map(({ invoice, overdueDays }) => `${invoice.invoiceNo} - ${formatMoney(invoice.remainingAmountIqd, 'IQD')} - منذ ${overdueDays} يوم`)
    .join(' | ')

  return `السلام عليكم ${customer.name}، نود تذكيركم بأن الرصيد المستحق عليكم هو ${formatMoney(customer.currentBalance, 'IQD')}.${unpaidSummary ? ` الفواتير الأقدم: ${unpaidSummary}.` : ''} نرجو التكرم بالتسديد في أقرب وقت. شكراً لتعاملكم معنا.`
}

const emptyCustomerForm = {
  name: '',
  phone: '',
  address: '',
  notes: '',
}

function getPaymentTypeLabel(paymentType: StoredSaleInvoice['paymentType']) {
  if (paymentType === 'credit') {
    return 'آجل'
  }

  return 'نقدي'
}

function getPaymentStatusLabel(paymentStatus: StoredSaleInvoice['paymentStatus']) {
  if (paymentStatus === 'credit') {
    return 'غير مسدد'
  }

  if (paymentStatus === 'partial') {
    return 'مسدد جزئياً'
  }

  return 'مسدد'
}

function matchesCustomerInvoice(invoice: StoredSaleInvoice, customer: Customer) {
  if (invoice.customerId) {
    return invoice.customerId === customer.id
  }

  return invoice.customerName?.trim() === customer.name.trim()
}

function getCustomerOverdueInvoices(customer: Customer, invoices: StoredSaleInvoice[]) {
  return invoices
    .filter((invoice) => matchesCustomerInvoice(invoice, customer) && invoice.remainingAmountIqd > 0.01)
    .map((invoice) => ({
      invoice,
      overdueDays: getDaysSince(invoice.createdAt),
    }))
    .sort((left, right) => right.overdueDays - left.overdueDays)
}

function matchesOverdueFilter(overdueInvoices: ReturnType<typeof getCustomerOverdueInvoices>, overdueFilter: OverdueFilter) {
  if (overdueFilter === 'all') {
    return true
  }

  const threshold = overdueFilter === '15' ? 15 : 30
  return overdueInvoices.some((entry) => entry.overdueDays >= threshold)
}

function buildCustomerLedgerEntries(customerInvoices: StoredSaleInvoice[], customerPayments: CustomerPayment[]) {
  const invoiceEntries = customerInvoices.map((invoice) => ({
    id: `invoice-${invoice.id}`,
    createdAt: invoice.createdAt,
    kind: 'invoice' as const,
    title: `فاتورة ${invoice.invoiceNo}`,
    debitIqd: invoice.remainingAmountIqd,
    creditIqd: 0,
    subtitle: `${getPaymentTypeLabel(invoice.paymentType)} - ${getPaymentStatusLabel(invoice.paymentStatus)}`,
    notes: invoice.notes,
    invoice,
  }))

  const paymentEntries = customerPayments.map((payment) => ({
    id: `payment-${payment.id}`,
    createdAt: payment.createdAt,
    kind: 'payment' as const,
    title: `تسديد ${payment.paymentNo}`,
    debitIqd: 0,
    creditIqd: payment.amountIqd,
    subtitle: [
      payment.currencyCode === 'USD'
        ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.amount)} - سعر الصرف ${payment.exchangeRate}`
        : 'تسديد بالدينار العراقي',
      payment.destinationFundAccountName ? `أودع في ${payment.destinationFundAccountName}` : null,
    ].filter(Boolean).join(' | '),
    notes: payment.notes,
    payment,
  }))

  const timeline = [...invoiceEntries, ...paymentEntries].sort((left, right) => {
    const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

    if (dateDifference !== 0) {
      return dateDifference
    }

    if (left.kind === right.kind) {
      return left.id.localeCompare(right.id)
    }

    return left.kind === 'invoice' ? -1 : 1
  })

  let runningBalance = 0

  return timeline.map((entry) => {
    runningBalance = Number((runningBalance + entry.debitIqd - entry.creditIqd).toFixed(2))

    return {
      ...entry,
      balanceAfterIqd: runningBalance,
    } satisfies CustomerLedgerEntry
  })
}

function resolvePreferredCustomerId(
  customerList: Customer[],
  preferredSelection: PreferredCustomerSelection | null | undefined,
  fallbackSelectedCustomerId: string | null,
) {
  const preferredCustomerId = preferredSelection?.customerId?.trim()

  if (preferredCustomerId) {
    const matchedCustomer = customerList.find((customer) => customer.id === preferredCustomerId)

    if (matchedCustomer) {
      return matchedCustomer.id
    }
  }

  const normalizedPreferredCustomerName = preferredSelection?.customerName?.trim().toLowerCase()

  if (normalizedPreferredCustomerName) {
    const matchedCustomer = customerList.find((customer) => customer.name.trim().toLowerCase() === normalizedPreferredCustomerName)

    if (matchedCustomer) {
      return matchedCustomer.id
    }

    return null
  }

  if (preferredCustomerId) {
    return null
  }

  if (fallbackSelectedCustomerId && customerList.some((customer) => customer.id === fallbackSelectedCustomerId)) {
    return fallbackSelectedCustomerId
  }

  return customerList[0]?.id ?? null
}

export function CustomersPage() {
  const [searchParams] = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [saleInvoices, setSaleInvoices] = useState<StoredSaleInvoice[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [payments, setPayments] = useState<CustomerPayment[]>([])
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm)
  const [paymentForm, setPaymentForm] = useState({
    currencyCode: 'IQD' as CurrencyCode,
    exchangeRate: IQD_PER_USD,
    amount: '',
    notes: '',
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false)
  const [isSavingCustomer, setIsSavingCustomer] = useState(false)
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [overdueFilter, setOverdueFilter] = useState<OverdueFilter>('all')
  const [reminderMessage, setReminderMessage] = useState('')
  const preferredCustomerId = searchParams.get('customerId')
  const preferredCustomerName = searchParams.get('customerName')?.trim() ?? ''

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null
  const totalOutstanding = customers.reduce((sum, customer) => sum + customer.currentBalance, 0)
  const normalizedCustomerQuery = customerQuery.trim().toLowerCase()
  const filteredCustomers = customers.filter((customer) => {
    const matchesQuery = !normalizedCustomerQuery || [customer.name, customer.phone ?? '', customer.address ?? '', customer.notes ?? '']
      .some((value) => value.toLowerCase().includes(normalizedCustomerQuery))

    if (!matchesQuery) {
      return false
    }

    return matchesOverdueFilter(getCustomerOverdueInvoices(customer, saleInvoices), overdueFilter)
  })
  const customerInvoices = selectedCustomer
    ? saleInvoices.filter((invoice) => matchesCustomerInvoice(invoice, selectedCustomer))
    : []
  const selectedCustomerOverdueInvoices = selectedCustomer
    ? getCustomerOverdueInvoices(selectedCustomer, saleInvoices)
    : []
  const customersOverdue15Count = customers.filter((customer) => getCustomerOverdueInvoices(customer, saleInvoices).some((entry) => entry.overdueDays >= 15)).length
  const customersOverdue30Count = customers.filter((customer) => getCustomerOverdueInvoices(customer, saleInvoices).some((entry) => entry.overdueDays >= 30)).length
  const ledgerEntries = selectedCustomer ? buildCustomerLedgerEntries(customerInvoices, payments) : []
  const ledgerEntriesDescending = [...ledgerEntries].reverse()
  const customerCreditSalesTotal = customerInvoices.reduce((sum, invoice) => sum + invoice.remainingAmountIqd, 0)
  const customerSettlementsTotal = payments.reduce((sum, payment) => sum + payment.amountIqd, 0)
  const customerCashSalesCount = customerInvoices.filter((invoice) => invoice.remainingAmountIqd <= 0.01).length
  const customerDebtInvoicesCount = customerInvoices.filter((invoice) => invoice.remainingAmountIqd > 0.01).length
  const selectedCustomerOldestOverdueDays = selectedCustomerOverdueInvoices[0]?.overdueDays ?? 0

  async function loadCustomersData(preferredSelection?: PreferredCustomerSelection | null) {
    setIsLoading(true)

    try {
      const [customerList, invoiceList] = await Promise.all([
        fetchCustomers(),
        fetchSaleInvoices(),
      ])
      setCustomers(customerList)
      setSaleInvoices(invoiceList)

      const nextSelectedCustomerId = resolvePreferredCustomerId(customerList, preferredSelection, selectedCustomerId)

      setSelectedCustomerId(nextSelectedCustomerId)

      if (!nextSelectedCustomerId && preferredSelection?.customerName?.trim()) {
        const fallbackName = preferredSelection.customerName.trim()
        setCustomerQuery(fallbackName)
        setCustomerForm({
          ...emptyCustomerForm,
          name: fallbackName,
        })
        setMessage(`لم يتم العثور على عميل محفوظ باسم ${fallbackName}. يمكنك إنشاؤه مباشرة من هذه الصفحة.`)
      } else {
        setMessage(null)
      }
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل العملاء.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCustomersData({
      customerId: preferredCustomerId,
      customerName: preferredCustomerName,
    })
  }, [preferredCustomerId, preferredCustomerName])

  useEffect(() => {
    if (!selectedCustomerId) {
      setPayments([])
      return
    }

    const customerId = selectedCustomerId

    let cancelled = false

    async function loadSelectedCustomerPayments() {
      setIsPaymentsLoading(true)

      try {
        const paymentList = await fetchCustomerPayments(customerId)

        if (!cancelled) {
          setPayments(paymentList)
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل تسديدات العميل.'))
          setPayments([])
        }
      } finally {
        if (!cancelled) {
          setIsPaymentsLoading(false)
        }
      }
    }

    void loadSelectedCustomerPayments()

    return () => {
      cancelled = true
    }
  }, [selectedCustomerId])

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerForm({
        name: selectedCustomer.name,
        phone: selectedCustomer.phone ?? '',
        address: selectedCustomer.address ?? '',
        notes: selectedCustomer.notes ?? '',
      })
      return
    }

    setCustomerForm(emptyCustomerForm)
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer) {
      setReminderMessage('')
      return
    }

    setReminderMessage(buildCustomerReminderMessage(selectedCustomer, selectedCustomerOverdueInvoices))
  }, [selectedCustomer, selectedCustomerOverdueInvoices])

  async function handleSubmitCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (customerForm.name.trim().length < 2) {
      setMessage('اسم العميل يجب أن يكون حرفين على الأقل.')
      return
    }

    setIsSavingCustomer(true)

    try {
      const payload = {
        name: customerForm.name.trim(),
        phone: customerForm.phone.trim() || undefined,
        address: customerForm.address.trim() || undefined,
        notes: customerForm.notes.trim() || undefined,
      }

      if (selectedCustomer) {
        const updatedCustomer = await updateCustomer(selectedCustomer.id, payload)
        await loadCustomersData({ customerId: updatedCustomer.id })
        setMessage(`تم تحديث بيانات العميل ${updatedCustomer.name}.`)
      } else {
        const createdCustomer = await createCustomer(payload)
        await loadCustomersData({ customerId: createdCustomer.id })
        setMessage(`تم إنشاء العميل ${createdCustomer.name} بنجاح.`)
      }
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ بيانات العميل.'))
    } finally {
      setIsSavingCustomer(false)
    }
  }

  async function handleDeleteCustomer() {
    if (!selectedCustomer) {
      return
    }

    const shouldProceed = window.confirm(`سيتم حذف العميل ${selectedCustomer.name}. هل تريد المتابعة؟`)

    if (!shouldProceed) {
      return
    }

    setIsDeletingCustomer(true)

    try {
      await deleteCustomer(selectedCustomer.id)
      await loadCustomersData(null)
      setPayments([])
      setMessage(`تم حذف العميل ${selectedCustomer.name}.`)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف العميل.'))
    } finally {
      setIsDeletingCustomer(false)
    }
  }

  async function handleSubmitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedCustomer) {
      setMessage('اختر عميلاً أولاً قبل تسجيل التسديد.')
      return
    }

    const amount = Number(paymentForm.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('أدخل مبلغ تسديد صالحاً أكبر من صفر.')
      return
    }

    setIsSavingPayment(true)

    try {
      await createCustomerPayment(selectedCustomer.id, {
        currencyCode: paymentForm.currencyCode,
        exchangeRate: paymentForm.exchangeRate,
        amount,
        notes: paymentForm.notes.trim() || undefined,
      })
      await loadCustomersData({ customerId: selectedCustomer.id })
      const paymentList = await fetchCustomerPayments(selectedCustomer.id)
      setPayments(paymentList)
      setPaymentForm((current) => ({
        ...current,
        amount: '',
        notes: '',
      }))
      setMessage(`تم تسجيل تسديد جديد للعميل ${selectedCustomer.name}.`)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تسجيل التسديد.'))
    } finally {
      setIsSavingPayment(false)
    }
  }

  function printSelectedCustomerLedger() {
    if (!selectedCustomer) {
      setMessage('اختر عميلاً أولاً لطباعة كشف الحساب.')
      return
    }

    if (ledgerEntriesDescending.length === 0) {
      setMessage('لا توجد حركات متاحة لطباعة كشف حساب العميل.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=780')

    if (!printWindow) {
      setMessage('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة للمتصفح.')
      return
    }

    const rows = ledgerEntries.map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${entry.kind === 'invoice' ? 'فاتورة' : 'تسديد'}</td>
        <td>${escapeHtml(entry.title)}</td>
        <td>${escapeHtml(formatDate(entry.createdAt))}</td>
        <td>${escapeHtml(entry.subtitle ?? '-')}</td>
        <td>${escapeHtml(formatMoney(entry.debitIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(entry.creditIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(entry.balanceAfterIqd, 'IQD'))}</td>
        <td>${escapeHtml(entry.notes ?? '-')}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>${escapeHtml(`كشف حساب ${selectedCustomer.name}`)}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #1c1917; }
            h1, h2, p { margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
            .title { font-size: 28px; font-weight: 700; }
            .meta { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 10px 16px; margin: 18px 0 24px; }
            .meta div { padding: 10px 12px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; }
            .label { font-size: 12px; color: #57534e; font-weight: 700; margin-bottom: 6px; }
            .value { font-size: 15px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #d6d3d1; padding: 10px; text-align: right; font-size: 13px; vertical-align: top; }
            th { background: #f5f5f4; }
            @media print { body { margin: 0; padding: 18px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="title">كشف حساب العميل</p>
              <p style="margin-top: 8px; color: #57534e;">${escapeHtml(selectedCustomer.name)}</p>
              <p style="margin-top: 4px; color: #57534e;">تاريخ الطباعة: ${escapeHtml(formatDate(new Date().toISOString()))}</p>
            </div>
            <div style="text-align:left;">
              <p style="font-size: 13px; color: #57534e; font-weight: 700;">الرصيد الحالي</p>
              <p style="margin-top: 8px; font-size: 24px; font-weight: 800;">${escapeHtml(formatMoney(selectedCustomer.currentBalance, 'IQD'))}</p>
            </div>
          </div>

          <div class="meta">
            <div><div class="label">الهاتف</div><div class="value">${escapeHtml(selectedCustomer.phone ?? '-')}</div></div>
            <div><div class="label">العنوان</div><div class="value">${escapeHtml(selectedCustomer.address ?? '-')}</div></div>
            <div><div class="label">إجمالي الذمم</div><div class="value">${escapeHtml(formatMoney(customerCreditSalesTotal, 'IQD'))}</div></div>
            <div><div class="label">إجمالي التسديدات</div><div class="value">${escapeHtml(formatMoney(customerSettlementsTotal, 'IQD'))}</div></div>
            <div><div class="label">عدد الحركات</div><div class="value">${ledgerEntries.length}</div></div>
            <div><div class="label">فواتير الذمم</div><div class="value">${customerDebtInvoicesCount}</div></div>
            <div><div class="label">فواتير نقدية مرتبطة</div><div class="value">${customerCashSalesCount}</div></div>
            <div><div class="label">ملاحظات العميل</div><div class="value">${escapeHtml(selectedCustomer.notes ?? '-')}</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>نوع الحركة</th>
                <th>المرجع</th>
                <th>التاريخ</th>
                <th>التفاصيل</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد بعد الحركة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function openWhatsAppReminder() {
    if (!selectedCustomer) {
      setMessage('اختر عميلاً أولاً لإرسال تذكير واتساب.')
      return
    }

    const normalizedPhone = normalizeWhatsAppPhone(selectedCustomer.phone)

    if (!normalizedPhone) {
      setMessage('لا يوجد رقم هاتف صالح لهذا العميل لاستخدام واتساب.')
      return
    }

    const text = reminderMessage.trim()

    if (text.length < 3) {
      setMessage('أدخل نص تذكير صالح قبل فتح واتساب.')
      return
    }

    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  function openWhatsAppForCustomer(customer: Customer) {
    const normalizedPhone = normalizeWhatsAppPhone(customer.phone)

    if (!normalizedPhone) {
      setMessage(`لا يوجد رقم هاتف صالح للعميل ${customer.name} لاستخدام واتساب.`)
      return
    }

    const overdueInvoices = getCustomerOverdueInvoices(customer, saleInvoices)
    const text = buildCustomerReminderMessage(customer, overdueInvoices)
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  function exportSelectedCustomerLedgerCsv() {
    if (!selectedCustomer) {
      setMessage('اختر عميلاً أولاً لتصدير كشف الحساب.')
      return
    }

    if (ledgerEntries.length === 0) {
      setMessage('لا توجد حركات متاحة لتصدير كشف حساب العميل.')
      return
    }

    exportRowsToCsv({
      fileName: `customer-ledger-${selectedCustomer.name}-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['entry_type', 'reference', 'created_at', 'details', 'debit_iqd', 'credit_iqd', 'balance_after_iqd', 'notes'],
      rows: ledgerEntries.map((entry) => [
        entry.kind === 'invoice' ? 'invoice' : 'payment',
        entry.title,
        entry.createdAt,
        entry.subtitle ?? '',
        entry.debitIqd,
        entry.creditIqd,
        entry.balanceAfterIqd,
        entry.notes ?? '',
      ]),
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-emerald-700">CUSTOMERS</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">حسابات العملاء</h1>
              <p className="mt-2 text-sm text-stone-600">
                إدارة العملاء، متابعة الأرصدة الآجلة، وتسجيل تسديدات الحساب من نفس الواجهة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadCustomersData()}
                type="button"
              >
                تحديث البيانات
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700" to="/pos">
                الكاشير
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/">
                الرئيسية
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">ACTIVE</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{customers.length}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي العملاء المحفوظين</p>
          </article>

          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">OUTSTANDING</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{customers.filter((customer) => customer.currentBalance > 0.01).length}</p>
            <p className="mt-2 text-sm text-stone-600">عملاء لديهم رصيد قائم</p>
          </article>

          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">BALANCE</p>
            <p className="mt-3 font-display text-4xl font-black">{formatMoney(totalOutstanding, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-300">إجمالي الرصيد المستحق على العملاء</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">OVERDUE 15+</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{customersOverdue15Count}</p>
            <p className="mt-2 text-sm text-stone-600">عملاء متأخرون 15 يوم أو أكثر</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">OVERDUE 30+</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{customersOverdue30Count}</p>
            <p className="mt-2 text-sm text-stone-600">عملاء متأخرون 30 يوم أو أكثر</p>
          </article>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-amber-700">CUSTOMER LIST</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-stone-950">العملاء</h2>
                </div>
                <button
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700"
                  onClick={() => setSelectedCustomerId(null)}
                  type="button"
                >
                  عميل جديد
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <div className="grid gap-3 rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4">
                  <input
                    className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none placeholder:text-stone-400 focus:border-emerald-500"
                    placeholder="ابحث باسم العميل أو الهاتف أو العنوان"
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${overdueFilter === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-700 hover:border-emerald-500 hover:text-emerald-700'}`}
                      onClick={() => setOverdueFilter('all')}
                      type="button"
                    >
                      كل العملاء
                    </button>
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${overdueFilter === '15' ? 'bg-amber-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-amber-500 hover:text-amber-700'}`}
                      onClick={() => setOverdueFilter('15')}
                      type="button"
                    >
                      متأخرون 15 يوم+
                    </button>
                    <button
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${overdueFilter === '30' ? 'bg-rose-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-rose-500 hover:text-rose-700'}`}
                      onClick={() => setOverdueFilter('30')}
                      type="button"
                    >
                      متأخرون 30 يوم+
                    </button>
                  </div>
                </div>

                {isLoading ? (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                    جارٍ تحميل العملاء...
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                    لا يوجد عملاء مطابقون لخيارات الفلترة الحالية.
                  </div>
                ) : (
                  filteredCustomers.map((customer) => {
                    const overdueInvoices = getCustomerOverdueInvoices(customer, saleInvoices)
                    const oldestOverdueDays = overdueInvoices[0]?.overdueDays ?? 0

                    return (
                    <button
                      key={customer.id}
                      className={`block w-full rounded-[24px] border p-4 text-right transition ${selectedCustomerId === customer.id ? 'border-emerald-400 bg-emerald-50/80' : 'border-stone-200/80 bg-stone-50/80 hover:border-emerald-300 hover:bg-white'}`}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      type="button"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-display text-xl font-black text-stone-950">{customer.name}</p>
                          <p className="mt-1 text-sm text-stone-600">{customer.phone || 'بدون هاتف'}{customer.address ? ` | ${customer.address}` : ''}</p>
                          {oldestOverdueDays > 0 ? (
                            <p className={`mt-2 text-xs font-black ${oldestOverdueDays >= 30 ? 'text-rose-700' : oldestOverdueDays >= 15 ? 'text-amber-700' : 'text-stone-500'}`}>
                              أقدم تأخير: منذ {oldestOverdueDays} يوم | فواتير غير مسددة: {overdueInvoices.length}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3 text-left">
                          <p className="text-xs text-stone-500">الرصيد الحالي</p>
                          <p className={`mt-1 font-display text-2xl font-black ${customer.currentBalance > 0.01 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {formatMoney(customer.currentBalance, 'IQD')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-black text-emerald-700 transition hover:border-emerald-500 hover:text-emerald-800"
                          onClick={(event) => {
                            event.stopPropagation()
                            openWhatsAppForCustomer(customer)
                          }}
                          type="button"
                        >
                          واتساب سريع
                        </button>
                      </div>
                    </button>
                    )
                  })
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-emerald-700">CUSTOMER FORM</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">{selectedCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}</h2>

              <form className="mt-5 space-y-4" onSubmit={handleSubmitCustomer}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-700">
                    اسم العميل
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                      value={customerForm.name}
                      onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-700">
                    الهاتف
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                      value={customerForm.phone}
                      onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="block text-sm font-bold text-stone-700">
                  العنوان
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                    value={customerForm.address}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))}
                  />
                </label>

                <label className="block text-sm font-bold text-stone-700">
                  ملاحظات
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-base font-bold text-stone-900 outline-none focus:border-emerald-500"
                    value={customerForm.notes}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-2xl bg-emerald-500 px-5 py-3 text-base font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    disabled={isSavingCustomer}
                    type="submit"
                  >
                    {isSavingCustomer ? 'جارٍ الحفظ...' : selectedCustomer ? 'تحديث العميل' : 'إنشاء العميل'}
                  </button>
                  {selectedCustomer ? (
                    <button
                      className="rounded-2xl border border-rose-300 px-5 py-3 text-base font-black text-rose-700 transition hover:border-rose-500 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={isDeletingCustomer}
                      onClick={() => void handleDeleteCustomer()}
                      type="button"
                    >
                      {isDeletingCustomer ? 'جارٍ الحذف...' : 'حذف العميل'}
                    </button>
                  ) : null}
                </div>
              </form>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">SETTLEMENTS</p>
                  <h2 className="mt-2 font-display text-3xl font-black">تسديدات العميل</h2>
                </div>
                {selectedCustomer ? (
                  <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white/90">
                    {selectedCustomer.name}
                  </span>
                ) : null}
              </div>

              {selectedCustomer ? (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/8 px-4 py-4">
                      <p className="text-xs text-stone-300">الرصيد الحالي</p>
                      <p className="mt-1 font-display text-2xl font-black text-amber-300">{formatMoney(selectedCustomer.currentBalance, 'IQD')}</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-4 py-4">
                      <p className="text-xs text-stone-300">عدد التسديدات</p>
                      <p className="mt-1 font-display text-2xl font-black">{payments.length}</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-4 py-4">
                      <p className="text-xs text-stone-300">فواتير الذمم</p>
                      <p className="mt-1 font-display text-2xl font-black">{customerDebtInvoicesCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-4 py-4">
                      <p className="text-xs text-stone-300">تاريخ الإنشاء</p>
                      <p className="mt-1 text-sm font-black text-white">{formatDate(selectedCustomer.createdAt)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/8 px-4 py-4">
                      <p className="text-xs text-stone-300">أقدم تأخير</p>
                      <p className={`mt-1 font-display text-2xl font-black ${selectedCustomerOldestOverdueDays >= 30 ? 'text-rose-300' : selectedCustomerOldestOverdueDays >= 15 ? 'text-amber-300' : 'text-teal-200'}`}>
                        {selectedCustomerOldestOverdueDays > 0 ? `${selectedCustomerOldestOverdueDays} يوم` : 'لا يوجد'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                      <p className="text-xs text-stone-300">إجمالي الذمم المسجلة</p>
                      <p className="mt-1 font-display text-2xl font-black text-amber-300">{formatMoney(customerCreditSalesTotal, 'IQD')}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                      <p className="text-xs text-stone-300">إجمالي التسديدات</p>
                      <p className="mt-1 font-display text-2xl font-black text-emerald-300">{formatMoney(customerSettlementsTotal, 'IQD')}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                      <p className="text-xs text-stone-300">فواتير نقدية مرتبطة</p>
                      <p className="mt-1 font-display text-2xl font-black text-white">{customerCashSalesCount}</p>
                    </div>
                  </div>

                  <form className="mt-5 space-y-4 rounded-[24px] border border-white/10 bg-white/6 p-4" onSubmit={handleSubmitPayment}>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="text-sm font-bold text-stone-100">
                        العملة
                        <select
                          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base font-bold text-white outline-none focus:border-teal-400"
                          value={paymentForm.currencyCode}
                          onChange={(event) => setPaymentForm((current) => ({ ...current, currencyCode: event.target.value as CurrencyCode }))}
                        >
                          <option value="IQD">دينار عراقي</option>
                          <option value="USD">دولار أمريكي</option>
                        </select>
                      </label>
                      <label className="text-sm font-bold text-stone-100">
                        المبلغ
                        <input
                          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base font-bold text-white outline-none focus:border-teal-400"
                          min="0"
                          step={paymentForm.currencyCode === 'USD' ? '0.01' : '250'}
                          type="number"
                          value={paymentForm.amount}
                          onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                        />
                      </label>
                      <label className="text-sm font-bold text-stone-100">
                        سعر الصرف
                        <input
                          className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base font-bold text-white outline-none focus:border-teal-400"
                          min="1"
                          step="1"
                          type="number"
                          value={paymentForm.exchangeRate}
                          onChange={(event) => setPaymentForm((current) => ({ ...current, exchangeRate: Number(event.target.value) || IQD_PER_USD }))}
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-bold text-stone-100">
                      ملاحظات التسديد
                      <input
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base font-bold text-white outline-none focus:border-teal-400"
                        value={paymentForm.notes}
                        onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))}
                      />
                      <p className="mt-2 text-xs text-stone-400">إذا سُجل التسديد أثناء وردية مفتوحة فسيُحتسب ضمن نقدية الوردية ويظهر في غلقها. أما خارج الوردية فيُرحّل مباشرة إلى صندوق الإيرادات.</p>
                    </label>

                    <button
                      className="rounded-2xl bg-emerald-500 px-5 py-3 text-base font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                      disabled={isSavingPayment}
                      type="submit"
                    >
                      {isSavingPayment ? 'جارٍ تسجيل التسديد...' : 'تسجيل تسديد جديد'}
                    </button>
                  </form>

                  <div className="mt-5 space-y-3">
                    {isPaymentsLoading ? (
                      <div className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-stone-300">
                        جارٍ تحميل سجل التسديدات...
                      </div>
                    ) : payments.length === 0 ? (
                      <div className="rounded-2xl bg-white/8 px-4 py-4 text-sm text-stone-300">
                        لا توجد تسديدات مسجلة لهذا العميل بعد.
                      </div>
                    ) : (
                      payments.map((payment) => (
                        <article key={payment.id} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-bold text-white">{payment.paymentNo}</p>
                              <p className="mt-1 text-xs text-stone-300">{formatDate(payment.createdAt)}</p>
                              {payment.shiftId ? <p className="mt-2 text-xs font-bold text-amber-200">مربوط بورديّة مفتوحة{payment.terminalName ? ` | الجهاز: ${payment.terminalName}` : ''}</p> : null}
                              {payment.destinationFundAccountName ? <p className="mt-2 text-xs font-bold text-teal-200">الصندوق المستلم: {payment.destinationFundAccountName}</p> : null}
                              {payment.notes ? <p className="mt-2 text-sm text-stone-200">{payment.notes}</p> : null}
                            </div>
                            <div className="text-left">
                              <p className="font-display text-2xl font-black text-emerald-300">
                                {payment.currencyCode === 'USD'
                                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.amount)
                                  : formatMoney(payment.amountIqd, 'IQD')}
                              </p>
                              <p className="mt-1 text-xs text-stone-300">المكافئ بالدينار: {formatMoney(payment.amountIqd, 'IQD')}</p>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  <div className="mt-6 rounded-[24px] border border-white/10 bg-white/6 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black tracking-[0.2em] text-emerald-200/80">WHATSAPP REMINDER</p>
                        <h3 className="mt-1 font-display text-2xl font-black text-white">تنبيه واتساب</h3>
                      </div>
                      <button
                        className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-400"
                        onClick={openWhatsAppReminder}
                        type="button"
                      >
                        فتح واتساب وإرسال التذكير
                      </button>
                    </div>

                    <p className="mt-3 text-sm text-stone-300">
                      سيتم فتح واتساب برسالة جاهزة إلى العميل. الإرسال يكون من رقم واتساب المفتوح حالياً على الجهاز أو المتصفح، وليس من الخادم مباشرة.
                    </p>

                    <label className="mt-4 block text-sm font-bold text-stone-100">
                      نص التذكير
                      <textarea
                        className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right text-base font-bold text-white outline-none focus:border-teal-400"
                        value={reminderMessage}
                        onChange={(event) => setReminderMessage(event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="mt-6 rounded-[24px] border border-white/10 bg-black/15 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black tracking-[0.2em] text-amber-200/80">LEDGER</p>
                        <h3 className="mt-1 font-display text-2xl font-black text-white">كشف الحساب</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm font-bold text-stone-300">
                          {ledgerEntries.length > 0 ? `عدد الحركات: ${ledgerEntries.length}` : 'لا توجد حركات حتى الآن'}
                        </p>
                        <button
                          className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-black text-white transition hover:border-emerald-300 hover:text-emerald-200"
                          onClick={exportSelectedCustomerLedgerCsv}
                          type="button"
                        >
                          تصدير CSV
                        </button>
                        <button
                          className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-black text-white transition hover:border-amber-300 hover:text-amber-200"
                          onClick={printSelectedCustomerLedger}
                          type="button"
                        >
                          طباعة كشف الحساب
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {ledgerEntriesDescending.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/6 px-4 py-5 text-sm text-stone-300">
                          لا توجد فواتير آجل أو تسديدات مرتبطة بهذا العميل بعد.
                        </div>
                      ) : (
                        ledgerEntriesDescending.map((entry) => (
                          <article key={entry.id} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold text-white">{entry.title}</p>
                                  <span className={`rounded-full px-3 py-1 text-xs font-black ${entry.kind === 'invoice' ? 'bg-amber-400/20 text-amber-200' : 'bg-emerald-400/20 text-emerald-200'}`}>
                                    {entry.kind === 'invoice' ? 'فاتورة' : 'تسديد'}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-stone-300">{formatDate(entry.createdAt)}</p>
                                {entry.subtitle ? <p className="mt-2 text-sm font-bold text-stone-200">{entry.subtitle}</p> : null}
                                {entry.kind === 'invoice' ? (
                                  <p className="mt-2 text-xs text-stone-300">
                                    الإجمالي: {formatMoney(entry.invoice.totalAmount, 'IQD')} | المدفوع عند البيع: {formatMoney(entry.invoice.amountPaidIqd, 'IQD')} | المتبقي المسجل: {formatMoney(entry.invoice.remainingAmountIqd, 'IQD')}
                                  </p>
                                ) : null}
                                {entry.notes ? <p className="mt-2 text-sm text-stone-200">{entry.notes}</p> : null}
                              </div>

                              <div className="grid min-w-[230px] gap-2 text-left sm:grid-cols-3 lg:grid-cols-1 lg:text-right">
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                  <p className="text-[11px] font-bold text-stone-400">مدين</p>
                                  <p className="mt-1 font-display text-xl font-black text-amber-300">{formatMoney(entry.debitIqd, 'IQD')}</p>
                                </div>
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                  <p className="text-[11px] font-bold text-stone-400">دائن</p>
                                  <p className="mt-1 font-display text-xl font-black text-emerald-300">{formatMoney(entry.creditIqd, 'IQD')}</p>
                                </div>
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                  <p className="text-[11px] font-bold text-stone-400">الرصيد بعد الحركة</p>
                                  <p className={`mt-1 font-display text-xl font-black ${entry.balanceAfterIqd > 0.01 ? 'text-amber-300' : 'text-teal-200'}`}>
                                    {formatMoney(entry.balanceAfterIqd, 'IQD')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-white/15 bg-white/6 px-5 py-12 text-center text-stone-300">
                  اختر عميلاً من القائمة أو أنشئ عميلاً جديداً لعرض الرصيد والتسديدات.
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}