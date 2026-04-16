import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { formatMoney } from '../lib/currency'
import { getEmployeeCompensationMonthKey, printEmployeePayrollLedger } from '../lib/employee-payroll-ledger'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  fetchCumulativePayroll,
  fetchEmployeeAbsences,
  fetchEmployeeCompensations,
  fetchEmployees,
  fetchMonthlyPayroll,
  type EmployeeCumulativePayrollSummary,
  type Employee,
  type EmployeeCompensation,
  type EmployeeCompensationKind,
  type MonthlyPayrollSummary,
} from '../lib/employees-api'

type PayrollEntry = EmployeeCompensation & {
  employeeRole: Employee['role']
}

const allEmployeesValue = 'all'
const currentMonthKey = new Date().toISOString().slice(0, 7)

function getMonthDateValue(monthKey: string) {
  return `${monthKey}-01`
}

function getMonthKeyFromDate(value: string) {
  return value.slice(0, 7)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
}

function getCompensationKindLabel(kind: EmployeeCompensationKind) {
  if (kind === 'salary') {
    return 'استحقاق راتب'
  }

  if (kind === 'payment') {
    return 'دفعة راتب'
  }

  if (kind === 'advance') {
    return 'سلفة'
  }

  if (kind === 'deduction') {
    return 'خصم'
  }

  return 'مكافأة'
}

function getCompensationKindClasses(kind: EmployeeCompensationKind) {
  if (kind === 'salary') {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }

  if (kind === 'payment') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (kind === 'advance') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (kind === 'deduction') {
    return 'border-stone-300 bg-stone-100 text-stone-800'
  }

  return 'border-sky-200 bg-sky-50 text-sky-800'
}

function getRoleLabel(role: Employee['role']) {
  if (role === 'admin') {
    return 'مدير'
  }

  if (role === 'inventory') {
    return 'مخزن'
  }

  if (role === 'accountant') {
    return 'محاسب'
  }

  return 'كاشير'
}

function getSelectedEmployeeLabel(employees: Employee[], selectedEmployeeId: string) {
  if (selectedEmployeeId === allEmployeesValue) {
    return 'كل الموظفين'
  }

  return employees.find((employee) => employee.id === selectedEmployeeId)?.name ?? 'موظف محدد'
}

