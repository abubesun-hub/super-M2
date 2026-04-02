import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney, formatDualMoney } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import {
  fetchSaleInvoices,
  readPendingInvoices,
  submitSaleReturn,
  syncPendingInvoices,
  type PendingSaleInvoice,
  type StoredSaleInvoiceItem,
  type StoredSaleInvoice,
} from '../lib/sales-api'

type PendingInvoiceRecordItem = PendingSaleInvoice['payload']['items'][number] & {
  id: string
}

type InvoiceRecordItem = PendingInvoiceRecordItem | StoredSaleInvoiceItem

type InvoiceRecord = {
  id: string
  invoiceNo: string
  createdAt: string
  paymentType: StoredSaleInvoice['paymentType']
  customerId?: string
  customerName?: string
  totalAmount: number
  amountPaidIqd: number
  remainingAmountIqd: number
  currencyCode: 'IQD' | 'USD'
  exchangeRate: number
  itemsCount: number
  paymentCount: number
  sourceLabel: string
  statusLabel: string
  tone: 'saved' | 'pending'
  subtotal: number
  vatAmount: number
  estimatedCost: number
  estimatedProfit: number
  items: InvoiceRecordItem[]
  payments: StoredSaleInvoice['payments']
  returns: StoredSaleInvoice['returns']
  notes?: string
}

function isStoredInvoiceItem(item: InvoiceRecordItem): item is StoredSaleInvoiceItem {
  return 'lineCost' in item && 'lineProfit' in item && 'unitCost' in item
}

function mapSavedInvoice(invoice: StoredSaleInvoice): InvoiceRecord {
  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    createdAt: invoice.createdAt,
    paymentType: invoice.paymentType,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    totalAmount: invoice.totalAmount,
    amountPaidIqd: invoice.amountPaidIqd,
    remainingAmountIqd: invoice.remainingAmountIqd,
    currencyCode: invoice.currencyCode,
    exchangeRate: invoice.exchangeRate,
    itemsCount: invoice.items.length,
    paymentCount: invoice.payments.length,
    sourceLabel: 'الخادم',
    statusLabel: invoice.paymentStatus === 'paid' ? 'محفوظة - نقدي' : invoice.paymentStatus === 'partial' ? 'محفوظة - جزئي' : 'محفوظة - آجل',
    tone: 'saved',
    subtotal: invoice.subtotal,
    vatAmount: invoice.vatAmount,
    estimatedCost: invoice.items.reduce((sum, item) => sum + item.lineCost, 0),
    estimatedProfit: invoice.items.reduce((sum, item) => sum + item.lineProfit, 0),
    items: invoice.items,
    payments: invoice.payments,
    returns: invoice.returns,
    notes: invoice.notes,
  }
}

function mapPendingInvoice(invoice: PendingSaleInvoice, index: number): InvoiceRecord {
  const amountPaidIqd = invoice.payload.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0)

  return {
    id: invoice.localId,
    invoiceNo: `PENDING-${String(index + 1).padStart(3, '0')}`,
    createdAt: invoice.queuedAt,
    paymentType: invoice.payload.paymentType,
    customerId: invoice.payload.customerId,
    customerName: invoice.payload.customerName,
    totalAmount: invoice.payload.totalAmount,
    amountPaidIqd,
    remainingAmountIqd: Math.max(0, invoice.payload.totalAmount - amountPaidIqd),
    currencyCode: invoice.payload.currencyCode,
    exchangeRate: invoice.payload.exchangeRate,
    itemsCount: invoice.payload.items.length,
    paymentCount: invoice.payload.payments.length,
    sourceLabel: 'محلي',
    statusLabel: invoice.payload.paymentType === 'cash' ? 'معلقة للمزامنة - نقدي' : invoice.payload.paymentType === 'partial' ? 'معلقة للمزامنة - جزئي' : 'معلقة للمزامنة - آجل',
    tone: 'pending',
    subtotal: invoice.payload.subtotal,
    vatAmount: invoice.payload.vatAmount,
    estimatedCost: 0,
    estimatedProfit: invoice.payload.totalAmount,
    items: invoice.payload.items.map((item, itemIndex) => ({
      ...item,
      id: `${invoice.localId}-item-${itemIndex + 1}`,
    })),
    payments: invoice.payload.payments,
    returns: [],
    notes: invoice.payload.notes,
  }
}

