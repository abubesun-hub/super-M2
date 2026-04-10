import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { buildBatchReportSummary, type BatchReportSummary } from '../lib/batch-reports'
import { formatMoney } from '../lib/currency'
import { buildDashboardSummaryRequest, createDefaultDashboardFilter, getDashboardFilterLabel } from '../lib/dashboard-periods'
import { buildExpiryAlertSummary, type ExpiryAlertSummary } from '../lib/expiry-alerts'
import { exportRowsToCsv } from '../lib/export'
import { fetchDashboardSummary, type DashboardSummary } from '../lib/dashboard-api'
import { fetchInventoryBatches, fetchProducts } from '../lib/products-api'
import { fetchPurchaseReceipts } from '../lib/purchases-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function buildInvoiceBars(summary: DashboardSummary | null) {
  const invoices = summary?.recentInvoices ?? []
  const maxTotal = Math.max(...invoices.map((invoice) => invoice.totalAmount), 1)

  return invoices
    .slice()
    .reverse()
    .map((invoice) => ({
      label: invoice.invoiceNo,
      value: invoice.totalAmount,
      height: Math.max(18, Math.round((invoice.totalAmount / maxTotal) * 160)),
    }))
}

function buildMovementBreakdown(summary: DashboardSummary | null) {
  const movements = summary?.recentMovements ?? []
  const saleCount = movements.filter((movement) => movement.movementType === 'sale').length
  const adjustmentCount = movements.filter((movement) => movement.movementType === 'adjustment').length
  const returnCount = movements.filter((movement) => movement.movementType === 'return').length
  const purchaseCount = movements.filter((movement) => movement.movementType === 'purchase').length
  const total = Math.max(saleCount + adjustmentCount + returnCount + purchaseCount, 1)

  return [
    {
      label: 'بيع',
      count: saleCount,
      color: 'bg-rose-500',
      width: `${(saleCount / total) * 100}%`,
    },
    {
      label: 'تعديل',
      count: adjustmentCount,
      color: 'bg-teal-600',
      width: `${(adjustmentCount / total) * 100}%`,
    },
    {
      label: 'مرتجع',
      count: returnCount,
      color: 'bg-amber-500',
      width: `${(returnCount / total) * 100}%`,
    },
    {
      label: 'شراء',
      count: purchaseCount,
      color: 'bg-emerald-500',
      width: `${(purchaseCount / total) * 100}%`,
    },
  ]
}

function buildSalesTimelineBars(summary: DashboardSummary | null) {
  const points = summary?.salesTimeline ?? []
  const maxTotal = Math.max(...points.map((point) => point.salesTotal), 1)

  return points.map((point) => ({
    ...point,
    height: point.salesTotal > 0 ? Math.max(20, Math.round((point.salesTotal / maxTotal) * 150)) : 10,
  }))
}

function getStorageBadgeClasses(summary: DashboardSummary | null) {
  if (summary?.storage.driver === 'postgres' && summary.storage.connected) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  }

  return 'border-amber-300 bg-amber-50 text-amber-800'
}

function getExpiryPanelClasses(severity: 'expired' | 'critical' | 'warning') {
  return severity === 'expired'
    ? 'border-rose-200 bg-rose-50/90 text-rose-900'
    : severity === 'critical'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : 'border-sky-200 bg-sky-50/90 text-sky-900'
}

function getExpiryBadgeClasses(severity: 'expired' | 'critical' | 'warning') {
  return severity === 'expired'
    ? 'bg-rose-100 text-rose-800'
    : severity === 'critical'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-sky-100 text-sky-800'
}

