import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { useEmployeeSession } from '../lib/auth'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import { formatMoney } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import {
  createCapitalTransaction,
  deleteCapitalTransaction,
  fetchCapitalTransactions,
  fetchFundAccounts,
  updateCapitalTransaction,
  type CapitalTransaction,
  type CapitalTransactionPayload,
  type FundAccount,
} from '../lib/funds-api'
import { fetchSaleInvoices, type StoredSaleInvoice } from '../lib/sales-api'
import { buildShiftFinancialSummary } from '../lib/shift-summary'
import { fetchShifts, type CashierShift } from '../lib/shifts-api'

type SimpleCapitalForm = {
  movementDate: string
  contributorName: string
  amountIqd: string
  sourceFundAccountId: string
  notes: string
}

type EditCapitalForm = SimpleCapitalForm & {
  movementType: 'contribution' | 'repayment'
}

type EntryTypeFilter = 'all' | 'contribution' | 'repayment'

type ContributorSummary = {
  contributorName: string
  creditIqd: number
  debitIqd: number
  balanceIqd: number
  ownershipPercentage: number
}

type StatementEntry = {
  id: string
  contributorName: string
  movementDate: string
  type: 'contribution' | 'repayment'
  notes?: string
  reference: string
  creditIqd: number
  debitIqd: number
  balanceIqd: number
}

type YearlyCapitalSummary = {
  year: string
  contributionsIqd: number
  repaymentsIqd: number
  netChangeIqd: number
  closingBalanceIqd: number
}

const today = new Date().toISOString().slice(0, 10)

const emptyForm = (): SimpleCapitalForm => ({
  movementDate: today,
  contributorName: '',
  amountIqd: '',
  sourceFundAccountId: '',
  notes: '',
})