function getReturnedQuantity(invoice: InvoiceRecord, invoiceItemId: string) {
  return invoice.returns.reduce((sum, saleReturn) => {
    const returnedItem = saleReturn.items.find((item) => item.invoiceItemId === invoiceItemId)
    return sum + (returnedItem?.quantity ?? 0)
  }, 0)
}

function getReturnItemLabel(invoice: InvoiceRecord, invoiceItemId?: string, productId?: string) {
  const matchedItem = invoice.items.find((item) => item.id === invoiceItemId)
    ?? invoice.items.find((item) => item.productId === productId)

  if (!matchedItem) {
    return productId ?? invoiceItemId ?? 'سطر غير معروف'
  }

  return `${matchedItem.name} | ${matchedItem.unitLabel}`
}

function getReturnableInvoiceItems(invoice: InvoiceRecord) {
  return invoice.items
    .map((item) => {
      const returnedQuantity = getReturnedQuantity(invoice, item.id)
      const remainingQuantity = Number((item.quantity - returnedQuantity).toFixed(3))

      return {
        item,
        remainingQuantity,
      }
    })
    .filter((entry) => entry.remainingQuantity > 0)
}

function normalizeReturnReason(input: string, fallbackReason: string) {
  const trimmed = input.trim()
  return trimmed.length >= 3 ? trimmed : fallbackReason
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getInvoiceItemSourceLabel(item: InvoiceRecordItem) {
  if (item.source === 'scale') {
    return 'باركود ميزان'
  }

  if (item.source === 'manual') {
    return 'إضافة يدوية'
  }

  return item.saleUnit === 'wholesale' ? 'باركود الجملة' : 'باركود المفرد'
}

function getInvoiceItemSaleModeLabel(item: InvoiceRecordItem) {
  return item.saleUnit === 'wholesale' ? 'بيع جملة' : 'بيع مفرد'
}

function buildCustomerAccountLink(invoice: InvoiceRecord) {
  const searchParams = new URLSearchParams()

  if (invoice.customerId) {
    searchParams.set('customerId', invoice.customerId)
  }

  if (invoice.customerName) {
    searchParams.set('customerName', invoice.customerName)
  }

  searchParams.set('invoiceNo', invoice.invoiceNo)

  return `/customers?${searchParams.toString()}`
}

export function InvoicesPage() {
  const [savedInvoices, setSavedInvoices] = useState<StoredSaleInvoice[]>([])
  const [pendingInvoices, setPendingInvoices] = useState<PendingSaleInvoice[]>(() => readPendingInvoices())
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'saved' | 'pending'>('all')
  const [returnsFilter, setReturnsFilter] = useState<'all' | 'with-returns' | 'without-returns'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({})
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)

  async function loadInvoices() {
    setIsLoading(true)

    try {
      const data = await fetchSaleInvoices()
      setSavedInvoices(data)
      setPendingInvoices(readPendingInvoices())
      setMessage(null)
    } catch (error) {
      setPendingInvoices(readPendingInvoices())
      setMessage(error instanceof Error ? error.message : 'تعذر تحميل السجل حالياً.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadInvoices()
  }, [])

  async function handleSyncPending() {
    setIsSyncing(true)

    try {
      const result = await syncPendingInvoices()
      setPendingInvoices(readPendingInvoices())
      await loadInvoices()
      setMessage(`تمت مزامنة ${result.syncedCount} فاتورة. المتبقي محلياً: ${result.remainingCount}.`)
    } catch {
      setPendingInvoices(readPendingInvoices())
      setMessage('تعذرت مزامنة الفواتير المعلقة حالياً.')
    } finally {
      setIsSyncing(false)
    }
  }

  const records = [
    ...pendingInvoices.map(mapPendingInvoice),
    ...savedInvoices.map(mapSavedInvoice),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  const filteredRecords = records.filter((invoice) => {
    const normalizedQuery = invoiceQuery.trim()
    const matchesQuery =
      normalizedQuery.length === 0 ||
      invoice.invoiceNo.includes(normalizedQuery) ||
      invoice.sourceLabel.includes(normalizedQuery) ||
      invoice.statusLabel.includes(normalizedQuery) ||
      (invoice.customerName?.includes(normalizedQuery) ?? false) ||
      invoice.items.some((item) =>
        item.name.includes(normalizedQuery) ||
        item.barcode.includes(normalizedQuery) ||
        item.unitLabel.includes(normalizedQuery) ||
        getInvoiceItemSaleModeLabel(item).includes(normalizedQuery),
      )

    const matchesSource =
      sourceFilter === 'all' ||
      (sourceFilter === 'saved' && invoice.tone === 'saved') ||
      (sourceFilter === 'pending' && invoice.tone === 'pending')

    const matchesReturns =
      returnsFilter === 'all' ||
      (returnsFilter === 'with-returns' && invoice.returns.length > 0) ||
      (returnsFilter === 'without-returns' && invoice.returns.length === 0)

    return matchesQuery && matchesSource && matchesReturns
  })
  const selectedInvoice = filteredRecords.find((invoice) => invoice.id === selectedInvoiceId) ?? filteredRecords[0] ?? null

  const savedTotalIqd = savedInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
  const savedProfitIqd = savedInvoices.reduce(
    (sum, invoice) => sum + invoice.items.reduce((itemsSum, item) => itemsSum + item.lineProfit, 0),
    0,
  )
  const pendingTotalIqd = pendingInvoices.reduce((sum, invoice) => sum + invoice.payload.totalAmount, 0)

  useEffect(() => {
    if (!selectedInvoice && filteredRecords.length > 0) {
      setSelectedInvoiceId(filteredRecords[0].id)
    }
  }, [filteredRecords, selectedInvoice])

  function printSelectedInvoice() {
    if (!selectedInvoice) {
      return
    }

    window.print()
  }

  async function executeReturn(invoice: InvoiceRecord, items: Array<{ invoiceItemId: string; quantity: number }>, reason: string) {
    setIsSubmittingReturn(true)

    try {
      await submitSaleReturn({
        invoiceId: invoice.id,
        reason,
        items,
      })
      await loadInvoices()
      setReturnReason('')
      setReturnQuantities({})
      setMessage('تم تنفيذ مرتجع المبيعات وإعادة الكميات إلى المخزون.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تنفيذ مرتجع المبيعات.')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  async function handleSubmitReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedInvoice || selectedInvoice.tone !== 'saved') {
      setMessage('لا يمكن تنفيذ مرتجع إلا على فاتورة محفوظة على الخادم.')
      return
    }

    const items = selectedInvoice.items
      .map((item) => ({
        invoiceItemId: item.id,
        quantity: Number(returnQuantities[item.id] ?? ''),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)

    if (items.length === 0) {
      setMessage('أدخل كمية مرتجع لصنف واحد على الأقل.')
      return
    }

    if (returnReason.trim().length < 3) {
      setMessage('أدخل سبب المرتجع.')
      return
    }

    await executeReturn(selectedInvoice, items, returnReason.trim())
  }

  async function handleSubmitFullReturn() {
    if (!selectedInvoice || selectedInvoice.tone !== 'saved') {
      setMessage('لا يمكن تنفيذ مرتجع إلا على فاتورة محفوظة على الخادم.')
      return
    }

    const items = getReturnableInvoiceItems(selectedInvoice).map(({ item, remainingQuantity }) => ({
      invoiceItemId: item.id,
      quantity: remainingQuantity,
    }))

    if (items.length === 0) {
      setMessage('كل سطور هذه الفاتورة أُرجعت بالكامل مسبقاً.')
      return
    }

    const shouldProceed = window.confirm(`سيتم إرجاع كامل المتبقي من الفاتورة ${selectedInvoice.invoiceNo}. هل تريد المتابعة؟`)

    if (!shouldProceed) {
      return
    }

    await executeReturn(
      selectedInvoice,
      items,
      normalizeReturnReason(returnReason, `إلغاء كامل المتبقي من الفاتورة ${selectedInvoice.invoiceNo}`),
    )
  }

  async function handleSubmitSingleLineReturn(item: InvoiceRecordItem) {
    if (!selectedInvoice || selectedInvoice.tone !== 'saved') {
      setMessage('لا يمكن تنفيذ مرتجع إلا على فاتورة محفوظة على الخادم.')
      return
    }

    const quantity = Number(returnQuantities[item.id] ?? '')
    const returnedQuantity = getReturnedQuantity(selectedInvoice, item.id)
    const remainingQuantity = Number((item.quantity - returnedQuantity).toFixed(3))

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage('أدخل كمية صالحة للسطر الذي تريد إرجاعه.')
      return
    }

    if (quantity > remainingQuantity) {
      setMessage('كمية المرتجع لهذا السطر تتجاوز المتبقي القابل للإرجاع.')
      return
    }

    await executeReturn(
      selectedInvoice,
      [{ invoiceItemId: item.id, quantity }],
      normalizeReturnReason(returnReason, `مرتجع للسطر ${getInvoiceItemSaleModeLabel(item)} من الفاتورة ${selectedInvoice.invoiceNo}`),
    )
  }

  function handleExportInvoices() {
    exportRowsToCsv({
      fileName: `super-m2-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        'invoice_no',
        'created_at',
        'source',
        'status',
        'currency',
        'exchange_rate',
        'subtotal_iqd',
        'vat_iqd',
        'total_iqd',
        'items_count',
        'payments_count',
        'returns_count',
        'notes',
      ],
      rows: filteredRecords.map((invoice) => [
        invoice.invoiceNo,
        invoice.createdAt,
        invoice.sourceLabel,
        invoice.statusLabel,
        invoice.currencyCode,
        invoice.exchangeRate,
        invoice.subtotal,
        invoice.vatAmount,
        invoice.totalAmount,
        invoice.itemsCount,
        invoice.paymentCount,
        invoice.returns.length,
        invoice.notes ?? '',
      ]),
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">SALES LEDGER</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">سجل الفواتير</h1>
              <p className="mt-2 text-sm text-stone-600">
                عرض موحد للفواتير المحفوظة على الخادم والفواتير المحلية المعلقة بانتظار المزامنة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
                onClick={handleExportInvoices}
                type="button"
              >
                تصدير CSV
              </button>
              <button
                className="rounded-full bg-teal-600 px-4 py-2 text-sm font-black text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-teal-300"
                disabled={isSyncing || pendingInvoices.length === 0}
                onClick={handleSyncPending}
                type="button"
              >
                {isSyncing ? 'جارٍ تنفيذ المزامنة...' : 'مزامنة الفواتير المعلقة'}
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadInvoices()}
                type="button"
              >
                تحديث السجل
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/pos">
                العودة إلى الكاشير
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">SYNCED</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{savedInvoices.length}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي المحفوظ على الخادم</p>
            <p className="mt-3 text-lg font-black text-emerald-700">{formatMoney(savedTotalIqd, 'IQD')}</p>
          </article>

          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">PENDING</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{pendingInvoices.length}</p>
            <p className="mt-2 text-sm text-stone-600">فواتير محلية بانتظار الرفع</p>
            <p className="mt-3 text-lg font-black text-amber-700">{formatMoney(pendingTotalIqd, 'IQD')}</p>
          </article>

          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">TOTAL FLOW</p>
            <p className="mt-3 font-display text-4xl font-black">{records.length}</p>
            <p className="mt-2 text-sm text-stone-300">إجمالي السجل المعروض حالياً</p>
            <div className="mt-4 text-sm leading-7 text-stone-300">الربح التقديري المحفوظ: {formatMoney(savedProfitIqd, 'IQD')}</div>
          </article>
        </section>

        {message ? (
          <section className="mt-6 rounded-[24px] border border-teal-300/40 bg-teal-50 px-5 py-4 text-sm font-bold text-teal-800">
            {message}
          </section>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6 print:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">INVOICES</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">آخر الفواتير</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                placeholder="ابحث برقم الفاتورة أو اسم صنف أو باركود"
                value={invoiceQuery}
                onChange={(event) => setInvoiceQuery(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${sourceFilter === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                  onClick={() => setSourceFilter('all')}
                  type="button"
                >
                  كل السجلات
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${sourceFilter === 'saved' ? 'bg-emerald-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-emerald-500 hover:text-emerald-700'}`}
                  onClick={() => setSourceFilter('saved')}
                  type="button"
                >
                  محفوظة
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${sourceFilter === 'pending' ? 'bg-amber-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-amber-500 hover:text-amber-700'}`}
                  onClick={() => setSourceFilter('pending')}
                  type="button"
                >
                  معلقة
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`rounded-full px-4 py-2 text-sm font-black transition ${returnsFilter === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-700 hover:border-rose-400 hover:text-rose-700'}`}
                onClick={() => setReturnsFilter('all')}
                type="button"
              >
                كل حالات المرتجع
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-black transition ${returnsFilter === 'with-returns' ? 'bg-rose-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-rose-400 hover:text-rose-700'}`}
                onClick={() => setReturnsFilter('with-returns')}
                type="button"
              >
                بها مرتجعات
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-black transition ${returnsFilter === 'without-returns' ? 'bg-teal-600 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                onClick={() => setReturnsFilter('without-returns')}
                type="button"
              >
                بدون مرتجعات
              </button>
            </div>

            <div className="mt-5 space-y-4">
            {isLoading ? (
              <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                جارٍ تحميل سجل الفواتير...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                لا توجد فواتير تطابق عوامل البحث أو التصفية الحالية.
              </div>
            ) : (
              filteredRecords.map((invoice) => {
                const totalDisplay = formatDualMoney(invoice.totalAmount, invoice.currencyCode, invoice.exchangeRate)

                return (
                  <button
                    key={invoice.id}
                    className={`block w-full rounded-[26px] border p-4 text-right transition ${selectedInvoice?.id === invoice.id ? 'border-teal-400 bg-teal-50/70' : 'border-stone-200/80 bg-stone-50/80 hover:border-teal-300 hover:bg-white'}`}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    type="button"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-xl font-black text-stone-950">{invoice.invoiceNo}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${invoice.tone === 'saved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {invoice.statusLabel}
                          </span>
                          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">
                            {invoice.sourceLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-stone-600">
                          تاريخ العملية: {formatDate(invoice.createdAt)}
                          <span className="mx-2 text-stone-400">|</span>
                          عناصر الفاتورة: {invoice.itemsCount}
                          <span className="mx-2 text-stone-400">|</span>
                          دفعات مسجلة: {invoice.paymentCount}
                          <span className="mx-2 text-stone-400">|</span>
                          مرتجعات: {invoice.returns.length}
                          {invoice.customerName ? (
                            <>
                              <span className="mx-2 text-stone-400">|</span>
                              العميل: {invoice.customerName}
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="min-w-52 rounded-2xl bg-white px-4 py-4 text-left">
                        <p className="text-xs text-stone-500">الإجمالي</p>
                        <p className="mt-1 font-display text-2xl font-black text-teal-700">{totalDisplay.primary}</p>
                        <p className="mt-1 text-xs font-bold text-stone-500">{totalDisplay.secondary}</p>
                        {invoice.remainingAmountIqd > 0.01 ? <p className="mt-2 text-xs font-bold text-amber-700">المتبقي: {formatMoney(invoice.remainingAmountIqd, 'IQD')}</p> : null}
                        <p className="mt-2 text-xs font-bold text-emerald-700">ربح تقديري: {formatMoney(invoice.estimatedProfit, 'IQD')}</p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
            </div>
          </div>

          <div className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6 print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
            {selectedInvoice ? (
              <div className="print:px-0">
                <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                  <div>
                    <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">DETAILS</p>
                    <h2 className="mt-2 font-display text-3xl font-black">تفاصيل الفاتورة</h2>
                  </div>
                  <button
                    className="rounded-full bg-white px-4 py-2 text-sm font-black text-stone-900 transition hover:bg-stone-100"
                    onClick={printSelectedInvoice}
                    type="button"
                  >
                    طباعة الإيصال
                  </button>
                </div>

                <div className="mt-5 rounded-[28px] border border-white/10 bg-white/6 p-5 print:mt-0 print:rounded-none print:border print:border-stone-300 print:bg-white">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 print:border-stone-300">
                    <div>
                      <p className="font-display text-2xl font-black print:text-black">Super M2</p>
                      <p className="mt-1 text-sm text-stone-300 print:text-stone-600">إيصال بيع مبسط قابل للطباعة</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-2xl font-black text-amber-300 print:text-stone-900">{selectedInvoice.invoiceNo}</p>
                      <p className="mt-1 text-sm text-stone-300 print:text-stone-600">{formatDate(selectedInvoice.createdAt)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3 print:grid-cols-3">
                    <div className="rounded-2xl bg-black/20 px-4 py-4 print:bg-stone-50">
                      <p className="text-xs text-stone-400 print:text-stone-500">الحالة</p>
                      <p className="mt-1 font-bold text-white print:text-stone-900">{selectedInvoice.statusLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-4 print:bg-stone-50">
                      <p className="text-xs text-stone-400 print:text-stone-500">مصدر الحفظ</p>
                      <p className="mt-1 font-bold text-white print:text-stone-900">{selectedInvoice.sourceLabel}</p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-4 print:bg-stone-50">
                      <p className="text-xs text-stone-400 print:text-stone-500">سعر الصرف</p>
                      <p className="mt-1 font-bold text-white print:text-stone-900">1 USD = {selectedInvoice.exchangeRate.toLocaleString('en-US')} IQD</p>
                    </div>
                  </div>

                  {selectedInvoice.customerName ? (
                    <div className="mt-3 rounded-2xl bg-black/20 px-4 py-4 text-sm font-bold text-white print:bg-stone-50 print:text-stone-900">
                      العميل: {selectedInvoice.customerName}
                    </div>
                  ) : null}

                  {selectedInvoice.tone === 'saved' && selectedInvoice.remainingAmountIqd > 0.01 && (selectedInvoice.customerId || selectedInvoice.customerName) ? (
                    <div className="mt-3 flex flex-wrap gap-3 print:hidden">
                      <Link
                        className="rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-100 transition hover:border-amber-200 hover:bg-amber-400/20"
                        to={buildCustomerAccountLink(selectedInvoice)}
                      >
                        فتح حساب العميل للتحصيل
                      </Link>
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <p className="text-sm font-black tracking-[0.2em] text-teal-200/80 print:text-teal-700">ITEMS</p>
                    <div className="mt-3 space-y-3">
                      {selectedInvoice.items.map((item) => (
                        <article key={`${selectedInvoice.id}-${item.productId}-${item.barcode}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 print:border-stone-200 print:bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-white print:text-stone-900">{item.name}</p>
                              <p className="mt-1 text-xs text-stone-400 print:text-stone-500">
                                {getInvoiceItemSaleModeLabel(item)} | {item.unitLabel} | {getInvoiceItemSourceLabel(item)}
                              </p>
                              <p className="mt-1 text-xs text-stone-500 print:text-stone-500">{item.barcode}</p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-stone-400 print:text-stone-500">الإجمالي</p>
                              <p className="font-bold text-amber-300 print:text-stone-900">{formatMoney(item.lineTotal, selectedInvoice.currencyCode, selectedInvoice.exchangeRate)}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-300 print:text-stone-600">
                            <span>الكمية: {item.quantity} {item.unitLabel}</span>
                            <span>سعر الوحدة: {formatMoney(item.unitPrice, selectedInvoice.currencyCode, selectedInvoice.exchangeRate)}</span>
                            {item.saleUnit === 'wholesale' ? <span>المكافئ المخزني: {item.baseQuantity}</span> : null}
                            {isStoredInvoiceItem(item) ? <span>تكلفة الوحدة: {formatMoney(item.unitCost, 'IQD')}</span> : null}
                            {isStoredInvoiceItem(item) ? <span>ربح السطر: {formatMoney(item.lineProfit, 'IQD')}</span> : null}
                            <span>VAT: {(item.vatRate * 100).toFixed(0)}%</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-black tracking-[0.2em] text-amber-200/80 print:text-amber-700">PAYMENTS</p>
                    {selectedInvoice.payments.length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-4 text-sm text-stone-300 print:border-stone-200 print:bg-stone-50 print:text-stone-600">
                        لا توجد دفعات مقبوضة على هذه الفاتورة حتى الآن.
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {selectedInvoice.payments.map((payment, index) => (
                          <article key={`${selectedInvoice.id}-payment-${index + 1}`} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 print:border-stone-200 print:bg-stone-50">
                            <p className="text-xs text-stone-400 print:text-stone-500">دفعة {index + 1}</p>
                            <p className="mt-1 font-bold text-white print:text-stone-900">{payment.currencyCode === 'USD' ? 'نقدي بالدولار' : 'نقدي بالدينار'}</p>
                            <p className="mt-2 text-sm text-stone-300 print:text-stone-600">المبلغ المقبوض: {payment.currencyCode === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.amountReceived) : formatMoney(payment.amountReceivedIqd, 'IQD')}</p>
                            <p className="mt-1 text-xs text-stone-400 print:text-stone-500">المكافئ بالدينار: {formatMoney(payment.amountReceivedIqd, 'IQD')}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedInvoice.tone === 'saved' ? (
                    <div className="mt-5 print:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black tracking-[0.2em] text-rose-200/80">RETURNS</p>
                          <h3 className="mt-2 font-display text-2xl font-black">مرتجع المبيعات</h3>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/90">
                            يعيد الكمية إلى المخزون ويسجل حركة مستقلة
                          </span>
                          <button
                            className="rounded-full bg-rose-500 px-4 py-2 text-sm font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-300"
                            disabled={isSubmittingReturn || getReturnableInvoiceItems(selectedInvoice).length === 0}
                            onClick={() => void handleSubmitFullReturn()}
                            type="button"
                          >
                            إرجاع كامل المتبقي
                          </button>
                        </div>
                      </div>

                      <form className="mt-4 space-y-4" onSubmit={handleSubmitReturn}>
                        <div className="space-y-3">
                          {selectedInvoice.items.map((item, index) => {
                            const returnedQuantity = getReturnedQuantity(selectedInvoice, item.id)
                            const remainingQuantity = Number((item.quantity - returnedQuantity).toFixed(3))

                            return (
                              <article key={`${selectedInvoice.id}-return-${item.id}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-bold text-white">{item.name}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white/90">السطر {index + 1}</span>
                                      <span className={`rounded-full px-3 py-1 text-[11px] font-black ${item.saleUnit === 'wholesale' ? 'bg-teal-400/15 text-teal-200' : 'bg-amber-400/15 text-amber-200'}`}>{getInvoiceItemSaleModeLabel(item)}</span>
                                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white/90">{item.unitLabel}</span>
                                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white/90" dir="ltr">{item.barcode}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-stone-400">
                                      المباع: {item.quantity} {item.unitLabel} | المُرجع: {returnedQuantity} | المتبقي للإرجاع: {remainingQuantity}
                                    </p>
                                  </div>
                                  <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[280px]">
                                    <input
                                      className="h-11 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-rose-300"
                                      disabled={remainingQuantity <= 0}
                                      max={remainingQuantity}
                                      min="0"
                                      placeholder="كمية مرتجع هذا السطر"
                                      step={item.source === 'scale' ? '0.125' : '1'}
                                      type="number"
                                      value={returnQuantities[item.id] ?? ''}
                                      onChange={(event) => {
                                        setReturnQuantities((current) => ({
                                          ...current,
                                          [item.id]: event.target.value,
                                        }))
                                      }}
                                    />
                                    <button
                                      className="rounded-2xl border border-rose-300/50 bg-rose-500/15 px-4 py-2 text-sm font-black text-rose-100 transition hover:border-rose-200 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                                      disabled={remainingQuantity <= 0 || isSubmittingReturn}
                                      onClick={() => void handleSubmitSingleLineReturn(item)}
                                      type="button"
                                    >
                                      إرجاع هذا السطر فقط
                                    </button>
                                  </div>
                                </div>
                              </article>
                            )
                          })}
                        </div>

                        <label className="block text-sm font-bold text-stone-200">
                          سبب المرتجع
                          <input
                            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-rose-300"
                            placeholder="مثال: تلف، خطأ فاتورة، إرجاع عميل"
                            value={returnReason}
                            onChange={(event) => setReturnReason(event.target.value)}
                          />
                        </label>

                        <button
                          className="rounded-2xl bg-rose-500 px-4 py-3 text-base font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-300"
                          disabled={isSubmittingReturn}
                          type="submit"
                        >
                          {isSubmittingReturn ? 'جارٍ تنفيذ المرتجع...' : 'تثبيت مرتجع المبيعات'}
                        </button>
                      </form>

                      {selectedInvoice.returns.length > 0 ? (
                        <div className="mt-5 space-y-3">
                          {selectedInvoice.returns.map((saleReturn) => (
                            <article key={saleReturn.id} className="rounded-2xl border border-rose-200/30 bg-rose-400/10 px-4 py-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-bold text-white">{saleReturn.reason}</p>
                                <p className="text-xs text-rose-100">{formatDate(saleReturn.createdAt)}</p>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-rose-50">
                                {saleReturn.items.map((item) => (
                                  <span key={`${saleReturn.id}-${item.invoiceItemId ?? item.productId}`} className="rounded-full bg-white/10 px-3 py-1 font-bold">
                                    {getReturnItemLabel(selectedInvoice, item.invoiceItemId, item.productId)}: {item.quantity}
                                  </span>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 rounded-[24px] bg-white px-4 py-4 text-stone-900 print:border print:border-stone-200">
                    {selectedInvoice.remainingAmountIqd > 0.01 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-stone-600">المبلغ المقبوض</span>
                        <span className="font-display text-xl font-black">{formatMoney(selectedInvoice.amountPaidIqd, 'IQD')}</span>
                      </div>
                    ) : null}
                    {selectedInvoice.remainingAmountIqd > 0.01 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-stone-600">المتبقي على العميل</span>
                        <span className="font-display text-xl font-black text-amber-700">{formatMoney(selectedInvoice.remainingAmountIqd, 'IQD')}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-600">الإجمالي قبل الضريبة</span>
                      <span className="font-display text-xl font-black">{formatMoney(selectedInvoice.subtotal, selectedInvoice.currencyCode, selectedInvoice.exchangeRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-600">الضريبة</span>
                      <span className="font-display text-xl font-black text-amber-600">{formatMoney(selectedInvoice.vatAmount, selectedInvoice.currencyCode, selectedInvoice.exchangeRate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-600">التكلفة التقديرية</span>
                      <span className="font-display text-xl font-black text-stone-900">{formatMoney(selectedInvoice.estimatedCost, 'IQD')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-stone-600">الربح التقديري</span>
                      <span className="font-display text-xl font-black text-emerald-700">{formatMoney(selectedInvoice.estimatedProfit, 'IQD')}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-stone-200 pt-3">
                      <span className="text-sm font-bold text-stone-700">الإجمالي النهائي</span>
                      <div className="text-left">
                        <p className="font-display text-2xl font-black text-teal-700">{formatMoney(selectedInvoice.totalAmount, selectedInvoice.currencyCode, selectedInvoice.exchangeRate)}</p>
                        <p className="text-xs font-bold text-stone-500">{formatDualMoney(selectedInvoice.totalAmount, selectedInvoice.currencyCode, selectedInvoice.exchangeRate).secondary}</p>
                      </div>
                    </div>
                  </div>

                  {selectedInvoice.notes ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/20 px-4 py-4 text-sm text-stone-300 print:border-stone-300 print:text-stone-700">
                      {selectedInvoice.notes}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/15 bg-white/6 px-5 py-10 text-center text-stone-300">
                اختر فاتورة من القائمة لعرض تفاصيلها.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