function getExpiryLabel(daysUntilExpiry: number) {
  if (daysUntilExpiry < 0) {
    return `منتهي منذ ${Math.abs(daysUntilExpiry)} يوم`
  }

  if (daysUntilExpiry === 0) {
    return 'ينتهي اليوم'
  }

  return `متبقّي ${daysUntilExpiry} يوم`
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [filter, setFilter] = useState(createDefaultDashboardFilter)
  const [expirySummary, setExpirySummary] = useState<ExpiryAlertSummary>({
    alerts: [],
    expiredCount: 0,
    criticalCount: 0,
    warningCount: 0,
    affectedProductsCount: 0,
  })
  const [batchReportSummary, setBatchReportSummary] = useState<BatchReportSummary>({
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
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  async function loadDashboard(nextFilter = filter) {
    setIsLoading(true)

    try {
      const data = await fetchDashboardSummary(buildDashboardSummaryRequest(nextFilter))
      setSummary(data)

      const [productsResult, receiptsResult, batchesResult] = await Promise.allSettled([
        fetchProducts(),
        fetchPurchaseReceipts(),
        fetchInventoryBatches(),
      ])

      if (productsResult.status === 'fulfilled' && receiptsResult.status === 'fulfilled') {
        setExpirySummary(buildExpiryAlertSummary(receiptsResult.value, productsResult.value))
        if (batchesResult.status === 'fulfilled') {
          setBatchReportSummary(buildBatchReportSummary(batchesResult.value, productsResult.value))
        } else {
          setBatchReportSummary({
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
        }
      } else {
        setExpirySummary({
          alerts: [],
          expiredCount: 0,
          criticalCount: 0,
          warningCount: 0,
          affectedProductsCount: 0,
        })
        setBatchReportSummary({
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
      }

      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل لوحة التشغيل.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const invoiceBars = buildInvoiceBars(summary)
  const movementBreakdown = buildMovementBreakdown(summary)
  const salesTimelineBars = buildSalesTimelineBars(summary)
  const salesPeriodLabel = summary?.period.label ?? getDashboardFilterLabel(filter.preset)

  function handlePresetChange(preset: typeof filter.preset) {
    const nextFilter = { ...filter, preset }
    setFilter(nextFilter)
    void loadDashboard(nextFilter)
  }

  function applyCustomFilter() {
    const nextFilter = { ...filter, preset: 'custom' as const }
    setFilter(nextFilter)
    void loadDashboard(nextFilter)
  }

  function exportSummaryCsv() {
    if (!summary) {
      return
    }

    exportRowsToCsv({
      fileName: `dashboard-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['المؤشر', 'القيمة'],
      rows: [
        ['الفترة', summary.period.label],
        ['عدد الفواتير', summary.salesCount],
        ['إجمالي المبيعات', summary.salesTotal],
        ['عدد المرتجعات', summary.returnsCount],
        ['عدد الأصناف منخفضة المخزون', summary.lowStockCount],
        ['دفعات منتهية الصلاحية', expirySummary.expiredCount],
        ['دفعات قريبة جداً من الانتهاء', expirySummary.criticalCount],
        ['دفعات تحتاج متابعة خلال 30 يوماً', expirySummary.warningCount],
        ['قيمة التالف بالكلفة', batchReportSummary.wasteSummary.estimatedCostLossIqd],
        ['قيمة التالف بسعر البيع', batchReportSummary.wasteSummary.estimatedRetailLossIqd],
        ['إجمالي الأصناف', summary.productsCount],
        ['القيمة التقديرية للمخزون', summary.inventoryValue],
        ['وضع التخزين', summary.storage.driver],
        ['التخزين الدائم', summary.storage.persistence ? 'نعم' : 'لا'],
      ],
    })
  }

  function exportHourlySalesCsv() {
    if (!summary) {
      return
    }

    exportRowsToCsv({
      fileName: `dashboard-hourly-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['الفترة', 'عدد الفواتير', 'إجمالي المبيعات'],
      rows: summary.salesTimeline.map((point) => [point.label, point.invoicesCount, point.salesTotal]),
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">OPERATIONS DASHBOARD</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">لوحة التشغيل اليومية</h1>
              <p className="mt-2 text-sm text-stone-600">
                نظرة سريعة على المبيعات والربحية والمرتجعات بحسب الفترة المختارة، مع بقاء المخزون والصلاحية كمؤشرات تشغيلية لحظية.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full border px-4 py-2 text-xs font-black ${getStorageBadgeClasses(summary)}`}>
                {summary?.storage.driver === 'postgres' ? 'التخزين: PostgreSQL' : 'التخزين: Memory Fallback'}
              </span>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadDashboard()}
                type="button"
              >
                تحديث اللوحة
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={exportSummaryCsv}
                type="button"
              >
                تصدير ملخص CSV
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={exportHourlySalesCsv}
                type="button"
              >
                تصدير الساعات CSV
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/pos">
                الكاشير
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-sky-500 hover:text-sky-700" to="/price-checker">
                السعارات
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/inventory">
                المخزون
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-sky-500 hover:text-sky-700" to="/employees">
                الموظفون
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-indigo-500 hover:text-indigo-700" to="/shifts">
                الورديات
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-rose-500 hover:text-rose-700" to="/batches">
                الدفعات والصلاحيات
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-emerald-500 hover:text-emerald-700" to="/purchases">
                المشتريات
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/invoices">
                الفواتير
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-[28px] border border-white/75 bg-white/82 p-4 shadow-[0_16px_50px_rgba(77,60,27,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-stone-500">SALES PERIOD FILTER</p>
              <h2 className="mt-1 font-display text-2xl font-black text-stone-950">الفترة الحالية: {salesPeriodLabel}</h2>
              <p className="mt-2 text-sm text-stone-600">بطاقات المبيعات تتبع هذا الفلتر. بطاقات المخزون والصلاحية تبقى قراءة لحظية مباشرة.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['today', 'month', 'year', 'all'] as const).map((preset) => (
                <button
                  key={preset}
                  className={`rounded-full border px-4 py-2 text-sm font-black transition ${filter.preset === preset ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}
                  onClick={() => handlePresetChange(preset)}
                  type="button"
                >
                  {getDashboardFilterLabel(preset)}
                </button>
              ))}
              <input
                className="h-11 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 outline-none focus:border-teal-500"
                type="date"
                value={filter.startDate}
                onChange={(event) => setFilter((current) => ({ ...current, startDate: event.target.value, preset: 'custom' }))}
              />
              <input
                className="h-11 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 outline-none focus:border-teal-500"
                type="date"
                value={filter.endDate}
                onChange={(event) => setFilter((current) => ({ ...current, endDate: event.target.value, preset: 'custom' }))}
              />
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
                onClick={applyCustomFilter}
                type="button"
              >
                تطبيق الفترة
              </button>
            </div>
          </div>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        {summary ? (
          <section className={`mt-6 rounded-[24px] border px-5 py-4 text-sm font-bold ${getStorageBadgeClasses(summary)}`}>
            {summary.storage.message}
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">SALES COUNT</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary?.salesCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-600">عدد الفواتير خلال {salesPeriodLabel}</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">SALES VALUE</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(summary?.salesTotal ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي المبيعات خلال {salesPeriodLabel}</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-indigo-700">GROSS PROFIT</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(summary?.estimatedProfit ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">ربح تقديري خلال {salesPeriodLabel} حسب تكلفة البيع</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">RETURNS</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary?.returnsCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-600">عدد المرتجعات خلال {salesPeriodLabel}</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] md:col-span-2 xl:col-span-1">
            <p className="text-sm font-black tracking-[0.2em] text-amber-200/80">LOW STOCK</p>
            <p className="mt-3 font-display text-4xl font-black">{summary?.lowStockCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-300">أصناف عند حد الطلب</p>
          </article>
          <article className="rounded-[28px] border border-rose-200 bg-[linear-gradient(180deg,#fff1f2_0%,#ffe4e6_100%)] p-5 shadow-[0_24px_80px_rgba(159,18,57,0.10)] md:col-span-2 xl:col-span-1">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPIRY WATCH</p>
            <p className="mt-3 font-display text-4xl font-black text-rose-900">{expirySummary.expiredCount + expirySummary.criticalCount + expirySummary.warningCount}</p>
            <p className="mt-2 text-sm text-rose-800">
              دفعات منتهية أو قريبة الانتهاء خلال 30 يوماً
            </p>
          </article>
        </section>

        <section className="mt-6 rounded-[32px] border border-rose-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(159,18,57,0.08)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPIRY ALERTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تنبيهات الصلاحية</h2>
              <p className="mt-2 text-sm text-stone-600">
                القراءة الحالية مبنية على دفعات الشراء المسجلة ذات المخزون المتبقي، وتُستخدم كتنبيه تشغيلي قبل اعتماد صرف دفعات كامل.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left">
                <p className="text-xs font-black tracking-[0.18em] text-rose-700">EXPIRED</p>
                <p className="mt-1 font-display text-2xl font-black text-rose-900">{expirySummary.expiredCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">WITHIN 7 DAYS</p>
                <p className="mt-1 font-display text-2xl font-black text-amber-900">{expirySummary.criticalCount}</p>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left">
                <p className="text-xs font-black tracking-[0.18em] text-sky-700">WITHIN 30 DAYS</p>
                <p className="mt-1 font-display text-2xl font-black text-sky-900">{expirySummary.warningCount}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل التنبيهات...</div>
            ) : expirySummary.alerts.length ? (
              expirySummary.alerts.slice(0, 6).map((alert) => (
                <article key={alert.key} className={`rounded-2xl border px-4 py-4 ${getExpiryPanelClasses(alert.severity)}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{alert.productName}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${getExpiryBadgeClasses(alert.severity)}`}>
                          {alert.severity === 'expired' ? 'منتهي' : alert.severity === 'critical' ? 'حرج' : 'متابعة'}
                        </span>
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-stone-700">
                          {alert.department}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">
                        تاريخ الانتهاء: {formatDate(alert.expiryDate)}
                        <span className="mx-2 text-stone-400">|</span>
                        {getExpiryLabel(alert.daysUntilExpiry)}
                      </p>
                      <p className="mt-1 text-sm opacity-80">
                        السند: {alert.receiptNo}
                        {alert.batchNo ? ` | التشغيلة: ${alert.batchNo}` : ''}
                        {alert.supplierName ? ` | المورد: ${alert.supplierName}` : ''}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-xl font-black">{formatQuantity(alert.remainingStockQty)} {alert.unitLabel}</p>
                      <p className="text-xs font-bold opacity-75">الرصيد الحالي للصنف</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد دفعات تستحق تنبيه صلاحية حالياً.</div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[32px] border border-amber-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(180,83,9,0.08)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">WASTE SNAPSHOT</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تقرير الهدر والتالف</h2>
              </div>
              <Link className="text-sm font-black text-rose-700 transition hover:text-rose-900" to="/batches">
                فتح التقرير الكامل
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">EXPIRED BATCHES</p>
                <p className="mt-2 font-display text-3xl font-black text-amber-950">{batchReportSummary.wasteSummary.expiredBatchesCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">EXPIRED QUANTITY</p>
                <p className="mt-2 font-display text-3xl font-black text-amber-950">{formatQuantity(batchReportSummary.wasteSummary.expiredQuantity)}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">COST LOSS</p>
                <p className="mt-2 font-display text-2xl font-black text-amber-950">{formatMoney(batchReportSummary.wasteSummary.estimatedCostLossIqd, 'IQD')}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-xs font-black tracking-[0.18em] text-amber-700">RETAIL LOSS</p>
                <p className="mt-2 font-display text-2xl font-black text-amber-950">{formatMoney(batchReportSummary.wasteSummary.estimatedRetailLossIqd, 'IQD')}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-sky-200/80 bg-white/82 p-5 shadow-[0_24px_80px_rgba(3,105,161,0.08)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-sky-700">DISPOSAL SUGGESTIONS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">اقتراحات التصريف</h2>
              </div>
              <Link className="text-sm font-black text-sky-700 transition hover:text-sky-900" to="/batches">
                كل الاقتراحات
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل الاقتراحات...</div>
              ) : batchReportSummary.disposalSuggestions.length ? (
                batchReportSummary.disposalSuggestions.slice(0, 4).map((suggestion) => (
                  <article key={`${suggestion.productId}:${suggestion.batchNo ?? suggestion.expiryDate}`} className={`rounded-2xl border px-4 py-4 ${suggestion.severity === 'critical' ? 'border-amber-200 bg-amber-50/90' : 'border-sky-200 bg-sky-50/90'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-950">{suggestion.productName}</p>
                        <p className="mt-1 text-sm text-stone-600">{suggestion.department}</p>
                        <p className="mt-1 text-sm text-stone-600">{suggestion.batchNo || 'دفعة غير مسجلة'} | ينتهي خلال {suggestion.daysUntilExpiry} يوم</p>
                        <p className="mt-2 text-sm font-bold text-stone-800">{suggestion.recommendation}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black text-stone-950">{formatMoney(suggestion.estimatedRetailValueIqd, 'IQD')}</p>
                        <p className="text-xs font-bold text-stone-500">قيمة بيع متوقعة</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد دفعات تحتاج خطة تصريف حالياً.</div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">RECENT INVOICES</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">آخر الفواتير</h2>
              </div>
              <Link className="text-sm font-black text-teal-700 transition hover:text-teal-900" to="/invoices">
                عرض الكل
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل البيانات...</div>
              ) : summary?.recentInvoices.length ? (
                summary.recentInvoices.map((invoice) => (
                  <article key={invoice.id} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-display text-xl font-black text-stone-950">{invoice.invoiceNo}</p>
                        <p className="mt-1 text-sm text-stone-600">{formatDate(invoice.createdAt)}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black text-teal-700">{formatMoney(invoice.totalAmount, 'IQD')}</p>
                        <p className="text-xs font-bold text-stone-500">مرتجعات: {invoice.returns.length}</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد فواتير بعد.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">LOW STOCK PRODUCTS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تنبيهات المخزون</h2>
              </div>
              <Link className="text-sm font-black text-teal-700 transition hover:text-teal-900" to="/inventory">
                إدارة المخزون
              </Link>
              <Link className="text-sm font-black text-rose-700 transition hover:text-rose-900" to="/batches">
                عرض كل الدفعات
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل البيانات...</div>
              ) : summary?.lowStockProducts.length ? (
                summary.lowStockProducts.map((product) => (
                  <article key={product.id} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-950">{product.name}</p>
                        <p className="mt-1 text-sm text-stone-600">{product.department}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black text-amber-700">{formatQuantity(product.stockQty)} {product.unitLabel}</p>
                        <p className="text-xs font-bold text-stone-500">الحد الأدنى: {formatQuantity(product.minStock)}</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد تنبيهات حرجة حالياً.</div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">INVENTORY VALUE</p>
            <p className="mt-3 font-display text-5xl font-black">{formatMoney(summary?.inventoryValue ?? 0, 'IQD')}</p>
            <p className="mt-3 text-sm leading-7 text-stone-300">
              قيمة تقديرية للمخزون الحالي حسب سعر البيع المسجل داخل الكتالوج.
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm text-stone-200">
              <p>إجمالي الأصناف: {summary?.productsCount ?? 0}</p>
              <p className="mt-1">أصناف منخفضة المخزون: {summary?.lowStockCount ?? 0}</p>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">RECENT MOVEMENTS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">آخر الحركات</h2>
              </div>
              <Link className="text-sm font-black text-teal-700 transition hover:text-teal-900" to="/inventory">
                المزيد
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل البيانات...</div>
              ) : summary?.recentMovements.length ? (
                summary.recentMovements.map((movement) => (
                  <article key={movement.id} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-stone-950">{movement.productName}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-black ${movement.movementType === 'sale' ? 'bg-rose-100 text-rose-800' : movement.movementType === 'return' ? 'bg-amber-100 text-amber-800' : movement.movementType === 'purchase' ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'}`}>
                            {movement.movementType === 'sale' ? 'بيع' : movement.movementType === 'return' ? 'مرتجع' : movement.movementType === 'purchase' ? 'شراء' : 'تعديل'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-stone-600">{movement.note}</p>
                        <p className="mt-1 text-xs text-stone-500">{formatDate(movement.createdAt)}</p>
                      </div>
                      <div className="text-left">
                        <p className={`font-display text-xl font-black ${movement.quantityDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                          {movement.quantityDelta > 0 ? '+' : ''}{formatQuantity(movement.quantityDelta)}
                        </p>
                        <p className="text-xs font-bold text-stone-500">الرصيد: {formatQuantity(movement.balanceAfter)}</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد حركات حتى الآن.</div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">SALES CHART</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">أعمدة آخر الفواتير</h2>
              </div>
              <p className="text-sm font-bold text-stone-500">مقارنة سريعة بين القيم الحديثة</p>
            </div>

            <div className="mt-6 rounded-[28px] bg-stone-50/90 px-4 py-6">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-stone-500">جارٍ تحميل الرسم...</div>
              ) : invoiceBars.length ? (
                <div className="flex h-64 items-end justify-between gap-3">
                  {invoiceBars.map((bar) => (
                    <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-3">
                      <p className="text-xs font-black text-stone-500">{formatMoney(bar.value, 'IQD')}</p>
                      <div
                        className="w-full rounded-t-[20px] bg-gradient-to-t from-teal-700 via-emerald-500 to-amber-300 shadow-[0_12px_40px_rgba(20,184,166,0.18)]"
                        style={{ height: `${bar.height}px` }}
                      />
                      <p className="line-clamp-2 text-center text-xs font-bold text-stone-600">{bar.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-stone-500">لا توجد بيانات كافية للرسم حالياً.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">MOVEMENT MIX</p>
                <h2 className="mt-2 font-display text-3xl font-black">توزيع الحركات</h2>
              </div>
              <p className="text-sm font-bold text-stone-300">آخر الحركات المقروءة في النظام</p>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/6 p-5">
              <div className="overflow-hidden rounded-full bg-white/10">
                <div className="flex h-5 w-full">
                  {movementBreakdown.map((segment) => (
                    <div
                      key={segment.label}
                      className={segment.color}
                      style={{ width: segment.width }}
                      title={`${segment.label}: ${segment.count}`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {movementBreakdown.map((segment) => (
                  <div key={segment.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-3.5 w-3.5 rounded-full ${segment.color}`} />
                      <span className="text-sm font-bold text-white">{segment.label}</span>
                    </div>
                    <span className="font-display text-xl font-black text-white">{segment.count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/6 px-4 py-4 text-sm leading-7 text-stone-300">
                هذه اللوحة تعطي قراءة بصرية سريعة لنشاط البيع والتعديل والمرتجعات دون الحاجة لفتح السجلات التفصيلية في كل مرة.
              </div>
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">HOURLY SALES</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">{summary?.salesTimelineTitle ?? 'مبيعات الفترة'}</h2>
              </div>
              <p className="text-sm font-bold text-stone-500">{summary?.salesTimelineSubtitle ?? 'مجمعة حسب الفترة المختارة'}</p>
            </div>

            <div className="mt-6 rounded-[28px] bg-stone-50/90 px-4 py-6">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-stone-500">جارٍ تحميل الرسم...</div>
              ) : salesTimelineBars.some((point) => point.salesTotal > 0) ? (
                <div className="flex h-64 items-end justify-between gap-2 overflow-x-auto">
                  {salesTimelineBars.map((point) => (
                    <div key={point.label} className="flex min-w-[68px] flex-col items-center justify-end gap-2">
                      <p className="text-center text-[11px] font-black text-stone-500">{formatMoney(point.salesTotal, 'IQD')}</p>
                      <div
                        className="w-full rounded-t-[18px] bg-gradient-to-t from-stone-900 via-teal-700 to-emerald-300"
                        style={{ height: `${point.height}px` }}
                      />
                      <p className="text-center text-[11px] font-bold text-stone-600">{point.label}</p>
                      <p className="text-[11px] font-bold text-stone-400">{point.invoicesCount} فاتورة</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-stone-500">لا توجد مبيعات ضمن الفترة المحددة لعرضها زمنياً.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">TOP DEPARTMENTS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الأقسام الأعلى ربحية</h2>
              </div>
              <p className="text-sm font-bold text-stone-500">بحسب هامش {salesPeriodLabel}</p>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل البيانات...</div>
              ) : summary?.departmentBreakdown.length ? (
                summary.departmentBreakdown.map((department, index) => (
                  <article key={department.department} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl font-black text-stone-950">{index + 1}. {department.department}</p>
                        <p className="mt-1 text-sm text-stone-600">عدد البنود: {department.itemsCount} | الكمية: {formatQuantity(department.totalQuantity)}</p>
                        <p className="mt-1 text-xs font-bold text-stone-500">المبيعات: {formatMoney(department.totalAmount, 'IQD')}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black text-teal-700">{formatMoney(department.totalProfit, 'IQD')}</p>
                        <p className="text-xs font-bold text-stone-500">ربح القسم</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد بيانات أقسام كافية ضمن الفترة المحددة.</div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">TOP PROFIT PRODUCTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الأصناف الأعلى ربحية في الفترة</h2>
            </div>
            <p className="text-sm font-bold text-stone-500">تقدير مباشر اعتماداً على تكلفة البيع المخزنة</p>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {isLoading ? (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500 lg:col-span-5">جارٍ تحميل البيانات...</div>
            ) : summary?.topProfitProducts.length ? (
              summary.topProfitProducts.map((product, index) => (
                <article key={product.productId} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                  <p className="text-xs font-black tracking-[0.2em] text-stone-500">#{index + 1}</p>
                  <p className="mt-2 font-bold text-stone-950">{product.name}</p>
                  <p className="mt-2 text-sm text-stone-600">الكمية المباعة: {formatQuantity(product.totalQuantity)}</p>
                  <p className="mt-3 font-display text-2xl font-black text-emerald-700">{formatMoney(product.totalProfit, 'IQD')}</p>
                </article>
              ))
            ) : (
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500 lg:col-span-5">لا توجد بيانات ربحية كافية ضمن الفترة المحددة.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
