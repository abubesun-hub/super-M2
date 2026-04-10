import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { formatMoney } from '../lib/currency'
import { printShiftHandoverReport } from '../lib/shift-handover-report'
import { fetchSaleInvoices, type StoredSaleInvoice } from '../lib/sales-api'
import { buildShiftFinancialSummary } from '../lib/shift-summary'
import { fetchShifts, type CashierShift } from '../lib/shifts-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getShiftStatusLabel(status: CashierShift['status']) {
  return status === 'open' ? 'مفتوحة' : 'مغلقة'
}

function getShiftStatusClasses(status: CashierShift['status']) {
  return status === 'open'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-stone-300 bg-stone-100 text-stone-700'
}

function getInvoicesForShift(invoices: StoredSaleInvoice[], shiftId: string) {
  return invoices.filter((invoice) => invoice.shiftId === shiftId)
}

export function ShiftsPage() {
  const [shifts, setShifts] = useState<CashierShift[]>([])
  const [invoices, setInvoices] = useState<StoredSaleInvoice[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadData() {
    setIsLoading(true)

    try {
      const [shiftRows, invoiceRows] = await Promise.all([fetchShifts(), fetchSaleInvoices()])
      setShifts(shiftRows)
      setInvoices(invoiceRows)
      setSelectedShiftId((current) => current && shiftRows.some((shift) => shift.id === current) ? current : (shiftRows[0]?.id ?? null))
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات الورديات.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const selectedShift = selectedShiftId
    ? shifts.find((shift) => shift.id === selectedShiftId) ?? null
    : null

  const selectedShiftInvoices = useMemo(
    () => selectedShift ? getInvoicesForShift(invoices, selectedShift.id) : [],
    [invoices, selectedShift],
  )

  const summary = useMemo(() => {
    const openCount = shifts.filter((shift) => shift.status === 'open').length
    const closedCount = shifts.filter((shift) => shift.status === 'closed').length
    const invoicesCount = invoices.length
    const salesTotal = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)

    return {
      openCount,
      closedCount,
      invoicesCount,
      salesTotal,
    }
  }, [invoices, shifts])

  const selectedSummary = useMemo(
    () => selectedShift ? (selectedShift.closingSummary ?? buildShiftFinancialSummary(selectedShift.openingFloatIqd, selectedShiftInvoices)) : null,
    [selectedShift, selectedShiftInvoices],
  )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-sky-700">SHIFTS</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">مراجعة الورديات</h1>
              <p className="mt-2 text-sm text-stone-600">متابعة ورديات الكاشير والأجهزة وربطها بحركة الفواتير من شاشة الإدارة.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadData()}
                type="button"
              >
                تحديث البيانات
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/dashboard">
                لوحة التشغيل
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-sky-500 hover:text-sky-700" to="/employees">
                الموظفون
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">OPEN</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary.openCount}</p>
            <p className="mt-2 text-sm text-stone-600">ورديات مفتوحة حالياً</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-stone-700">CLOSED</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary.closedCount}</p>
            <p className="mt-2 text-sm text-stone-600">ورديات مغلقة</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-sky-700">INVOICES</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{summary.invoicesCount}</p>
            <p className="mt-2 text-sm text-stone-600">فواتير مرتبطة بالورديات</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">SHIFT SALES</p>
            <p className="mt-3 font-display text-4xl font-black">{formatMoney(summary.salesTotal, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-300">إجمالي مبيعات الفواتير المرتبطة بالورديات</p>
          </article>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">ALL SHIFTS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">سجل الورديات</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{shifts.length} وردية</span>
            </div>

            <div className="mt-5 space-y-4">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل الورديات...</div>
              ) : shifts.length ? (
                shifts.map((shift) => (
                  <button
                    key={shift.id}
                    className={`block w-full rounded-[26px] border p-4 text-right transition ${selectedShift?.id === shift.id ? 'border-teal-400 bg-teal-50/70' : 'border-stone-200/80 bg-stone-50/80 hover:border-teal-300 hover:bg-white'}`}
                    onClick={() => setSelectedShiftId(shift.id)}
                    type="button"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-xl font-black text-stone-950">{shift.shiftNo}</h3>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${getShiftStatusClasses(shift.status)}`}>{getShiftStatusLabel(shift.status)}</span>
                        </div>
                        <p className="mt-2 text-sm text-stone-600">
                          {shift.employeeName}
                          <span className="mx-2 text-stone-400">|</span>
                          الجهاز: {shift.terminalName}
                          <span className="mx-2 text-stone-400">|</span>
                          الفتح: {formatDate(shift.openedAt)}
                        </p>
                        {shift.remittedToFundAccountName ? <p className="mt-2 text-xs font-black text-teal-700">تم التوريد إلى: {shift.remittedToFundAccountName}</p> : null}
                      </div>
                      <div className="min-w-44 rounded-2xl bg-white px-4 py-4 text-left">
                        <p className="text-xs text-stone-500">عهدة البداية</p>
                        <p className="mt-1 font-display text-2xl font-black text-teal-700">{formatMoney(shift.openingFloatIqd, 'IQD')}</p>
                        {shift.closedAt ? <p className="mt-2 text-xs font-bold text-stone-500">أغلقت: {formatDate(shift.closedAt)}</p> : null}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد ورديات مسجلة بعد.</div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
            {selectedShift ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">SHIFT DETAILS</p>
                    <h2 className="mt-2 font-display text-3xl font-black">{selectedShift.shiftNo}</h2>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black ${selectedShift.status === 'open' ? 'border-emerald-300 bg-emerald-400/15 text-emerald-200' : 'border-stone-400 bg-white/10 text-stone-200'}`}>{getShiftStatusLabel(selectedShift.status)}</span>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">CASHIER</p>
                    <p className="mt-2 font-black">{selectedShift.employeeName}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">TERMINAL</p>
                    <p className="mt-2 font-black">{selectedShift.terminalName}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">OPEN FLOAT</p>
                    <p className="mt-2 font-black">{formatMoney(selectedShift.openingFloatIqd, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">INVOICES</p>
                    <p className="mt-2 font-black">{selectedSummary?.invoicesCount ?? 0}</p>
                  </article>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">GROSS SALES</p>
                    <p className="mt-2 font-display text-2xl font-black text-emerald-300">{formatMoney(selectedSummary?.grossSalesIqd ?? 0, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">INVOICE CASH</p>
                    <p className="mt-2 font-display text-2xl font-black text-teal-200">{formatMoney(selectedSummary?.invoiceCollectionsIqd ?? 0, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">DEBT SETTLEMENTS</p>
                    <p className="mt-2 font-display text-2xl font-black text-cyan-200">{formatMoney(selectedSummary?.customerPaymentsIqd ?? 0, 'IQD')}</p>
                    <p className="mt-1 text-xs text-stone-400">عدد العمليات: {selectedSummary?.customerPaymentsCount ?? 0}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">RETURNS</p>
                    <p className="mt-2 font-display text-2xl font-black text-rose-200">{formatMoney(selectedSummary?.returnsValueIqd ?? 0, 'IQD')}</p>
                    <p className="mt-1 text-xs text-stone-400">عدد العمليات: {selectedSummary?.returnsCount ?? 0}</p>
                  </article>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">EXPECTED CASH</p>
                    <p className="mt-2 font-display text-2xl font-black text-sky-200">{formatMoney(selectedSummary?.expectedCashIqd ?? selectedShift.openingFloatIqd, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">TOTAL CASH COLLECTED</p>
                    <p className="mt-2 font-display text-2xl font-black text-emerald-200">{formatMoney(selectedSummary?.collectedCashIqd ?? 0, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">CLOSING CASH</p>
                    <p className="mt-2 font-display text-2xl font-black text-white">{formatMoney(selectedShift.closingCashIqd ?? 0, 'IQD')}</p>
                  </article>
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">CREDIT SALES</p>
                    <p className="mt-2 font-display text-2xl font-black text-amber-200">{formatMoney(selectedSummary?.creditSalesIqd ?? 0, 'IQD')}</p>
                  </article>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-1">
                  <article className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-400">DIFFERENCE</p>
                    <p className={`mt-2 font-display text-2xl font-black ${(selectedShift.cashDifferenceIqd ?? 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>{formatMoney(selectedShift.cashDifferenceIqd ?? 0, 'IQD')}</p>
                  </article>
                </div>

                {selectedShift.status === 'closed' && selectedSummary ? (
                  <div className="mt-5 flex justify-end">
                    <button
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:border-teal-300 hover:bg-white/15"
                      onClick={() => printShiftHandoverReport({ shift: selectedShift, summary: selectedSummary })}
                      type="button"
                    >
                      طباعة محضر التسليم
                    </button>
                  </div>
                ) : null}

                <div className="mt-5 rounded-[24px] border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                  <p><span className="font-black text-white">وقت الفتح:</span> {formatDate(selectedShift.openedAt)}</p>
                  {selectedShift.closedAt ? <p className="mt-2"><span className="font-black text-white">وقت الإغلاق:</span> {formatDate(selectedShift.closedAt)}</p> : null}
                  {selectedShift.remittedToFundAccountName ? <p className="mt-2"><span className="font-black text-white">تم توريد النقدية إلى:</span> {selectedShift.remittedToFundAccountName}</p> : null}
                  {selectedShift.remittanceMovementId ? <p className="mt-2"><span className="font-black text-white">مرجع حركة الصندوق:</span> {selectedShift.remittanceMovementId}</p> : null}
                  {selectedShift.openingNote ? <p className="mt-2"><span className="font-black text-white">ملاحظة الفتح:</span> {selectedShift.openingNote}</p> : null}
                  {selectedShift.closingNote ? <p className="mt-2"><span className="font-black text-white">ملاحظة الإغلاق:</span> {selectedShift.closingNote}</p> : null}
                </div>

                <div className="mt-5 space-y-3">
                  <h3 className="font-display text-2xl font-black">فواتير هذه الوردية</h3>
                  {selectedShiftInvoices.length ? selectedShiftInvoices.map((invoice) => (
                    <article key={invoice.id} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="font-display text-xl font-black text-white">{invoice.invoiceNo}</p>
                          <p className="mt-1 text-sm text-stone-300">{formatDate(invoice.createdAt)} {invoice.customerName ? `• ${invoice.customerName}` : ''}</p>
                        </div>
                        <div className="text-left">
                          <p className="font-display text-xl font-black text-emerald-300">{formatMoney(invoice.totalAmount, 'IQD')}</p>
                          {invoice.remainingAmountIqd > 0.01 ? <p className="mt-1 text-xs font-bold text-amber-200">المتبقي: {formatMoney(invoice.remainingAmountIqd, 'IQD')}</p> : null}
                        </div>
                      </div>
                    </article>
                  )) : <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-8 text-center text-stone-300">لا توجد فواتير مرتبطة بهذه الوردية.</div>}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-8 text-center text-stone-300">اختر وردية من القائمة لعرض تفاصيلها.</div>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}