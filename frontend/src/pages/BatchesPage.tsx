import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { useEmployeeSession } from '../lib/auth'
import { buildBatchReportSummary, getBatchSeverity, getBatchSeverityLabel, type BatchReportRow, type BatchReportSummary } from '../lib/batch-reports'
import { formatMoney } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import { fetchInventoryBatches, fetchProducts, type InventoryBatch } from '../lib/products-api'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function getSeverityClasses(severity: ReturnType<typeof getBatchSeverity>) {
  return severity === 'expired'
    ? 'border-rose-200 bg-rose-50/90 text-rose-900'
    : severity === 'critical'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : severity === 'warning'
        ? 'border-sky-200 bg-sky-50/90 text-sky-900'
        : severity === 'safe'
          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
          : 'border-stone-200 bg-stone-50/90 text-stone-900'
}

export function BatchesPage() {
  const { session } = useEmployeeSession()
  const [batches, setBatches] = useState<InventoryBatch[]>([])
  const [rows, setRows] = useState<BatchReportRow[]>([])
  const [reportSummary, setReportSummary] = useState<BatchReportSummary>({
    rows: [],
    expiredRows: [],
    wasteSummary: {
      expiredBatchesCount: 0,
      expiredProductsCount: 0,
      expiredQuantity: 0,
      estimatedCostLossIqd: 0,
      estimatedRetailLossIqd: 0,
    },
    disposalSuggestions: [],
  })
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<'all' | 'expired' | 'critical' | 'warning' | 'safe' | 'none'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'purchase' | 'opening'>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    setIsLoading(true)

    try {
      const [batchesResult, productsResult] = await Promise.all([
        fetchInventoryBatches(),
        fetchProducts(),
      ])

      const activeBatches = batchesResult.filter((batch) => batch.remainingQuantity > 0)
  const nextSummary = buildBatchReportSummary(activeBatches, productsResult)
      setBatches(activeBatches)
  setRows(nextSummary.rows)
  setReportSummary(nextSummary)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات الدفعات.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const filteredBatches = batches.filter((batch) => {
    const normalizedQuery = query.trim()
    const row = rows.find((entry) => entry.id === batch.id)
    const department = row?.department ?? 'غير مصنف'
    const matchesQuery =
      normalizedQuery.length === 0 ||
      batch.productName.includes(normalizedQuery) ||
      batch.batchNo?.includes(normalizedQuery) ||
      batch.supplierName?.includes(normalizedQuery) ||
      department.includes(normalizedQuery)

    const matchesSeverity = severityFilter === 'all' || getBatchSeverity(batch.expiryDate) === severityFilter
    const matchesSource = sourceFilter === 'all' || batch.source === sourceFilter

    return matchesQuery && matchesSeverity && matchesSource
  })
  const filteredRows = reportSummary.rows.filter((row) => filteredBatches.some((batch) => batch.id === row.id))
  const expiredRows = filteredRows.filter((row) => row.severity === 'expired')
  const filteredBatchIds = new Set(filteredBatches.map((batch) => batch.id))
  const disposalSuggestions = reportSummary.disposalSuggestions.filter((suggestion) =>
    filteredRows.some((row) => row.productId === suggestion.productId && filteredBatchIds.has(row.id)),
  )

  const expiredCount = batches.filter((batch) => getBatchSeverity(batch.expiryDate) === 'expired').length
  const criticalCount = batches.filter((batch) => getBatchSeverity(batch.expiryDate) === 'critical').length
  const warningCount = batches.filter((batch) => getBatchSeverity(batch.expiryDate) === 'warning').length
  const safeCount = batches.filter((batch) => getBatchSeverity(batch.expiryDate) === 'safe').length
  const openingCount = batches.filter((batch) => batch.source === 'opening').length

  function handleExport() {
    exportRowsToCsv({
      fileName: `inventory-batches-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['product_name', 'department', 'source', 'batch_no', 'remaining_qty', 'received_qty', 'expiry_date', 'status', 'purchase_date', 'supplier_name', 'retail_unit_cost'],
      rows: filteredBatches.map((batch) => [
        batch.productName,
        rows.find((row) => row.id === batch.id)?.department ?? 'غير مصنف',
        batch.source,
        batch.batchNo ?? '',
        batch.remainingQuantity,
        batch.receivedQuantity,
        batch.expiryDate ?? '',
        getBatchSeverityLabel(batch.expiryDate),
        batch.purchaseDate ?? '',
        batch.supplierName ?? '',
        batch.retailUnitCost,
      ]),
    })
  }

  function handleExportExpiredReport() {
    exportRowsToCsv({
      fileName: `expired-batches-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['product_name', 'department', 'batch_no', 'remaining_qty', 'expiry_date', 'supplier_name', 'estimated_cost_loss_iqd', 'estimated_retail_loss_iqd'],
      rows: expiredRows.map((row) => [
        row.productName,
        row.department,
        row.batchNo ?? '',
        row.remainingQuantity,
        row.expiryDate ?? '',
        row.supplierName ?? '',
        row.estimatedCostValueIqd,
        row.estimatedRetailValueIqd,
      ]),
    })
  }

  function handleExportDisposalSuggestions() {
    exportRowsToCsv({
      fileName: `disposal-suggestions-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['product_name', 'department', 'batch_no', 'expiry_date', 'days_until_expiry', 'remaining_qty', 'estimated_retail_value_iqd', 'recommendation'],
      rows: disposalSuggestions.map((suggestion) => [
        suggestion.productName,
        suggestion.department,
        suggestion.batchNo ?? '',
        suggestion.expiryDate,
        suggestion.daysUntilExpiry,
        suggestion.remainingQuantity,
        suggestion.estimatedRetailValueIqd,
        suggestion.recommendation,
      ]),
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">BATCHES CONTROL</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">دفعات المخزون والصلاحيات</h1>
              <p className="mt-2 text-sm text-stone-600">
                قراءة تفصيلية لكل دفعة متبقية في المخزون مع حالة الصلاحية والمصدر والتكلفة المرجعية.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadData()}
                type="button"
              >
                تحديث البيانات
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700"
                onClick={handleExport}
                type="button"
              >
                تصدير CSV
              </button>
              <button
                className="rounded-full border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-500"
                onClick={handleExportExpiredReport}
                type="button"
              >
                تقرير المنتهي
              </button>
              <button
                className="rounded-full border border-amber-300 px-4 py-2 text-sm font-black text-amber-700 transition hover:border-amber-500"
                onClick={handleExportDisposalSuggestions}
                type="button"
              >
                تقرير التصريف
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/inventory">
                المخزون
              </Link>
              {session?.employee.role === 'admin' ? (
                <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-rose-500 hover:text-rose-700" to="/dashboard">
                  لوحة التشغيل
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[28px] border border-rose-200 bg-rose-50/90 p-5 shadow-[0_20px_60px_rgba(159,18,57,0.08)]">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPIRED</p>
            <p className="mt-3 font-display text-4xl font-black text-rose-950">{expiredCount}</p>
          </article>
          <article className="rounded-[28px] border border-amber-200 bg-amber-50/90 p-5 shadow-[0_20px_60px_rgba(180,83,9,0.08)]">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">WITHIN 7 DAYS</p>
            <p className="mt-3 font-display text-4xl font-black text-amber-950">{criticalCount}</p>
          </article>
          <article className="rounded-[28px] border border-sky-200 bg-sky-50/90 p-5 shadow-[0_20px_60px_rgba(3,105,161,0.08)]">
            <p className="text-sm font-black tracking-[0.2em] text-sky-700">WITHIN 30 DAYS</p>
            <p className="mt-3 font-display text-4xl font-black text-sky-950">{warningCount}</p>
          </article>
          <article className="rounded-[28px] border border-emerald-200 bg-emerald-50/90 p-5 shadow-[0_20px_60px_rgba(5,150,105,0.08)]">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">SAFE</p>
            <p className="mt-3 font-display text-4xl font-black text-emerald-950">{safeCount}</p>
          </article>
          <article className="rounded-[28px] border border-stone-200 bg-white/82 p-5 shadow-[0_20px_60px_rgba(77,60,27,0.08)]">
            <p className="text-sm font-black tracking-[0.2em] text-stone-500">OPENING STOCK</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{openingCount}</p>
          </article>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[32px] border border-rose-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(159,18,57,0.08)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPIRED REPORT</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تقرير الأصناف المنتهية</h2>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">{expiredRows.length} دفعة</span>
            </div>

            <div className="mt-5 space-y-3">
              {expiredRows.length ? (
                expiredRows.slice(0, 6).map((row) => (
                  <article key={row.id} className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-4 text-rose-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{row.productName}</p>
                        <p className="mt-1 text-sm">القسم: {row.department}</p>
                        <p className="mt-1 text-sm">الدفعة: {row.batchNo || 'غير مسجلة'} | الانتهاء: {row.expiryDate ? formatDate(row.expiryDate) : 'غير محدد'}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black">{formatQuantity(row.remainingQuantity)}</p>
                        <p className="text-xs font-bold opacity-75">متبقٍ</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد دفعات منتهية حالياً.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-amber-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(180,83,9,0.08)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">WASTE REPORT</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تقرير الهدر والتالف</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">EXPIRED QUANTITY</p>
                <p className="mt-2 font-display text-3xl font-black text-amber-950">{formatQuantity(reportSummary.wasteSummary.expiredQuantity)}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">PRODUCTS AFFECTED</p>
                <p className="mt-2 font-display text-3xl font-black text-amber-950">{reportSummary.wasteSummary.expiredProductsCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">COST LOSS</p>
                <p className="mt-2 font-display text-2xl font-black text-amber-950">{formatMoney(reportSummary.wasteSummary.estimatedCostLossIqd, 'IQD')}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">RETAIL LOSS</p>
                <p className="mt-2 font-display text-2xl font-black text-amber-950">{formatMoney(reportSummary.wasteSummary.estimatedRetailLossIqd, 'IQD')}</p>
              </div>
            </div>

            <p className="mt-4 text-sm font-bold text-stone-600">
              هذا التقرير محسوب من الدفعات المنتهية التي ما زالت متبقية في المخزون، ويعطيك قيمة التالف بالكلفة وبقيمة البيع المرجعية.
            </p>
          </section>
        </section>

        <section className="mt-6 rounded-[32px] border border-sky-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(3,105,161,0.08)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-sky-700">DISPOSAL SUGGESTIONS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">اقتراحات التصريف قبل التلف</h2>
            </div>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800">{disposalSuggestions.length} اقتراح</span>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {disposalSuggestions.length ? (
              disposalSuggestions.map((suggestion) => (
                <article key={`${suggestion.productId}:${suggestion.batchNo ?? suggestion.expiryDate}`} className={`rounded-2xl border px-4 py-4 ${getSeverityClasses(suggestion.severity)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{suggestion.productName}</p>
                      <p className="mt-1 text-sm">{suggestion.department}</p>
                      <p className="mt-1 text-sm">الدفعة: {suggestion.batchNo || 'غير مسجلة'} | الانتهاء: {formatDate(suggestion.expiryDate)}</p>
                      <p className="mt-2 text-sm font-bold">{suggestion.recommendation}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-xl font-black">{formatMoney(suggestion.estimatedRetailValueIqd, 'IQD')}</p>
                      <p className="text-xs font-bold opacity-75">قيمة بيع متوقعة</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500 xl:col-span-2">لا توجد دفعات تحتاج خطة تصريف حالياً.</div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input
              className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
              placeholder="ابحث باسم الصنف أو رقم الدفعة أو المورد أو القسم"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-teal-500"
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}
            >
              <option value="all">كل الحالات</option>
              <option value="expired">منتهي</option>
              <option value="critical">خلال 7 أيام</option>
              <option value="warning">خلال 30 يومًا</option>
              <option value="safe">آمن</option>
              <option value="none">بدون انتهاء</option>
            </select>
            <select
              className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-teal-500"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}
            >
              <option value="all">كل المصادر</option>
              <option value="purchase">دفعات شراء</option>
              <option value="opening">رصيد افتتاحي</option>
            </select>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل الدفعات...</div>
            ) : filteredBatches.length ? (
              filteredBatches.map((batch) => {
                const row = rows.find((entry) => entry.id === batch.id)
                const severity = getBatchSeverity(batch.expiryDate)
                const department = row?.department ?? 'غير مصنف'

                return (
                  <article key={batch.id} className={`rounded-2xl border px-4 py-4 ${getSeverityClasses(severity)}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-xl font-black">{batch.productName}</p>
                          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-stone-700">{department}</span>
                          <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-black">
                            {batch.source === 'opening' ? 'رصيد افتتاحي' : 'شراء'}
                          </span>
                          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black">
                            {getBatchSeverityLabel(batch.expiryDate)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm lg:grid-cols-2">
                          <p>رقم الدفعة: {batch.batchNo || 'غير مسجل'}</p>
                          <p>الكمية المتبقية: {formatQuantity(batch.remainingQuantity)}</p>
                          <p>الكمية المستلمة: {formatQuantity(batch.receivedQuantity)}</p>
                          <p>تاريخ الانتهاء: {batch.expiryDate ? formatDate(batch.expiryDate) : 'بدون انتهاء'}</p>
                          <p>تاريخ الشراء: {batch.purchaseDate ? formatDate(batch.purchaseDate) : 'غير محدد'}</p>
                          <p>المورد: {batch.supplierName || 'غير محدد'}</p>
                        </div>
                      </div>

                      <div className="text-left">
                        <p className="font-display text-2xl font-black">{formatMoney(batch.retailUnitCost, 'IQD')}</p>
                        <p className="text-xs font-bold opacity-75">تكلفة الوحدة المرجعية</p>
                      </div>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد دفعات تطابق الفلاتر الحالية.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}