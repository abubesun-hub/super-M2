import { formatMoney } from './currency'
import type { ShiftFinancialSummary } from './shift-summary'
import type { CashierShift } from './shifts-api'

export type ShiftDenominationEntry = {
  denominationIqd: number
  count: number
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
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function printShiftHandoverReport(input: {
  shift: CashierShift
  summary: ShiftFinancialSummary
  denominationEntries?: ShiftDenominationEntry[]
}) {
  const printWindow = window.open('', '_blank', 'width=720,height=900')

  if (!printWindow) {
    return false
  }

  const denominationsMarkup = input.denominationEntries?.length
    ? input.denominationEntries.map((entry) => `
        <tr>
          <td>${escapeHtml(entry.denominationIqd.toLocaleString('en-US'))}</td>
          <td>${escapeHtml(String(entry.count))}</td>
          <td>${escapeHtml(formatMoney(entry.denominationIqd * entry.count, 'IQD'))}</td>
        </tr>
      `).join('')
    : ''

  printWindow.document.write(`
    <html lang="ar" dir="rtl">
      <head>
        <title>${escapeHtml(input.shift.shiftNo)} - محضر تسليم وردية</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { margin: 0; font-family: Tahoma, Arial, sans-serif; color: #0f172a; background: #ffffff; }
          main { max-width: 780px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #cbd5e1; padding-bottom: 14px; }
          .title { font-size: 28px; font-weight: 800; }
          .subtitle { margin-top: 6px; font-size: 12px; color: #475569; }
          .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #e0f2fe; color: #075985; font-size: 12px; font-weight: 700; }
          .grid { display: grid; gap: 12px; margin-top: 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }
          .label { font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.08em; }
          .value { margin-top: 6px; font-size: 22px; font-weight: 800; }
          .meta { margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
          .meta-row { margin-top: 8px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: right; }
          th { background: #f1f5f9; }
          .notes { margin-top: 18px; border: 1px dashed #94a3b8; border-radius: 14px; padding: 14px; font-size: 13px; line-height: 1.9; }
          .footer { margin-top: 24px; display: grid; gap: 24px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .sign { border-top: 1px solid #94a3b8; padding-top: 8px; font-size: 13px; color: #475569; }
        </style>
      </head>
      <body>
        <main>
          <section class="header">
            <div>
              <div class="title">محضر تسليم وردية</div>
              <div class="subtitle">Super M2 - ${escapeHtml(input.shift.shiftNo)}</div>
            </div>
            <div><span class="badge">${escapeHtml(input.shift.status === 'closed' ? 'وردية مغلقة' : 'مراجعة قبل الإغلاق')}</span></div>
          </section>

          <section class="meta">
            <div class="meta-row">الموظف: <strong>${escapeHtml(input.shift.employeeName)}</strong></div>
            <div class="meta-row">الجهاز: <strong>${escapeHtml(input.shift.terminalName)}</strong></div>
            <div class="meta-row">وقت الفتح: <strong>${escapeHtml(formatDateTime(input.shift.openedAt))}</strong></div>
            ${input.shift.closedAt ? `<div class="meta-row">وقت الإغلاق: <strong>${escapeHtml(formatDateTime(input.shift.closedAt))}</strong></div>` : ''}
          </section>

          <section class="grid">
            <div class="card"><div class="label">عهدة البداية</div><div class="value">${escapeHtml(formatMoney(input.shift.openingFloatIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">النقد المتوقع</div><div class="value">${escapeHtml(formatMoney(input.summary.expectedCashIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">النقد المسلم</div><div class="value">${escapeHtml(formatMoney(input.shift.closingCashIqd ?? 0, 'IQD'))}</div></div>
            <div class="card"><div class="label">الفارق النقدي</div><div class="value">${escapeHtml(formatMoney(input.shift.cashDifferenceIqd ?? 0, 'IQD'))}</div></div>
            <div class="card"><div class="label">إجمالي المبيعات</div><div class="value">${escapeHtml(formatMoney(input.summary.grossSalesIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">البيع الآجل</div><div class="value">${escapeHtml(formatMoney(input.summary.creditSalesIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">المقبوض من الفواتير</div><div class="value">${escapeHtml(formatMoney(input.summary.invoiceCollectionsIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">تسديدات الآجل</div><div class="value">${escapeHtml(formatMoney(input.summary.customerPaymentsIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">إجمالي المقبوض النقدي</div><div class="value">${escapeHtml(formatMoney(input.summary.collectedCashIqd, 'IQD'))}</div></div>
            <div class="card"><div class="label">المرتجعات</div><div class="value">${escapeHtml(formatMoney(input.summary.returnsValueIqd, 'IQD'))}</div></div>
          </section>

          <table>
            <thead>
              <tr>
                <th>عدد الفواتير</th>
                <th>عدد المرتجعات</th>
                <th>عدد تسديدات الآجل</th>
                <th>صافي المبيعات</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${escapeHtml(String(input.summary.invoicesCount))}</td>
                <td>${escapeHtml(String(input.summary.returnsCount))}</td>
                <td>${escapeHtml(String(input.summary.customerPaymentsCount))}</td>
                <td>${escapeHtml(formatMoney(input.summary.netSalesIqd, 'IQD'))}</td>
              </tr>
            </tbody>
          </table>

          ${denominationsMarkup ? `
            <table>
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>العدد</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${denominationsMarkup}
              </tbody>
            </table>
          ` : ''}

          <section class="notes">
            ${input.shift.openingNote ? `<div>ملاحظة الفتح: ${escapeHtml(input.shift.openingNote)}</div>` : ''}
            ${input.shift.closingNote ? `<div>ملاحظة الإغلاق: ${escapeHtml(input.shift.closingNote)}</div>` : ''}
          </section>

          <section class="footer">
            <div class="sign">توقيع الكاشير</div>
            <div class="sign">توقيع الإدارة / الاستلام</div>
          </section>
        </main>
      </body>
    </html>
  `)

  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}