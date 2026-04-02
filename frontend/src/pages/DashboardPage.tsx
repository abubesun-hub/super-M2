import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import { fetchDashboardSummary, type DashboardSummary } from '../lib/dashboard-api'

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

function buildHourlySalesBars(summary: DashboardSummary | null) {
  const points = summary?.hourlySales ?? []
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

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  async function loadDashboard() {
    setIsLoading(true)

    try {
      const data = await fetchDashboardSummary()
      setSummary(data)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تحميل لوحة التشغيل.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const invoiceBars = buildInvoiceBars(summary)
  const movementBreakdown = buildMovementBreakdown(summary)
  const hourlySalesBars = buildHourlySalesBars(summary)

  function exportSummaryCsv() {
    if (!summary) {
      return
    }

    exportRowsToCsv({
      fileName: `dashboard-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['المؤشر', 'القيمة'],
      rows: [
        ['عدد فواتير اليوم', summary.todaysSalesCount],
        ['إجمالي مبيعات اليوم', summary.todaysSalesTotal],
        ['عدد مرتجعات اليوم', summary.todaysReturnsCount],
        ['عدد الأصناف منخفضة المخزون', summary.lowStockCount],
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
      rows: summary.hourlySales.map((point) => [point.label, point.invoicesCount, point.salesTotal]),
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
                نظرة سريعة على مبيعات اليوم، المرتجعات، التنبيهات، والحركات الأخيرة.
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
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/inventory">
                المخزون
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

        {message ? (
          <section className="mt-6 rounded-[24px] border border-teal-300/40 bg-teal-50 px-5 py-4 text-sm font-bold text-teal-800">
            {message}
          </section>
        ) : null}

        {summary ? (
          <section className={`mt-6 rounded-[24px] border px-5 py-4 text-sm font-bold ${getStorageBadgeClasses(summary)}`}>
            {summary.storage.message}
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">TODAY SALES</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary?.todaysSalesCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-600">عدد فواتير اليوم</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">SALES VALUE</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(summary?.todaysSalesTotal ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي مبيعات اليوم</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-indigo-700">GROSS PROFIT</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(summary?.todaysEstimatedProfit ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">ربح تقديري لليوم حسب تكلفة البيع</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">RETURNS</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary?.todaysReturnsCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-600">عدد مرتجعات اليوم</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] md:col-span-2 xl:col-span-1">
            <p className="text-sm font-black tracking-[0.2em] text-amber-200/80">LOW STOCK</p>
            <p className="mt-3 font-display text-4xl font-black">{summary?.lowStockCount ?? 0}</p>
            <p className="mt-2 text-sm text-stone-300">أصناف عند حد الطلب</p>
          </article>
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
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">مبيعات اليوم حسب الساعات</h2>
              </div>
              <p className="text-sm font-bold text-stone-500">مجمعة على فترات كل ساعتين</p>
            </div>

            <div className="mt-6 rounded-[28px] bg-stone-50/90 px-4 py-6">
              {isLoading ? (
                <div className="flex h-64 items-center justify-center text-stone-500">جارٍ تحميل الرسم...</div>
              ) : hourlySalesBars.some((point) => point.salesTotal > 0) ? (
                <div className="flex h-64 items-end justify-between gap-2 overflow-x-auto">
                  {hourlySalesBars.map((point) => (
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
                <div className="flex h-64 items-center justify-center text-stone-500">لا توجد مبيعات اليوم بعد لعرضها زمنياً.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">TOP DEPARTMENTS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الأقسام الأعلى ربحية</h2>
              </div>
              <p className="text-sm font-bold text-stone-500">بحسب هامش اليوم</p>
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
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد بيانات أقسام كافية لليوم.</div>
              )}
            </div>
          </section>
        </section>

        <section className="mt-6 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">TOP PROFIT PRODUCTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الأصناف الأعلى ربحية اليوم</h2>
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
              <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500 lg:col-span-5">لا توجد بيانات ربحية كافية لليوم.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