const emptyEditForm = (): EditCapitalForm => ({
  movementDate: today,
  movementType: 'contribution',
  contributorName: '',
  amountIqd: '',
  sourceFundAccountId: '',
  notes: '',
})

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`
}

function getMovementTypeLabel(type: 'contribution' | 'repayment') {
  return type === 'contribution' ? 'إضافة رأس مال' : 'سحب من FINAL CASH لصالح المساهم'
}

function getMovementTypeAccent(type: 'contribution' | 'repayment') {
  return type === 'contribution'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-rose-200 bg-rose-50 text-rose-800'
}

function getMovementTypeFromTransaction(transaction: CapitalTransaction): 'contribution' | 'repayment' {
  return transaction.reason === 'capital-contribution' ? 'contribution' : 'repayment'
}

function getYearFromDate(value: string) {
  return value.slice(0, 4)
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('ar')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function sortByNewest(left: CapitalTransaction, right: CapitalTransaction) {
  return `${right.movementDate}-${right.createdAt}`.localeCompare(`${left.movementDate}-${left.createdAt}`)
}

function sortByOldest(left: CapitalTransaction, right: CapitalTransaction) {
  return `${left.movementDate}-${left.createdAt}`.localeCompare(`${right.movementDate}-${right.createdAt}`)
}

function toPayload(form: EditCapitalForm): CapitalTransactionPayload {
  return {
    movementDate: form.movementDate,
    movementType: form.movementType,
    contributorName: form.contributorName.trim(),
    amountIqd: Number(form.amountIqd),
    sourceFundAccountId: form.movementType === 'repayment' ? form.sourceFundAccountId || undefined : undefined,
    notes: form.notes.trim() || undefined,
  }
}

function toTypedPayload(form: SimpleCapitalForm, movementType: 'contribution' | 'repayment'): CapitalTransactionPayload {
  return {
    movementDate: form.movementDate,
    movementType,
    contributorName: form.contributorName.trim(),
    amountIqd: Number(form.amountIqd),
    sourceFundAccountId: movementType === 'repayment' ? form.sourceFundAccountId || undefined : undefined,
    notes: form.notes.trim() || undefined,
  }
}

function buildEditForm(transaction: CapitalTransaction): EditCapitalForm {
  return {
    movementDate: transaction.movementDate,
    movementType: getMovementTypeFromTransaction(transaction),
    contributorName: transaction.counterpartyName ?? '',
    amountIqd: String(transaction.amountIqd),
    sourceFundAccountId: transaction.sourceFundAccountId ?? '',
    notes: transaction.notes ?? '',
  }
}

export function CashRevenuesPage() {
  const { session } = useEmployeeSession()
  const [fundAccounts, setFundAccounts] = useState<FundAccount[]>([])
  const [transactions, setTransactions] = useState<CapitalTransaction[]>([])
  const [shifts, setShifts] = useState<CashierShift[]>([])
  const [invoices, setInvoices] = useState<StoredSaleInvoice[]>([])
  const [contributionForm, setContributionForm] = useState<SimpleCapitalForm>(emptyForm)
  const [repaymentForm, setRepaymentForm] = useState<SimpleCapitalForm>(emptyForm)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditCapitalForm>(emptyEditForm)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingContribution, setIsSavingContribution] = useState(false)
  const [isSavingRepayment, setIsSavingRepayment] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deletingMovementId, setDeletingMovementId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all')
  const [entriesYearFilter, setEntriesYearFilter] = useState('all')
  const [statementContributorFilter, setStatementContributorFilter] = useState('all')
  const [statementYearFilter, setStatementYearFilter] = useState('all')

  async function loadCashRevenueData() {
    setIsLoading(true)

    try {
      const [nextAccounts, nextTransactions, nextShifts, nextInvoices] = await Promise.all([
        fetchFundAccounts(),
        fetchCapitalTransactions(),
        fetchShifts(),
        fetchSaleInvoices(),
      ])

      setFundAccounts(nextAccounts)
      setTransactions([...nextTransactions].sort(sortByNewest))
      setShifts(nextShifts)
      setInvoices(nextInvoices)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات الإيرادات النقدية.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCashRevenueData()
  }, [])

  const revenueFund = useMemo(() => fundAccounts.find((account) => account.code === 'revenue') ?? null, [fundAccounts])
  const capitalFund = useMemo(() => fundAccounts.find((account) => account.code === 'capital') ?? null, [fundAccounts])
  const totalCashBalanceIqd = (revenueFund?.currentBalanceIqd ?? 0) + (capitalFund?.currentBalanceIqd ?? 0)
  const pendingShiftCashIqd = useMemo(() => {
    return shifts.reduce((sum, shift) => {
      if (shift.status !== 'open') {
        return sum
      }

      if (shift.closingSummary) {
        return sum + shift.closingSummary.expectedCashIqd
      }

      const shiftInvoices = invoices.filter((invoice) => invoice.shiftId === shift.id)
      const summary = buildShiftFinancialSummary(shift.openingFloatIqd, shiftInvoices)
      return sum + summary.expectedCashIqd
    }, 0)
  }, [invoices, shifts])
  const openShiftsCount = useMemo(() => shifts.filter((shift) => shift.status === 'open').length, [shifts])

  const contributorNames = useMemo(() => {
    return [...new Set(transactions.map((transaction) => transaction.counterpartyName?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'ar'))
  }, [transactions])

  const availableYears = useMemo(() => {
    return [...new Set(transactions.map((transaction) => getYearFromDate(transaction.movementDate)))].sort((left, right) => right.localeCompare(left))
  }, [transactions])

  const entryTransactions = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm)

    return transactions.filter((transaction) => {
      const movementType = getMovementTypeFromTransaction(transaction)

      if (entryTypeFilter !== 'all' && movementType !== entryTypeFilter) {
        return false
      }

      if (entriesYearFilter !== 'all' && getYearFromDate(transaction.movementDate) !== entriesYearFilter) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const haystack = normalizeText([
        transaction.movementNo,
        transaction.counterpartyName,
        transaction.notes,
        transaction.createdByEmployeeName,
      ].filter(Boolean).join(' '))

      return haystack.includes(normalizedSearch)
    })
  }, [entriesYearFilter, entryTypeFilter, searchTerm, transactions])

  const contributorSummaries = useMemo<ContributorSummary[]>(() => {
    const summaryMap = new Map<string, Omit<ContributorSummary, 'ownershipPercentage'>>()

    for (const transaction of transactions) {
      const contributorName = transaction.counterpartyName?.trim() || 'غير محدد'
      const entry = summaryMap.get(contributorName) ?? {
        contributorName,
        creditIqd: 0,
        debitIqd: 0,
        balanceIqd: 0,
      }
      const movementType = getMovementTypeFromTransaction(transaction)

      if (movementType === 'contribution') {
        entry.creditIqd += transaction.amountIqd
        entry.balanceIqd += transaction.amountIqd
      } else {
        entry.debitIqd += transaction.amountIqd
        entry.balanceIqd -= transaction.amountIqd
      }

      summaryMap.set(contributorName, entry)
    }

    const summaries = [...summaryMap.values()]
    const totalActiveCapitalIqd = summaries.reduce((sum, entry) => sum + Math.max(entry.balanceIqd, 0), 0)

    return summaries
      .map((entry) => ({
        ...entry,
        ownershipPercentage: totalActiveCapitalIqd > 0 && entry.balanceIqd > 0
          ? (entry.balanceIqd / totalActiveCapitalIqd) * 100
          : 0,
      }))
      .sort((left, right) => right.balanceIqd - left.balanceIqd || left.contributorName.localeCompare(right.contributorName, 'ar'))
  }, [transactions])

  const totalActiveCapitalIqd = useMemo(
    () => contributorSummaries.reduce((sum, summary) => sum + Math.max(summary.balanceIqd, 0), 0),
    [contributorSummaries],
  )
  const leadContributor = contributorSummaries[0] ?? null
  const withdrawalContributors = useMemo(
    () => contributorSummaries.filter((summary) => summary.balanceIqd > 0.01),
    [contributorSummaries],
  )
  const selectedWithdrawalContributor = useMemo(
    () => withdrawalContributors.find((summary) => summary.contributorName === repaymentForm.contributorName) ?? null,
    [repaymentForm.contributorName, withdrawalContributors],
  )
  const selectedWithdrawalLimitIqd = selectedWithdrawalContributor
    ? Math.min(selectedWithdrawalContributor.balanceIqd, totalCashBalanceIqd)
    : 0
  const repaymentAmountIqd = Number(repaymentForm.amountIqd || 0)
  const exceedsSelectedContributorBalance = Boolean(
    selectedWithdrawalContributor
    && repaymentForm.amountIqd
    && Number.isFinite(repaymentAmountIqd)
    && repaymentAmountIqd > selectedWithdrawalContributor.balanceIqd + 0.01,
  )
  const exceedsFinalCashBalance = Boolean(
    selectedWithdrawalContributor
    && repaymentForm.amountIqd
    && Number.isFinite(repaymentAmountIqd)
    && repaymentAmountIqd > totalCashBalanceIqd + 0.01,
  )
  const cannotWithdrawBecauseFinalCashEmpty = Boolean(selectedWithdrawalContributor && totalCashBalanceIqd <= 0.01)

  useEffect(() => {
    if (!withdrawalContributors.length) {
      setRepaymentForm((current) => current.contributorName ? { ...current, contributorName: '', sourceFundAccountId: '' } : current)
      return
    }

    setRepaymentForm((current) => {
      return {
        ...current,
        contributorName: current.contributorName && withdrawalContributors.some((entry) => entry.contributorName === current.contributorName)
          ? current.contributorName
          : withdrawalContributors[0].contributorName,
        sourceFundAccountId: '',
      }
    })
  }, [withdrawalContributors])

  const statementTransactions = useMemo(() => {
    return [...transactions]
      .filter((transaction) => {
        if (statementContributorFilter !== 'all' && transaction.counterpartyName !== statementContributorFilter) {
          return false
        }

        return true
      })
      .sort(sortByOldest)
  }, [statementContributorFilter, transactions])

  const statementOpeningBalanceIqd = useMemo(() => {
    if (statementYearFilter === 'all') {
      return 0
    }

    return statementTransactions.reduce((sum, transaction) => {
      if (getYearFromDate(transaction.movementDate) >= statementYearFilter) {
        return sum
      }

      return getMovementTypeFromTransaction(transaction) === 'contribution'
        ? sum + transaction.amountIqd
        : sum - transaction.amountIqd
    }, 0)
  }, [statementTransactions, statementYearFilter])

  const statementEntries = useMemo<StatementEntry[]>(() => {
    let runningBalanceIqd = statementOpeningBalanceIqd

    return statementTransactions
      .filter((transaction) => statementYearFilter === 'all' || getYearFromDate(transaction.movementDate) === statementYearFilter)
      .map((transaction) => {
        const type = getMovementTypeFromTransaction(transaction)
        const creditIqd = type === 'contribution' ? transaction.amountIqd : 0
        const debitIqd = type === 'repayment' ? transaction.amountIqd : 0

        runningBalanceIqd += creditIqd - debitIqd

        return {
          id: transaction.id,
          contributorName: transaction.counterpartyName ?? 'غير محدد',
          movementDate: transaction.movementDate,
          type,
          notes: transaction.notes,
          reference: transaction.movementNo,
          creditIqd,
          debitIqd,
          balanceIqd: runningBalanceIqd,
        }
      })
  }, [statementOpeningBalanceIqd, statementTransactions, statementYearFilter])

  const statementCreditTotalIqd = useMemo(() => statementEntries.reduce((sum, entry) => sum + entry.creditIqd, 0), [statementEntries])
  const statementDebitTotalIqd = useMemo(() => statementEntries.reduce((sum, entry) => sum + entry.debitIqd, 0), [statementEntries])
  const statementClosingBalanceIqd = statementEntries.length
    ? statementEntries[statementEntries.length - 1].balanceIqd
    : statementOpeningBalanceIqd

  const yearlySummaries = useMemo<YearlyCapitalSummary[]>(() => {
    const summaryMap = new Map<string, { contributionsIqd: number; repaymentsIqd: number }>()

    for (const transaction of [...transactions].sort(sortByOldest)) {
      const year = getYearFromDate(transaction.movementDate)
      const summary = summaryMap.get(year) ?? { contributionsIqd: 0, repaymentsIqd: 0 }

      if (getMovementTypeFromTransaction(transaction) === 'contribution') {
        summary.contributionsIqd += transaction.amountIqd
      } else {
        summary.repaymentsIqd += transaction.amountIqd
      }

      summaryMap.set(year, summary)
    }

    let runningClosingBalanceIqd = 0

    return [...summaryMap.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([year, summary]) => {
        const netChangeIqd = summary.contributionsIqd - summary.repaymentsIqd
        runningClosingBalanceIqd += netChangeIqd

        return {
          year,
          contributionsIqd: summary.contributionsIqd,
          repaymentsIqd: summary.repaymentsIqd,
          netChangeIqd,
          closingBalanceIqd: runningClosingBalanceIqd,
        }
      })
      .sort((left, right) => right.year.localeCompare(left.year))
  }, [transactions])

  async function submitForm(form: SimpleCapitalForm, movementType: 'contribution' | 'repayment', successMessage: string, reset: (value: SimpleCapitalForm) => void, setSaving: (value: boolean) => void) {
    if (movementType === 'repayment') {
      const selectedContributor = withdrawalContributors.find((summary) => summary.contributorName === form.contributorName) ?? null
      const requestedAmountIqd = Number(form.amountIqd || 0)

      if (!selectedContributor) {
        setMessage('اختر مساهماً محفوظاً من القائمة قبل تنفيذ السحب.')
        return
      }

      if (!Number.isFinite(requestedAmountIqd) || requestedAmountIqd <= 0) {
        setMessage('أدخل مبلغ سحب صالحاً أكبر من صفر.')
        return
      }

      if (requestedAmountIqd > selectedContributor.balanceIqd + 0.01) {
        setMessage(`لا يمكن سحب مبلغ أكبر من رصيد ${selectedContributor.contributorName} الحالي البالغ ${formatMoney(selectedContributor.balanceIqd, 'IQD')}.`)
        return
      }

      if (requestedAmountIqd > totalCashBalanceIqd + 0.01) {
        setMessage(`لا يمكن تنفيذ السحب لأن الرصيد النقدي النهائي الحالي هو ${formatMoney(totalCashBalanceIqd, 'IQD')} فقط.`)
        return
      }
    }

    setSaving(true)

    try {
      await createCapitalTransaction(toTypedPayload(form, movementType))
      reset({
        ...emptyForm(),
        movementDate: form.movementDate,
      })
      setMessage(successMessage)
      await loadCashRevenueData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ حركة رأس المال.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingTransactionId) {
      return
    }

    setIsSavingEdit(true)

    try {
      await updateCapitalTransaction(editingTransactionId, toPayload(editForm))
      setEditingTransactionId(null)
      setEditForm(emptyEditForm())
      setMessage('تم تعديل حركة رأس المال بنجاح.')
      await loadCashRevenueData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تعديل حركة رأس المال.'))
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleDeleteTransaction(transaction: CapitalTransaction) {
    if (!window.confirm(`سيتم حذف الحركة ${transaction.movementNo} نهائياً. هل تريد المتابعة؟`)) {
      return
    }

    setDeletingMovementId(transaction.id)

    try {
      await deleteCapitalTransaction(transaction.id)

      if (editingTransactionId === transaction.id) {
        setEditingTransactionId(null)
        setEditForm(emptyEditForm())
      }

      setMessage('تم حذف حركة رأس المال.')
      await loadCashRevenueData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف حركة رأس المال.'))
    } finally {
      setDeletingMovementId(null)
    }
  }

  function exportContributorSummary() {
    if (!contributorSummaries.length) {
      setMessage('لا توجد بيانات متاحة لتصدير ملخص المساهمين.')
      return
    }

    exportRowsToCsv({
      fileName: `capital-contributors-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['المساهم', 'إجمالي الإضافات', 'إجمالي السحوبات', 'الرصيد الحالي', 'نسبة الملكية الحالية'],
      rows: contributorSummaries.map((summary) => [
        summary.contributorName,
        summary.creditIqd,
        summary.debitIqd,
        summary.balanceIqd,
        formatPercentage(summary.ownershipPercentage),
      ]),
    })
  }

  function exportStatementCsv() {
    if (!statementEntries.length) {
      setMessage('لا توجد حركات في كشف الحساب الحالي لتصديرها.')
      return
    }

    const contributorLabel = statementContributorFilter === 'all' ? 'all-contributors' : statementContributorFilter
    const yearLabel = statementYearFilter === 'all' ? 'all-years' : statementYearFilter

    exportRowsToCsv({
      fileName: `capital-statement-${contributorLabel}-${yearLabel}.csv`,
      headers: ['المساهم', 'نوع الحركة', 'رقم الحركة', 'تاريخ الحركة', 'مدين', 'دائن', 'الرصيد الجاري', 'ملاحظات'],
      rows: statementEntries.map((entry) => [
        entry.contributorName,
        getMovementTypeLabel(entry.type),
        entry.reference,
        entry.movementDate,
        entry.debitIqd,
        entry.creditIqd,
        entry.balanceIqd,
        entry.notes ?? '',
      ]),
    })
  }

  function exportYearlySummaryCsv() {
    if (!yearlySummaries.length) {
      setMessage('لا توجد بيانات سنوية متاحة للتصدير.')
      return
    }

    exportRowsToCsv({
      fileName: `capital-yearly-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['السنة', 'إجمالي الإضافات', 'إجمالي السحوبات', 'صافي الحركة', 'الرصيد الختامي'],
      rows: yearlySummaries.map((summary) => [
        summary.year,
        summary.contributionsIqd,
        summary.repaymentsIqd,
        summary.netChangeIqd,
        summary.closingBalanceIqd,
      ]),
    })
  }

  function printStatement() {
    if (!statementEntries.length) {
      setMessage('لا توجد حركات في كشف الحساب الحالي للطباعة.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1180,height=820')

    if (!printWindow) {
      setMessage('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة للمتصفح.')
      return
    }

    const statementTitle = statementContributorFilter === 'all'
      ? 'كشف حساب جميع المساهمين'
      : `كشف حساب المساهم ${statementContributorFilter}`
    const yearLabel = statementYearFilter === 'all' ? 'كل السنوات' : statementYearFilter
    const rows = statementEntries.map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.contributorName)}</td>
        <td>${escapeHtml(getMovementTypeLabel(entry.type))}</td>
        <td>${escapeHtml(entry.reference)}</td>
        <td>${escapeHtml(entry.movementDate)}</td>
        <td>${escapeHtml(formatMoney(entry.debitIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(entry.creditIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(entry.balanceIqd, 'IQD'))}</td>
        <td>${escapeHtml(entry.notes ?? '-')}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>${escapeHtml(statementTitle)}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #1c1917; }
            h1, h2, p { margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
            .title { font-size: 28px; font-weight: 700; }
            .meta { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 10px 16px; margin: 18px 0 24px; }
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
              <p class="title">${escapeHtml(statementTitle)}</p>
              <p style="margin-top: 8px; color: #57534e;">السنة: ${escapeHtml(yearLabel)}</p>
              <p style="margin-top: 4px; color: #57534e;">تاريخ الطباعة: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
            </div>
            <div style="text-align:left;">
              <p style="font-size: 13px; color: #57534e; font-weight: 700;">الرصيد الختامي</p>
              <p style="margin-top: 8px; font-size: 24px; font-weight: 800;">${escapeHtml(formatMoney(statementClosingBalanceIqd, 'IQD'))}</p>
            </div>
          </div>

          <div class="meta">
            <div><div class="label">الرصيد الافتتاحي</div><div class="value">${escapeHtml(formatMoney(statementOpeningBalanceIqd, 'IQD'))}</div></div>
            <div><div class="label">إجمالي الدائن</div><div class="value">${escapeHtml(formatMoney(statementCreditTotalIqd, 'IQD'))}</div></div>
            <div><div class="label">إجمالي المدين</div><div class="value">${escapeHtml(formatMoney(statementDebitTotalIqd, 'IQD'))}</div></div>
            <div><div class="label">عدد الحركات</div><div class="value">${statementEntries.length}</div></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>المساهم</th>
                <th>نوع الحركة</th>
                <th>رقم الحركة</th>
                <th>التاريخ</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد الجاري</th>
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-emerald-700">CASH REVENUES</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">الايرادات النقدية وحركة رأس المال</h1>
              <p className="mt-2 max-w-3xl text-sm text-stone-600">
                هذه الصفحة تفصل بين صندوق الإيرادات التشغيلي وصندوق رأس المال، وتدير مساهمات المالكين والسحوبات الخاصة بهم مع كشف حساب واضح لكل مساهم عبر السنوات.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadCashRevenueData()}
                type="button"
              >
                تحديث البيانات
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/expenses">
                المصروفات
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500 hover:text-stone-950" to="/">
                الرئيسية
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,rgba(217,119,6,0.10),rgba(255,255,255,0.92))] p-5 shadow-[0_12px_40px_rgba(217,119,6,0.10)]">
          <p className="text-sm font-black tracking-[0.2em] text-amber-700">OWNERSHIP NOTE</p>
          <h2 className="mt-2 font-display text-2xl font-black text-stone-950">قاعدة الملكية الحالية</h2>
          <p className="mt-2 text-sm leading-7 text-stone-700">
            أول وأي إدخالات لاحقة إلى رأس المال تمثل المساهمة الحقيقية لكل مالك داخل المشروع. توزيع الأرباح سيأتي لاحقاً في صندوق مستقل، أما هنا فالحساب الحالي يركز فقط على أصل رأس المال وما تم سحبه منه لصالح كل مساهم.
          </p>
          <p className="mt-2 text-xs font-bold text-stone-500">
            المستخدم الحالي: {session?.employee.name ?? 'غير معروف'}
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[30px] border border-emerald-200 bg-[linear-gradient(180deg,#ecfdf5_0%,#ffffff_100%)] p-6 shadow-[0_24px_80px_rgba(16,185,129,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">REVENUE FUND</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(revenueFund?.currentBalanceIqd ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">سيولة المبيعات والتحصيلات النقدية اليومية الجاهزة لتغطية المصروفات أو سداد أصل رأس المال.</p>
          </article>

          <article className="rounded-[30px] border border-orange-200 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] p-6 shadow-[0_24px_80px_rgba(249,115,22,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-orange-700">OPEN SHIFT CASH</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(pendingShiftCashIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">نقدية ما زالت داخل {openShiftsCount} وردية مفتوحة ولم تُورَّد بعد إلى صندوق الإيرادات.</p>
          </article>

          <article className="rounded-[30px] border border-amber-200 bg-[linear-gradient(180deg,#fffbeb_0%,#ffffff_100%)] p-6 shadow-[0_24px_80px_rgba(217,119,6,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">CAPITAL FUND</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(capitalFund?.currentBalanceIqd ?? 0, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي الأموال التي دخلت كرأس مال فعلي من المساهمين ولم تتحول بعد إلى أرباح موزعة.</p>
          </article>

          <article className="rounded-[30px] border border-sky-200 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)] p-6 shadow-[0_24px_80px_rgba(14,165,233,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-sky-700">FINAL CASH</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(totalCashBalanceIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">الرصيد النقدي النهائي = صندوق الإيرادات + صندوق رأس المال.</p>
          </article>
        </section>

        <section className="mt-4 rounded-[26px] border border-orange-200 bg-orange-50/80 p-4 text-sm text-orange-900 shadow-[0_12px_30px_rgba(249,115,22,0.08)]">
          لا تنتقل المبالغ النقدية التي يستلمها الكاشير أثناء الوردية, سواء من فواتير الكاش أو من تسديدات العملاء الآجلة, إلى صندوق الإيرادات بمجرد تسجيلها. تظهر هنا بعد توريد نقدية الوردية عند الإغلاق، لذلك قد تراها مؤقتًا ضمن OPEN SHIFT CASH وليس ضمن REVENUE FUND.
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-[28px] border border-teal-200 bg-[linear-gradient(180deg,#f0fdfa_0%,#ffffff_100%)] p-5 shadow-[0_20px_70px_rgba(13,148,136,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">ACTIVE CAPITAL</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(totalActiveCapitalIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي رأس المال القائم بعد خصم السحوبات من أرصدة المساهمين.</p>
          </article>

          <article className="rounded-[28px] border border-cyan-200 bg-[linear-gradient(180deg,#ecfeff_0%,#ffffff_100%)] p-5 shadow-[0_20px_70px_rgba(8,145,178,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-cyan-700">LEAD OWNER</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{leadContributor?.contributorName ?? 'لا يوجد'}</p>
            <p className="mt-2 text-sm text-stone-600">أعلى مساهم حالي وفق صافي رأس المال القائم.</p>
          </article>

          <article className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,#fffbeb_0%,#ffffff_100%)] p-5 shadow-[0_20px_70px_rgba(217,119,6,0.10)]">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">LEAD SHARE</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatPercentage(leadContributor?.ownershipPercentage ?? 0)}</p>
            <p className="mt-2 text-sm text-stone-600">النسبة الحالية من رأس المال القائم لصاحب أعلى مساهمة.</p>
          </article>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" />

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-[32px] border border-emerald-200 bg-white/86 p-6 shadow-[0_24px_80px_rgba(16,185,129,0.08)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-emerald-700">CAPITAL FLOW</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">إضافة مساهمة رأس مال</h2>
              <p className="mt-2 text-sm text-stone-600">تستخدم لإثبات إدخال نقدي جديد من المالك أو الشريك إلى صندوق رأس المال.</p>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitForm(contributionForm, 'contribution', 'تمت إضافة مساهمة رأس المال.', setContributionForm, setIsSavingContribution)
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  تاريخ الحركة
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-emerald-500"
                    type="date"
                    value={contributionForm.movementDate}
                    onChange={(event) => setContributionForm((current) => ({ ...current, movementDate: event.target.value }))}
                  />
                </label>

                <label className="block text-sm font-black text-stone-800">
                  اسم المساهم
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-emerald-500"
                    value={contributionForm.contributorName}
                    onChange={(event) => setContributionForm((current) => ({ ...current, contributorName: event.target.value }))}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  المبلغ بالدينار
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-emerald-500"
                    inputMode="decimal"
                    placeholder="مثال: 500000"
                    value={contributionForm.amountIqd}
                    onChange={(event) => setContributionForm((current) => ({ ...current, amountIqd: event.target.value.replace(/[^\d.]/g, '') }))}
                  />
                </label>

                <label className="block text-sm font-black text-stone-800">
                  ملاحظات
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-emerald-500"
                    value={contributionForm.notes}
                    onChange={(event) => setContributionForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              </div>

              <button
                className="rounded-2xl bg-emerald-700 px-5 py-3 text-base font-black text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={isSavingContribution || !contributionForm.contributorName.trim() || !contributionForm.amountIqd}
                type="submit"
              >
                {isSavingContribution ? 'جارٍ الحفظ...' : 'حفظ مساهمة رأس المال'}
              </button>
            </form>
          </section>

          <section className="rounded-[32px] border border-rose-200 bg-white/86 p-6 shadow-[0_24px_80px_rgba(244,63,94,0.08)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">WITHDRAWAL</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">سحب مساهم من FINAL CASH</h2>
              <p className="mt-2 text-sm text-stone-600">يسجل السحب من الرصيد النقدي النهائي مباشرة، حتى لو كان المبلغ موزعاً بين صندوق الإيرادات وصندوق رأس المال، مع الحفاظ على رصيد المساهم الصافي.</p>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitForm(repaymentForm, 'repayment', 'تم تسجيل سحب المساهم من FINAL CASH.', setRepaymentForm, setIsSavingRepayment)
              }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  تاريخ الحركة
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-rose-500"
                    type="date"
                    value={repaymentForm.movementDate}
                    onChange={(event) => setRepaymentForm((current) => ({ ...current, movementDate: event.target.value }))}
                  />
                </label>

                <label className="block text-sm font-black text-stone-800">
                  اسم المساهم
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-rose-500"
                    value={repaymentForm.contributorName}
                    onChange={(event) => setRepaymentForm((current) => ({ ...current, contributorName: event.target.value }))}
                  >
                    {!withdrawalContributors.length ? <option value="">لا يوجد مساهم محفوظ بعد</option> : null}
                    {withdrawalContributors.map((summary) => (
                      <option key={summary.contributorName} value={summary.contributorName}>
                        {summary.contributorName} - {formatMoney(summary.balanceIqd, 'IQD')}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs font-bold text-stone-500">تظهر هنا أسماء المساهمين المحفوظين فقط مع رصيد كل مساهم القابل للسحب.</p>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  المبلغ بالدينار
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-rose-500"
                    inputMode="decimal"
                    placeholder="مثال: 100000"
                    value={repaymentForm.amountIqd}
                    onChange={(event) => {
                      const rawValue = event.target.value.replace(/[^\d.]/g, '')

                      if (!selectedWithdrawalContributor) {
                        setRepaymentForm((current) => ({ ...current, amountIqd: rawValue }))
                        return
                      }

                      const nextAmountIqd = Number(rawValue || 0)

                      if (!rawValue || !Number.isFinite(nextAmountIqd)) {
                        setRepaymentForm((current) => ({ ...current, amountIqd: rawValue }))
                        return
                      }

                      setRepaymentForm((current) => ({
                        ...current,
                        amountIqd: String(Math.min(nextAmountIqd, selectedWithdrawalLimitIqd)),
                      }))
                    }}
                  />
                  <p className="mt-2 text-xs font-bold text-stone-500">
                    الحد الأقصى المسموح حالياً من FINAL CASH: {formatMoney(selectedWithdrawalLimitIqd, 'IQD')}
                  </p>
                  {exceedsSelectedContributorBalance ? <p className="mt-2 text-xs font-black text-rose-700">المبلغ المطلوب يتجاوز رصيد المساهم المختار.</p> : null}
                  {exceedsFinalCashBalance ? <p className="mt-2 text-xs font-black text-rose-700">المبلغ المطلوب يتجاوز الرصيد النقدي النهائي المتاح حالياً.</p> : null}
                  {cannotWithdrawBecauseFinalCashEmpty ? <p className="mt-2 text-xs font-black text-amber-700">لا يمكن السحب حالياً لأن FINAL CASH لا يحتوي على رصيد نقدي متاح.</p> : null}
                </label>

                <label className="block text-sm font-black text-stone-800">
                  ملاحظات
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-rose-500"
                    value={repaymentForm.notes}
                    onChange={(event) => setRepaymentForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              </div>

              <button
                className="rounded-2xl bg-rose-700 px-5 py-3 text-base font-black text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={isSavingRepayment || !repaymentForm.contributorName.trim() || !repaymentForm.amountIqd || !withdrawalContributors.length || exceedsSelectedContributorBalance || exceedsFinalCashBalance || cannotWithdrawBecauseFinalCashEmpty}
                type="submit"
              >
                {isSavingRepayment ? 'جارٍ الحفظ...' : 'حفظ سحب المساهم'}
              </button>
            </form>
          </section>
        </section>

        <datalist id="capital-contributors">
          {contributorNames.map((name) => <option key={name} value={name} />)}
        </datalist>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-sky-700">ENTRIES</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">السجل القابل للبحث والتصفية</h2>
                <p className="mt-2 text-sm text-stone-600">يمكنك البحث باسم المساهم أو رقم الحركة أو الملاحظات، ثم تعديل أو حذف أي حركة رأس مال.</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{entryTransactions.length} حركة</span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="block text-sm font-black text-stone-800">
                بحث
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                  placeholder="اسم المساهم أو رقم الحركة"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <label className="block text-sm font-black text-stone-800">
                نوع الحركة
                <select
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                  value={entryTypeFilter}
                  onChange={(event) => setEntryTypeFilter(event.target.value as EntryTypeFilter)}
                >
                  <option value="all">الكل</option>
                  <option value="contribution">إضافة رأس مال</option>
                  <option value="repayment">سحب من FINAL CASH</option>
                </select>
              </label>

              <label className="block text-sm font-black text-stone-800">
                السنة
                <select
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                  value={entriesYearFilter}
                  onChange={(event) => setEntriesYearFilter(event.target.value)}
                >
                  <option value="all">كل السنوات</option>
                  {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>

            {editingTransactionId ? (
              <form className="mt-5 rounded-[26px] border border-sky-200 bg-sky-50/70 p-5" onSubmit={handleSaveEdit}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-black tracking-[0.2em] text-sky-700">EDITING</p>
                    <h3 className="mt-2 font-display text-2xl font-black text-stone-950">تعديل حركة رأس المال</h3>
                  </div>
                  <button
                    className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                    onClick={() => {
                      setEditingTransactionId(null)
                      setEditForm(emptyEditForm())
                    }}
                    type="button"
                  >
                    إلغاء التعديل
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="block text-sm font-black text-stone-800">
                    تاريخ الحركة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                      type="date"
                      value={editForm.movementDate}
                      onChange={(event) => setEditForm((current) => ({ ...current, movementDate: event.target.value }))}
                    />
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    نوع الحركة
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                      value={editForm.movementType}
                      onChange={(event) => setEditForm((current) => ({ ...current, movementType: event.target.value as 'contribution' | 'repayment' }))}
                    >
                      <option value="contribution">إضافة رأس مال</option>
                      <option value="repayment">سحب من FINAL CASH</option>
                    </select>
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    اسم المساهم
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                      list="capital-contributors"
                      value={editForm.contributorName}
                      onChange={(event) => setEditForm((current) => ({ ...current, contributorName: event.target.value }))}
                    />
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    المبلغ بالدينار
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-sky-500"
                      inputMode="decimal"
                      value={editForm.amountIqd}
                      onChange={(event) => setEditForm((current) => ({ ...current, amountIqd: event.target.value.replace(/[^\d.]/g, '') }))}
                    />
                  </label>
                </div>

                <label className="mt-4 block text-sm font-black text-stone-800">
                  ملاحظات
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-stone-900 outline-none focus:border-sky-500"
                    value={editForm.notes}
                    onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <button
                  className="mt-4 rounded-2xl bg-sky-700 px-5 py-3 text-base font-black text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-stone-400"
                  disabled={isSavingEdit || !editForm.contributorName.trim() || !editForm.amountIqd}
                  type="submit"
                >
                  {isSavingEdit ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
                </button>
              </form>
            ) : null}

            <div className="mt-5 space-y-3">
              {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل الحركات...</div> : null}
              {!isLoading && !entryTransactions.length ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد حركات مطابقة للمرشحات الحالية.</div> : null}
              {!isLoading ? entryTransactions.map((transaction) => {
                const type = getMovementTypeFromTransaction(transaction)

                return (
                  <article key={transaction.id} className="rounded-[24px] border border-stone-200 bg-stone-50/90 px-5 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-2xl font-black text-stone-950">{transaction.movementNo}</p>
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${getMovementTypeAccent(type)}`}>{getMovementTypeLabel(type)}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-stone-800">{transaction.counterpartyName || 'غير محدد'}</p>
                        <p className="mt-1 text-sm text-stone-600">تاريخ الحركة: {transaction.movementDate}</p>
                        <p className="mt-1 text-xs font-bold text-stone-500">سجل بواسطة {transaction.createdByEmployeeName || 'النظام'} في {formatDateTime(transaction.createdAt)}</p>
                      </div>
                      <div className="text-left">
                        <p className={`font-display text-3xl font-black ${type === 'contribution' ? 'text-emerald-700' : 'text-rose-700'}`}>{formatMoney(transaction.amountIqd, 'IQD')}</p>
                        <p className="mt-1 text-xs font-bold text-stone-500">
                          {type === 'contribution'
                            ? `إلى ${transaction.destinationFundAccountName || 'صندوق رأس المال'}`
                            : `من ${transaction.sourceFundAccountName || 'FINAL CASH'}`}
                        </p>
                      </div>
                    </div>

                    {transaction.notes ? <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-stone-700">{transaction.notes}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-black text-sky-700 transition hover:border-sky-500"
                        onClick={() => {
                          setEditingTransactionId(transaction.id)
                          setEditForm(buildEditForm(transaction))
                        }}
                        type="button"
                      >
                        تعديل
                      </button>
                      <button
                        className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:text-stone-400"
                        disabled={deletingMovementId === transaction.id}
                        onClick={() => void handleDeleteTransaction(transaction)}
                        type="button"
                      >
                        {deletingMovementId === transaction.id ? 'جارٍ الحذف...' : 'حذف'}
                      </button>
                    </div>
                  </article>
                )
              }) : null}
            </div>
          </section>

          <section className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-violet-700">YEARLY VIEW</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الملخص السنوي لرأس المال</h2>
                  <p className="mt-2 text-sm text-stone-600">يوضح مجموع الإضافات والسحوبات وصافي التغير والرصد الختامي لكل سنة.</p>
                </div>
                <button
                  className="rounded-full border border-violet-300 bg-white px-4 py-2 text-sm font-black text-violet-700 transition hover:border-violet-500"
                  onClick={exportYearlySummaryCsv}
                  type="button"
                >
                  تصدير الملخص السنوي CSV
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {!yearlySummaries.length ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد بيانات سنوية متاحة بعد.</div> : yearlySummaries.map((summary) => (
                  <article key={summary.year} className="rounded-[24px] border border-stone-200 bg-stone-50/90 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-display text-2xl font-black text-stone-950">{summary.year}</p>
                        <p className="mt-1 text-sm text-stone-600">إضافات {formatMoney(summary.contributionsIqd, 'IQD')} • سحوبات {formatMoney(summary.repaymentsIqd, 'IQD')}</p>
                      </div>
                      <div className="grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-emerald-700">صافي الحركة</p>
                          <p className={`mt-1 font-display text-xl font-black ${summary.netChangeIqd >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatMoney(summary.netChangeIqd, 'IQD')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-teal-700">الرصيد الختامي</p>
                          <p className="mt-1 font-display text-xl font-black text-stone-950">{formatMoney(summary.closingBalanceIqd, 'IQD')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-violet-700">مستوى الملكية</p>
                          <p className="mt-1 text-sm font-black text-stone-700">سنة مرجعية للحصص الرأسمالية</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-amber-700">CONTRIBUTORS</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-stone-950">رصيد كل مساهم</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-black text-amber-700 transition hover:border-amber-500"
                    onClick={exportContributorSummary}
                    type="button"
                  >
                    تصدير الملخص CSV
                  </button>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{contributorSummaries.length} مساهم</span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {!contributorSummaries.length ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد مساهمات مسجلة بعد.</div> : contributorSummaries.map((summary) => (
                  <article key={summary.contributorName} className="rounded-[24px] border border-stone-200 bg-stone-50/90 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black text-stone-950">{summary.contributorName}</p>
                        <p className="mt-1 text-xs font-bold text-stone-500">إجمالي الإضافات {formatMoney(summary.creditIqd, 'IQD')} • إجمالي السحوبات {formatMoney(summary.debitIqd, 'IQD')}</p>
                        <p className="mt-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800">نسبة الملكية الحالية {formatPercentage(summary.ownershipPercentage)}</p>
                      </div>
                      <p className={`font-display text-2xl font-black ${summary.balanceIqd >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatMoney(summary.balanceIqd, 'IQD')}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-teal-700">STATEMENT</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">كشف حساب المساهمين</h2>
                <p className="mt-2 text-sm text-stone-600">يمكن عرض كل السنوات أو سنة محددة، لكل المساهمين معاً أو لمساهم واحد فقط، مع إظهار المدين والدائن والرصيد الجاري.</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-teal-300 bg-white px-4 py-2 text-sm font-black text-teal-700 transition hover:border-teal-500"
                  onClick={exportStatementCsv}
                  type="button"
                >
                  تصدير الكشف CSV
                </button>
                <button
                  className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-black text-sky-700 transition hover:border-sky-500"
                  onClick={printStatement}
                  type="button"
                >
                  طباعة كشف الحساب
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  المساهم
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                    value={statementContributorFilter}
                    onChange={(event) => setStatementContributorFilter(event.target.value)}
                  >
                    <option value="all">كل المساهمين</option>
                    {contributorNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>

                <label className="block text-sm font-black text-stone-800">
                  السنة
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                    value={statementYearFilter}
                    onChange={(event) => setStatementYearFilter(event.target.value)}
                  >
                    <option value="all">كل السنوات</option>
                    {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                  <p className="text-xs font-black tracking-[0.18em] text-emerald-700">CREDIT</p>
                  <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(statementCreditTotalIqd, 'IQD')}</p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-4">
                  <p className="text-xs font-black tracking-[0.18em] text-rose-700">DEBIT</p>
                  <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(statementDebitTotalIqd, 'IQD')}</p>
                </div>
                <div className="rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-4">
                  <p className="text-xs font-black tracking-[0.18em] text-teal-700">BALANCE</p>
                  <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(statementClosingBalanceIqd, 'IQD')}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/90 px-4 py-3 text-sm text-stone-700">
                الرصيد الافتتاحي للفترة المختارة: <span className="font-black text-stone-950">{formatMoney(statementOpeningBalanceIqd, 'IQD')}</span>
              </div>

              <div className="mt-5 space-y-3">
                {!statementEntries.length ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد حركات في كشف الحساب الحالي.</div> : statementEntries.map((entry) => (
                  <article key={entry.id} className="rounded-[24px] border border-stone-200 bg-stone-50/90 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black ${getMovementTypeAccent(entry.type)}`}>{getMovementTypeLabel(entry.type)}</span>
                          <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-black text-stone-700">{entry.contributorName}</span>
                        </div>
                        <p className="mt-2 text-sm font-bold text-stone-800">{entry.reference}</p>
                        <p className="mt-1 text-sm text-stone-600">{entry.movementDate}</p>
                        {entry.notes ? <p className="mt-2 text-sm leading-7 text-stone-600">{entry.notes}</p> : null}
                      </div>
                      <div className="grid min-w-[14rem] gap-2 text-left sm:grid-cols-3 lg:min-w-[18rem]">
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-emerald-700">دائن</p>
                          <p className="mt-1 font-display text-xl font-black text-stone-950">{formatMoney(entry.creditIqd, 'IQD')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-rose-700">مدين</p>
                          <p className="mt-1 font-display text-xl font-black text-stone-950">{formatMoney(entry.debitIqd, 'IQD')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black tracking-[0.16em] text-teal-700">الرصيد</p>
                          <p className="mt-1 font-display text-xl font-black text-stone-950">{formatMoney(entry.balanceIqd, 'IQD')}</p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </section>
      </div>
    </main>
  )
}