export function PayrollReportPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [monthlyPayroll, setMonthlyPayroll] = useState<MonthlyPayrollSummary[]>([])
  const [cumulativePayroll, setCumulativePayroll] = useState<EmployeeCumulativePayrollSummary[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(allEmployeesValue)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadReport() {
    setIsLoading(true)

    try {
      const employeesData = await fetchEmployees()
      setEmployees(employeesData)
      const [monthly, cumulative, compensationLists] = await Promise.all([
        fetchMonthlyPayroll(selectedMonth),
        fetchCumulativePayroll(selectedMonth),
        Promise.all(employeesData.map(async (employee) => {
          const employeeEntries = await fetchEmployeeCompensations(employee.id)
          return employeeEntries
            .filter((entry) => getEmployeeCompensationMonthKey(entry) === selectedMonth)
            .map<PayrollEntry>((entry) => ({ ...entry, employeeRole: employee.role }))
        })),
      ])

      setMonthlyPayroll(monthly)
      setCumulativePayroll(cumulative)
      setEntries(compensationLists.flat().sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.createdAt.localeCompare(left.createdAt)))
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل تقرير الرواتب.'))
      setMonthlyPayroll([])
      setCumulativePayroll([])
      setEntries([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadReport()
  }, [selectedMonth])

  const filteredMonthly = useMemo(
    () => monthlyPayroll.filter((entry) => selectedEmployeeId === allEmployeesValue || entry.employeeId === selectedEmployeeId),
    [monthlyPayroll, selectedEmployeeId],
  )
  const filteredEntries = useMemo(
    () => entries.filter((entry) => selectedEmployeeId === allEmployeesValue || entry.employeeId === selectedEmployeeId),
    [entries, selectedEmployeeId],
  )
  const filteredCumulative = useMemo(
    () => cumulativePayroll.filter((entry) => selectedEmployeeId === allEmployeesValue || entry.employeeId === selectedEmployeeId),
    [cumulativePayroll, selectedEmployeeId],
  )
  const cumulativeExpected = filteredCumulative.reduce((sum, entry) => sum + entry.totalExpectedNetSalaryIqd, 0)
  const cumulativePaid = filteredCumulative.reduce((sum, entry) => sum + entry.totalPaidOutIqd, 0)
  const cumulativeRemaining = filteredCumulative.reduce((sum, entry) => sum + entry.totalOutstandingIqd, 0)

  async function handlePrintEmployeeLedger(employeeId: string) {
    try {
      const employee = employees.find((entry) => entry.id === employeeId)
      const summary = filteredCumulative.find((entry) => entry.employeeId === employeeId)

      if (!employee || !summary) {
        setMessage('لا تتوفر بيانات كافية لطباعة كشف حساب الموظف.')
        return
      }

      const [compensations, absences] = await Promise.all([
        fetchEmployeeCompensations(employeeId),
        fetchEmployeeAbsences(employeeId),
      ])

      printEmployeePayrollLedger({
        employee,
        summary,
        compensations,
        absences,
      })
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر طباعة كشف حساب الموظف.'))
    }
  }

  function buildPrintableHtml() {
    const title = `تقرير الرواتب الشهرية - ${selectedMonth}`
    const printedDate = formatDate(new Date().toISOString().slice(0, 10))

    const summaryCards = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="flex:1;min-width:160px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-weight:700;color:#374151">إجمالي الاستحقاقات التراكمية</div>
          <div style="margin-top:8px;font-size:20px;font-weight:800">${formatMoney(cumulativeExpected, 'IQD')}</div>
        </div>
        <div style="flex:1;min-width:160px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-weight:700;color:#374151">المسدد والسلف</div>
          <div style="margin-top:8px;font-size:20px;font-weight:800">${formatMoney(cumulativePaid, 'IQD')}</div>
        </div>
        <div style="flex:1;min-width:160px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-weight:700;color:#374151">المتبقي على ذمة السوبر ماركت</div>
          <div style="margin-top:8px;font-size:20px;font-weight:800">${formatMoney(cumulativeRemaining, 'IQD')}</div>
        </div>
        <div style="flex:1;min-width:120px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-weight:700;color:#374151">الموظفون في الملخص</div>
          <div style="margin-top:8px;font-size:20px;font-weight:800">${filteredCumulative.length}</div>
        </div>
      </div>
    `

    const rows = filteredCumulative.map((entry) => `
      <tr>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${entry.employeeNo}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:700">${entry.employeeName}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${getRoleLabel(entry.role)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${formatMoney(entry.totalExpectedNetSalaryIqd, 'IQD')}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right">${formatMoney(entry.totalPaidOutIqd, 'IQD')}</td>
        <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:800">${formatMoney(entry.totalOutstandingIqd, 'IQD')}</td>
      </tr>
    `).join('\n')

    return `
      <!doctype html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Arial; color:#111827; direction: rtl; margin:24px }
          h1 { text-align:center; font-size:28px; margin:0 0 8px }
          .meta { display:flex; justify-content:space-between; gap:12px; font-size:14px; margin-bottom:12px }
          table { width:100%; border-collapse:collapse; margin-top:12px }
          th { background:#f3f4f6; padding:10px; border:1px solid #e5e7eb; text-align:right }
        </style>
      </head>
      <body>
        <div style="max-width:960px;margin:0 auto">
          <h1>تقرير الرواتب الشهرية</h1>
          <div style="text-align:center;color:#6b7280;margin-bottom:8px">نسخة طباعة مختصرة تركز على المعلومات المالية الأساسية فقط.</div>
          <div class="meta">
            <div><strong>الشهر:</strong> ${selectedMonth}</div>
            <div><strong>الموظف:</strong> ${selectedEmployeeLabel}</div>
            <div><strong>تاريخ الطباعة:</strong> ${printedDate}</div>
          </div>
          ${summaryCards}
          <table>
            <thead>
              <tr>
                <th>رقم الموظف</th>
                <th>الموظف</th>
                <th>الدور</th>
                <th>إجمالي الاستحقاق</th>
                <th>المسدد والسلف</th>
                <th>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `
  }

  function handlePrint() {
    const html = buildPrintableHtml()
    try {
      // create a hidden iframe to avoid popup blockers
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.style.overflow = 'hidden'
      iframe.setAttribute('aria-hidden', 'true')
      document.body.appendChild(iframe)

      const idoc = iframe.contentWindow?.document
      if (!idoc) {
        document.body.removeChild(iframe)
        window.print()
        return
      }

      idoc.open()
      idoc.write(html)
      idoc.close()

      // Wait for content to render, then print
      const doPrint = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } finally {
          setTimeout(() => {
            try { document.body.removeChild(iframe) } catch (e) { /* noop */ }
          }, 500)
        }
      }

      // If iframe has loaded, print; otherwise fallback after short delay
      if (iframe.contentWindow?.document.readyState === 'complete') {
        doPrint()
      } else {
        // give time for fonts/images
        setTimeout(doPrint, 500)
      }
    } catch (err) {
      // fallback to normal print of the current page
      window.print()
    }
  }

  function handleExport() {
    const workbook = XLSX.utils.book_new()
    const summarySheet = XLSX.utils.json_to_sheet(filteredMonthly.map((entry) => ({
      'رقم الموظف': entry.employeeNo,
      'الموظف': entry.employeeName,
      'الدور': getRoleLabel(entry.role),
      'الشهر': entry.monthKey,
      'الأيام المستحقة': entry.payableDays,
      'أيام الغياب': entry.absenceDays,
      'خصم الغياب': entry.absenceDeductionIqd,
      'صافي الاستحقاق': entry.expectedNetSalaryIqd,
      'المدفوع': entry.paymentIqd,
      'المتبقي': entry.remainingPayableIqd,
    })))
    const entriesSheet = XLSX.utils.json_to_sheet(filteredEntries.map((entry) => ({
      'رقم القيد': entry.paymentNo,
      'الموظف': entry.employeeName,
      'نوع القيد': getCompensationKindLabel(entry.kind),
      'التاريخ': entry.paymentDate,
      'شهر القيد': entry.periodLabel ?? '',
      'المبلغ': entry.amountIqd,
      'ملاحظات': entry.notes ?? '',
    })))

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll Summary')
    XLSX.utils.book_append_sheet(workbook, entriesSheet, 'Entries')
    XLSX.writeFile(workbook, `payroll-report-${selectedMonth}.xlsx`)
  }

  const selectedEmployeeLabel = getSelectedEmployeeLabel(employees, selectedEmployeeId)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">PAYROLL REPORT</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">تقرير الرواتب الشهرية</h1>
              <p className="mt-2 text-sm text-stone-600">عرض شهري للاستحقاق، خصم الغياب، المدفوع، والمتبقي لكل الموظفين.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 print:hidden">
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" onClick={handlePrint} type="button">
                طباعة
              </button>
              <button className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-black text-emerald-700" onClick={handleExport} type="button">
                تصدير Excel
              </button>
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" onClick={() => void loadReport()} type="button">
                تحديث التقرير
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" to="/employees">
                شاشة الموظفين
              </Link>
            </div>
          </div>
        </header>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="mt-6 rounded-[24px] border border-amber-300/50 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900" />

        <section className="print hidden print:block">
          <div className="rounded-[20px] border border-stone-300 bg-white p-6 text-stone-900">
            <div className="flex items-start justify-between gap-6 border-b border-stone-200 pb-4">
              <div>
                <h2 className="text-2xl font-black">تقرير الرواتب الشهرية</h2>
                <p className="mt-2 text-sm text-stone-600">نسخة طباعة مختصرة تركز على المعلومات المالية الأساسية فقط.</p>
              </div>
              <div className="text-sm leading-7 text-stone-700">
                <p><span className="font-black text-stone-900">الشهر:</span> {selectedMonth}</p>
                <p><span className="font-black text-stone-900">الموظف:</span> {selectedEmployeeLabel}</p>
                <p><span className="font-black text-stone-900">تاريخ الطباعة:</span> {formatDate(new Date().toISOString().slice(0, 10))}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
              <div className="rounded-2xl border border-stone-200 px-4 py-3">
                <p className="font-black text-stone-500">إجمالي الاستحقاقات التراكمية</p>
                <p className="mt-2 text-lg font-black">{formatMoney(cumulativeExpected, 'IQD')}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 px-4 py-3">
                <p className="font-black text-stone-500">المسدد والسلف</p>
                <p className="mt-2 text-lg font-black">{formatMoney(cumulativePaid, 'IQD')}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 px-4 py-3">
                <p className="font-black text-stone-500">المتبقي على ذمة السوبر ماركت</p>
                <p className="mt-2 text-lg font-black">{formatMoney(cumulativeRemaining, 'IQD')}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 px-4 py-3">
                <p className="font-black text-stone-500">الموظفون في الملخص</p>
                <p className="mt-2 text-lg font-black">{filteredCumulative.length}</p>
              </div>
            </div>

            <table className="mt-6 w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-y-2 border-stone-300 bg-stone-100 text-stone-800">
                  <th className="px-3 py-3 font-black">رقم الموظف</th>
                  <th className="px-3 py-3 font-black">الموظف</th>
                  <th className="px-3 py-3 font-black">الدور</th>
                  <th className="px-3 py-3 font-black">إجمالي الاستحقاق</th>
                  <th className="px-3 py-3 font-black">المسدد والسلف</th>
                  <th className="px-3 py-3 font-black">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {filteredCumulative.map((entry) => (
                  <tr key={entry.employeeId} className="border-b border-stone-200">
                    <td className="px-3 py-3">{entry.employeeNo}</td>
                    <td className="px-3 py-3 font-bold text-stone-900">{entry.employeeName}</td>
                    <td className="px-3 py-3">{getRoleLabel(entry.role)}</td>
                    <td className="px-3 py-3">{formatMoney(entry.totalExpectedNetSalaryIqd, 'IQD')}</td>
                    <td className="px-3 py-3">{formatMoney(entry.totalPaidOutIqd, 'IQD')}</td>
                    <td className="px-3 py-3 font-black text-stone-950">{formatMoney(entry.totalOutstandingIqd, 'IQD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 print:hidden">
          <label className="block rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl text-sm font-black text-stone-800">
            شهر التقرير عبر التقويم
            <input
              className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right"
              type="date"
              value={getMonthDateValue(selectedMonth)}
              onChange={(event) => setSelectedMonth(getMonthKeyFromDate(event.target.value) || selectedMonth)}
              onFocus={(event) => event.currentTarget.showPicker?.()}
            />
            <p className="mt-2 text-xs font-bold text-stone-500">اختر أي يوم من الشهر لعرض تقرير ذلك الشهر على الشاشات اللمسية.</p>
          </label>
          <label className="block rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl text-sm font-black text-stone-800">
            الموظف
            <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
              <option value={allEmployeesValue}>كل الموظفين</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNo}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-4 print:hidden">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">TOTAL DUE</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{formatMoney(cumulativeExpected, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي الرواتب المستحقة حتى الشهر المحدد</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">SETTLED</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{formatMoney(cumulativePaid, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي ما صُرف كرواتب أو سلف</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">OUTSTANDING</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{formatMoney(cumulativeRemaining, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">المتبقي الواجب توفيره لتسديد جميع الرواتب</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-stone-700">EMPLOYEES</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{filteredCumulative.length}</p>
            <p className="mt-2 text-sm text-stone-600">موظفون ضمن الملخص التراكمي</p>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr] print:hidden">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">BY EMPLOYEE</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">ملخص حسب الموظف</h2>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل التقرير...</div> : filteredCumulative.map((entry) => (
                <article key={entry.employeeId} className="rounded-[26px] border border-stone-200 bg-stone-50/90 px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-2xl font-black text-stone-950">{entry.employeeName}</h3>
                      <p className="mt-1 text-sm text-stone-600">{entry.employeeNo} - {getRoleLabel(entry.role)}</p>
                      <p className="mt-1 text-xs font-black text-stone-500">الغياب {entry.totalAbsenceDays} يوم - الخصم {formatMoney(entry.totalAbsenceDeductionIqd, 'IQD')} - حتى شهر {entry.throughMonth}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-2xl font-black text-teal-700">{formatMoney(entry.totalOutstandingIqd, 'IQD')}</p>
                      <p className="mt-1 text-xs font-black text-stone-500">المتبقي</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                      <p className="text-xs font-black text-sky-700">إجمالي الاستحقاق</p>
                      <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(entry.totalExpectedNetSalaryIqd, 'IQD')}</p>
                    </article>
                    <article className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                      <p className="text-xs font-black text-amber-700">المسدد والسلف</p>
                      <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(entry.totalPaidOutIqd, 'IQD')}</p>
                    </article>
                    <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                      <p className="text-xs font-black text-emerald-700">المتبقي التراكمي</p>
                      <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(entry.totalOutstandingIqd, 'IQD')}</p>
                    </article>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="rounded-full border border-sky-300 px-4 py-2 text-sm font-black text-sky-700" onClick={() => void handlePrintEmployeeLedger(entry.employeeId)} type="button">
                      طباعة كشف حساب الموظف
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">DETAILS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تفاصيل القيود</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{filteredEntries.length} سجل</span>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل القيود...</div> : filteredEntries.map((entry) => (
                <article key={entry.id} className="rounded-[26px] border border-stone-200 bg-stone-50/85 p-5 shadow-[0_12px_40px_rgba(120,98,61,0.06)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-2xl font-black text-stone-950">{entry.employeeName}</h3>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getCompensationKindClasses(entry.kind)}`}>{getCompensationKindLabel(entry.kind)}</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                        <p><span className="font-black text-stone-900">رقم القيد:</span> {entry.paymentNo}</p>
                        <p><span className="font-black text-stone-900">التاريخ:</span> {formatDate(entry.paymentDate)}</p>
                        {entry.periodLabel ? <p><span className="font-black text-stone-900">الشهر:</span> {entry.periodLabel}</p> : null}
                        {entry.notes ? <p className="sm:col-span-2"><span className="font-black text-stone-900">ملاحظات:</span> {entry.notes}</p> : null}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-3xl font-black text-rose-700">{formatMoney(entry.amountIqd, 'IQD')}</p>
                      <p className="mt-1 text-xs font-bold text-stone-500">{getRoleLabel(entry.employeeRole)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
