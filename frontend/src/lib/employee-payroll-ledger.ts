import { formatMoney } from './currency'
import type { Employee, EmployeeAbsence, EmployeeCompensation, EmployeeCumulativePayrollSummary } from './employees-api'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function getEmployeeCompensationMonthKey(entry: Pick<EmployeeCompensation, 'paymentDate' | 'periodLabel'>) {
  if (entry.periodLabel && /^\d{4}-\d{2}$/.test(entry.periodLabel)) {
    return entry.periodLabel
  }

  return entry.paymentDate.slice(0, 7)
}

function getCompensationKindLabel(kind: EmployeeCompensation['kind']) {
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
    return 'خصم يدوي'
  }

  return 'مكافأة'
}

function isDebitKind(kind: EmployeeCompensation['kind']) {
  return kind === 'salary' || kind === 'bonus'
}

export function printEmployeePayrollLedger(input: {
  employee: Employee
  summary: EmployeeCumulativePayrollSummary
  compensations: EmployeeCompensation[]
  absences: EmployeeAbsence[]
}) {
  const filteredCompensations = input.compensations
    .filter((entry) => getEmployeeCompensationMonthKey(entry).localeCompare(input.summary.throughMonth) <= 0)
    .sort((left, right) => {
      const monthCompare = getEmployeeCompensationMonthKey(left).localeCompare(getEmployeeCompensationMonthKey(right))

      if (monthCompare !== 0) {
        return monthCompare
      }

      const paymentCompare = left.paymentDate.localeCompare(right.paymentDate)

      if (paymentCompare !== 0) {
        return paymentCompare
      }

      return left.createdAt.localeCompare(right.createdAt)
    })

  const filteredAbsences = input.absences
    .filter((absence) => absence.absenceDate.slice(0, 7).localeCompare(input.summary.throughMonth) <= 0)
    .sort((left, right) => left.absenceDate.localeCompare(right.absenceDate) || left.createdAt.localeCompare(right.createdAt))

  const printWindow = window.open('', '_blank', 'width=1180,height=820')

  if (!printWindow) {
    throw new Error('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة للمتصفح.')
  }

  let runningBalance = 0
  const compensationRows = filteredCompensations.map((entry, index) => {
    const debitIqd = isDebitKind(entry.kind) ? entry.amountIqd : 0
    const creditIqd = isDebitKind(entry.kind) ? 0 : entry.amountIqd
    runningBalance += debitIqd - creditIqd

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(getCompensationKindLabel(entry.kind))}</td>
        <td>${escapeHtml(entry.paymentNo)}</td>
        <td>${escapeHtml(formatDate(entry.paymentDate))}</td>
        <td>${escapeHtml(getEmployeeCompensationMonthKey(entry))}</td>
        <td>${escapeHtml(formatMoney(debitIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(creditIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(runningBalance, 'IQD'))}</td>
        <td>${escapeHtml(entry.notes ?? '-')}</td>
      </tr>
    `
  }).join('')

  const absenceRows = filteredAbsences.map((absence, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(formatDate(absence.absenceDate))}</td>
      <td>${escapeHtml(String(absence.deductionDays))}</td>
      <td>${escapeHtml(absence.createdByEmployeeName)}</td>
      <td>${escapeHtml(formatDateTime(absence.createdAt))}</td>
      <td>${escapeHtml(absence.notes ?? '-')}</td>
    </tr>
  `).join('')

  printWindow.document.write(`
    <html lang="ar" dir="rtl">
      <head>
        <title>${escapeHtml(`كشف حساب الموظف ${input.employee.name}`)}</title>
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
          .section-title { margin-top: 26px; font-size: 20px; font-weight: 800; }
          @media print { body { margin: 0; padding: 18px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <p class="title">كشف حساب الموظف</p>
            <p style="margin-top: 8px; color: #57534e;">${escapeHtml(input.employee.name)}</p>
            <p style="margin-top: 4px; color: #57534e;">حتى شهر ${escapeHtml(input.summary.throughMonth)} | تاريخ الطباعة: ${escapeHtml(formatDate(new Date().toISOString().slice(0, 10)))}</p>
          </div>
          <div style="text-align:left;">
            <p style="font-size: 13px; color: #57534e; font-weight: 700;">المتبقي على ذمة السوبر ماركت</p>
            <p style="margin-top: 8px; font-size: 24px; font-weight: 800;">${escapeHtml(formatMoney(input.summary.totalOutstandingIqd, 'IQD'))}</p>
          </div>
        </div>

        <div class="meta">
          <div><div class="label">الرقم الوظيفي</div><div class="value">${escapeHtml(input.employee.employeeNo)}</div></div>
          <div><div class="label">المباشرة</div><div class="value">${escapeHtml(input.employee.startDate ? formatDate(input.employee.startDate) : '-')}</div></div>
          <div><div class="label">إجمالي الاستحقاق</div><div class="value">${escapeHtml(formatMoney(input.summary.totalExpectedNetSalaryIqd, 'IQD'))}</div></div>
          <div><div class="label">خصم الغيابات</div><div class="value">${escapeHtml(formatMoney(input.summary.totalAbsenceDeductionIqd, 'IQD'))}</div></div>
          <div><div class="label">إجمالي السلف</div><div class="value">${escapeHtml(formatMoney(input.summary.totalAdvanceIqd, 'IQD'))}</div></div>
          <div><div class="label">إجمالي الرواتب المدفوعة</div><div class="value">${escapeHtml(formatMoney(input.summary.totalPaymentIqd, 'IQD'))}</div></div>
          <div><div class="label">إجمالي المدفوع والسلف</div><div class="value">${escapeHtml(formatMoney(input.summary.totalPaidOutIqd, 'IQD'))}</div></div>
          <div><div class="label">المتبقي</div><div class="value">${escapeHtml(formatMoney(input.summary.totalOutstandingIqd, 'IQD'))}</div></div>
        </div>

        <p class="section-title">الحركات المالية</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>نوع الحركة</th>
              <th>رقم القيد</th>
              <th>تاريخ القيد</th>
              <th>شهر الأثر</th>
              <th>مدين</th>
              <th>دائن</th>
              <th>الرصيد الجاري</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>${compensationRows || '<tr><td colspan="9">لا توجد حركات مالية ضمن الفترة المحددة.</td></tr>'}</tbody>
        </table>

        <p class="section-title">سجل الغيابات</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>تاريخ الغياب</th>
              <th>أيام الاستقطاع</th>
              <th>سجل بواسطة</th>
              <th>وقت الإدخال</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>${absenceRows || '<tr><td colspan="6">لا توجد غيابات ضمن الفترة المحددة.</td></tr>'}</tbody>
        </table>
      </body>
    </html>
  `)

  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}