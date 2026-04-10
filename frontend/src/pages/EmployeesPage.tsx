import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { useEmployeeSession } from '../lib/auth'
import { formatMoney } from '../lib/currency'
import { printEmployeePayrollLedger } from '../lib/employee-payroll-ledger'
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../lib/number-input'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  createEmployee,
  createEmployeeAbsence,
  createEmployeeCompensation,
  deleteEmployeeAbsence,
  fetchCumulativePayroll,
  fetchEmployeeAbsences,
  fetchEmployeeCompensations,
  fetchEmployees,
  fetchMonthlyPayroll,
  resetEmployeePin,
  settleMonthlyPayroll,
  updateEmployeeAbsence,
  updateEmployee,
  updateEmployeeStatus,
  type Employee,
  type EmployeeAbsence,
  type EmployeeCompensation,
  type EmployeeCompensationKind,
  type EmployeeCompensationPaymentMethod,
  type EmployeeCumulativePayrollSummary,
  type EmployeeEmploymentStatus,
  type EmployeeRole,
  type MonthlyPayrollSummary,
} from '../lib/employees-api'

const emptyEmployeeForm = {
  name: '',
  role: 'cashier' as EmployeeRole,
  startDate: '',
  monthlySalaryIqd: '',
  employmentStatus: 'active' as EmployeeEmploymentStatus,
  serviceEndDate: '',
  notes: '',
  pin: '',
  newPin: '',
}

const emptyCompensationForm = {
  kind: 'bonus' as EmployeeCompensationKind,
  amountIqd: '',
  paymentMethod: 'cash' as EmployeeCompensationPaymentMethod,
  paymentDate: new Date().toISOString().slice(0, 10),
  periodLabel: new Date().toISOString().slice(0, 7),
  notes: '',
}

const emptyAbsenceForm = {
  absenceDate: new Date().toISOString().slice(0, 10),
  deductionDays: '1',
  notes: '',
}

const currentMonthKey = new Date().toISOString().slice(0, 7)

function getMonthDateValue(monthKey: string) {
  return `${monthKey}-01`
}

function getMonthKeyFromDate(value: string) {
  return value.slice(0, 7)
}

const emptySettlementForm = {
  month: currentMonthKey,
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'cash' as EmployeeCompensationPaymentMethod,
}

const emptyAbsenceFilterMonth = currentMonthKey

const protectedAdminUsername = 'admin'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function getRoleLabel(role: EmployeeRole) {
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

function getEmploymentStatusLabel(status: EmployeeEmploymentStatus) {
  if (status === 'suspended') {
    return 'متوقف'
  }

  if (status === 'terminated') {
    return 'منتهي خدمة'
  }

  return 'على رأس العمل'
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
    return 'خصم يدوي'
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

function parsePositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isProtectedAdmin(employee: Pick<Employee, 'role' | 'username'>) {
  return employee.role === 'admin' && employee.username === protectedAdminUsername
}

function compensationRequiresPaymentMethod(kind: EmployeeCompensationKind) {
  return kind === 'payment' || kind === 'advance'
}

function getEmployeeBalance(compensations: EmployeeCompensation[]) {
  return compensations.reduce((total, entry) => {
    if (entry.kind === 'salary' || entry.kind === 'bonus') {
      return total + entry.amountIqd
    }

    return total - entry.amountIqd
  }, 0)
}

export function EmployeesPage() {
  const { session } = useEmployeeSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeCompensations, setEmployeeCompensations] = useState<EmployeeCompensation[]>([])
  const [employeeAbsences, setEmployeeAbsences] = useState<EmployeeAbsence[]>([])
  const [monthlyPayroll, setMonthlyPayroll] = useState<MonthlyPayrollSummary[]>([])
  const [cumulativePayroll, setCumulativePayroll] = useState<EmployeeCumulativePayrollSummary[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm)
  const [compensationForm, setCompensationForm] = useState(emptyCompensationForm)
  const [absenceForm, setAbsenceForm] = useState(emptyAbsenceForm)
  const [settlementForm, setSettlementForm] = useState(emptySettlementForm)
  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null)
  const [absenceFilterMonth, setAbsenceFilterMonth] = useState(emptyAbsenceFilterMonth)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingEmployee, setIsSavingEmployee] = useState(false)
  const [isSavingCompensation, setIsSavingCompensation] = useState(false)
  const [isSavingAbsence, setIsSavingAbsence] = useState(false)
  const [isSettling, setIsSettling] = useState(false)

  async function loadEmployeesData() {
    setIsLoading(true)

    try {
      const data = await fetchEmployees()
      setEmployees(data)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل الموظفين.'))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadSelectedEmployeeData(employeeId: string) {
    try {
      const [compensations, absences] = await Promise.all([
        fetchEmployeeCompensations(employeeId),
        fetchEmployeeAbsences(employeeId),
      ])

      setEmployeeCompensations(compensations)
      setEmployeeAbsences(absences)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات الموظف المحدد.'))
      setEmployeeCompensations([])
      setEmployeeAbsences([])
    }
  }

  async function loadMonthlyPayrollData(month: string) {
    try {
      const data = await fetchMonthlyPayroll(month)
      setMonthlyPayroll(data)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل ملخص الرواتب الشهري.'))
      setMonthlyPayroll([])
    }
  }

  async function loadCumulativePayrollData(month: string) {
    try {
      const data = await fetchCumulativePayroll(month)
      setCumulativePayroll(data)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل الملخص التراكمي للرواتب.'))
      setCumulativePayroll([])
    }
  }

  useEffect(() => {
    void loadEmployeesData()
  }, [])

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId(null)
      return
    }

    if (!selectedEmployeeId || !employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(employees[0].id)
    }
  }, [employees, selectedEmployeeId])

  useEffect(() => {
    if (!selectedEmployeeId) {
      setEmployeeCompensations([])
      setEmployeeAbsences([])
      return
    }

    void loadSelectedEmployeeData(selectedEmployeeId)
  }, [selectedEmployeeId])

  useEffect(() => {
    void loadMonthlyPayrollData(settlementForm.month)
  }, [settlementForm.month])

  useEffect(() => {
    void loadCumulativePayrollData(settlementForm.month)
  }, [settlementForm.month])

  const editingEmployee = editingEmployeeId ? employees.find((employee) => employee.id === editingEmployeeId) ?? null : null
  const selectedEmployee = selectedEmployeeId ? employees.find((employee) => employee.id === selectedEmployeeId) ?? null : null
  const canManageEmployeeAccounts = session?.employee.role === 'admin'
  const activeEmployees = employees.filter((employee) => employee.isActive)
  const totalMonthlySalaries = employees.reduce((sum, employee) => sum + (employee.monthlySalaryIqd ?? 0), 0)
  const selectedEmployeeBalance = useMemo(() => getEmployeeBalance(employeeCompensations), [employeeCompensations])
  const selectedEmployeeMonthSummary = useMemo(
    () => monthlyPayroll.find((entry) => entry.employeeId === selectedEmployeeId) ?? null,
    [monthlyPayroll, selectedEmployeeId],
  )
  const filteredEmployeeAbsences = useMemo(
    () => employeeAbsences.filter((absence) => absence.absenceDate.startsWith(absenceFilterMonth)),
    [employeeAbsences, absenceFilterMonth],
  )
  const payableTotal = useMemo(
    () => monthlyPayroll.reduce((sum, entry) => sum + entry.remainingPayableIqd, 0),
    [monthlyPayroll],
  )
  const cumulativePayrollByEmployeeId = useMemo(
    () => new Map(cumulativePayroll.map((entry) => [entry.employeeId, entry] as const)),
    [cumulativePayroll],
  )
  const selectedEmployeeCumulativeSummary = selectedEmployeeId ? cumulativePayrollByEmployeeId.get(selectedEmployeeId) ?? null : null

  function resetEmployeeForm() {
    setEditingEmployeeId(null)
    setEmployeeForm(emptyEmployeeForm)
  }

  function resetAbsenceForm() {
    setEditingAbsenceId(null)
    setAbsenceForm(emptyAbsenceForm)
  }

  function startEditing(employee: Employee) {
    setEditingEmployeeId(employee.id)
    setEmployeeForm({
      name: employee.name,
      role: employee.role,
      startDate: employee.startDate ?? '',
      monthlySalaryIqd: employee.monthlySalaryIqd ? String(employee.monthlySalaryIqd) : '',
      employmentStatus: employee.employmentStatus,
      serviceEndDate: employee.serviceEndDate ?? '',
      notes: employee.notes ?? '',
      pin: '',
      newPin: '',
    })
  }

  async function handleEmployeeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canManageEmployeeAccounts) {
      setMessage('إدارة حسابات الموظفين متاحة للمدير فقط.')
      return
    }

    if (!editingEmployeeId) {
      const normalizedPin = sanitizeIntegerInput(employeeForm.pin)

      if (normalizedPin.length < 4 || normalizedPin.length > 8) {
        setMessage('PIN الموظف يجب أن يتكون من 4 إلى 8 أرقام، ويمكن إدخال الأرقام العربية أو الإنجليزية.')
        return
      }
    }

    setIsSavingEmployee(true)

    try {
      const payload = {
        name: employeeForm.name,
        role: employeeForm.role,
        startDate: employeeForm.startDate || undefined,
        monthlySalaryIqd: parsePositiveNumber(employeeForm.monthlySalaryIqd) || undefined,
        employmentStatus: employeeForm.employmentStatus,
        serviceEndDate: employeeForm.serviceEndDate || undefined,
        notes: employeeForm.notes || undefined,
      }

      if (editingEmployeeId) {
        await updateEmployee(editingEmployeeId, payload)

        if (employeeForm.newPin.trim()) {
          await resetEmployeePin(editingEmployeeId, sanitizeIntegerInput(employeeForm.newPin.trim()))
        }

        setMessage('تم تحديث ملف الموظف.')
      } else {
        await createEmployee({
          ...payload,
          pin: sanitizeIntegerInput(employeeForm.pin),
        })
        setMessage('تم إنشاء الموظف بنجاح.')
      }

      resetEmployeeForm()
      await loadEmployeesData()
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ بيانات الموظف.'))
    } finally {
      setIsSavingEmployee(false)
    }
  }

  async function handleCompensationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedEmployeeId) {
      setMessage('اختر موظفاً أولاً.')
      return
    }

    setIsSavingCompensation(true)

    try {
      await createEmployeeCompensation(selectedEmployeeId, {
        kind: compensationForm.kind,
        amountIqd: parsePositiveNumber(compensationForm.amountIqd),
        paymentMethod: compensationRequiresPaymentMethod(compensationForm.kind) ? compensationForm.paymentMethod : undefined,
        paymentDate: compensationForm.paymentDate,
        periodLabel: compensationForm.periodLabel || undefined,
        notes: compensationForm.notes || undefined,
      })

      setCompensationForm((current) => ({
        ...current,
        amountIqd: '',
        notes: '',
      }))
      setMessage('تم تسجيل القيد الفردي.')
      await loadSelectedEmployeeData(selectedEmployeeId)
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تسجيل القيد.'))
    } finally {
      setIsSavingCompensation(false)
    }
  }

  async function handleAbsenceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedEmployeeId) {
      setMessage('اختر موظفاً أولاً.')
      return
    }

    setIsSavingAbsence(true)

    try {
      const payload = {
        absenceDate: absenceForm.absenceDate,
        deductionDays: parsePositiveNumber(absenceForm.deductionDays),
        notes: absenceForm.notes || undefined,
      }

      if (editingAbsenceId) {
        await updateEmployeeAbsence(selectedEmployeeId, editingAbsenceId, payload)
        setMessage('تم تعديل سجل الغياب.')
      } else {
        await createEmployeeAbsence(selectedEmployeeId, payload)
        setMessage('تم تسجيل الغياب وربطه باحتساب الشهر.')
      }

      resetAbsenceForm()
      await loadSelectedEmployeeData(selectedEmployeeId)
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تسجيل الغياب.'))
    } finally {
      setIsSavingAbsence(false)
    }
  }

  function startEditingAbsence(absence: EmployeeAbsence) {
    setEditingAbsenceId(absence.id)
    setAbsenceForm({
      absenceDate: absence.absenceDate,
      deductionDays: String(absence.deductionDays),
      notes: absence.notes ?? '',
    })
  }

  async function handleDeleteAbsence(absence: EmployeeAbsence) {
    if (!selectedEmployeeId) {
      return
    }

    if (!window.confirm(`هل تريد حذف غياب ${formatDate(absence.absenceDate)}؟`)) {
      return
    }

    setIsSavingAbsence(true)

    try {
      await deleteEmployeeAbsence(selectedEmployeeId, absence.id)
      if (editingAbsenceId === absence.id) {
        resetAbsenceForm()
      }
      setMessage('تم حذف سجل الغياب.')
      await loadSelectedEmployeeData(selectedEmployeeId)
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف الغياب.'))
    } finally {
      setIsSavingAbsence(false)
    }
  }

  async function handleSettlementSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSettling(true)

    try {
      const employeeIds = monthlyPayroll.filter((entry) => entry.remainingPayableIqd > 0).map((entry) => entry.employeeId)

      await settleMonthlyPayroll({
        month: settlementForm.month,
        paymentDate: settlementForm.paymentDate,
        paymentMethod: settlementForm.paymentMethod,
        employeeIds,
      })

      setMessage('تم تسديد الرواتب الشهرية للموظفين المستحقين.')
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
      if (selectedEmployeeId) {
        await loadSelectedEmployeeData(selectedEmployeeId)
      }
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تسديد الرواتب الشهرية.'))
    } finally {
      setIsSettling(false)
    }
  }

  async function handleToggleStatus(employee: Employee) {
    if (!canManageEmployeeAccounts) {
      setMessage('تغيير حالة الموظف متاح للمدير فقط.')
      return
    }

    if (isProtectedAdmin(employee)) {
      setMessage('حساب الإدارة الافتراضي محمي.')
      return
    }

    try {
      await updateEmployeeStatus(employee.id, !employee.isActive)
      await loadEmployeesData()
      await loadMonthlyPayrollData(settlementForm.month)
      await loadCumulativePayrollData(settlementForm.month)
      setMessage(employee.isActive ? 'تم إيقاف الموظف.' : 'تم إعادة تفعيل الموظف.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحديث حالة الموظف.'))
    }
  }

  async function handlePrintEmployeeLedger(employee: Employee) {
    try {
      const summary = cumulativePayrollByEmployeeId.get(employee.id)

      if (!summary) {
        setMessage('لا تتوفر بيانات تراكمية كافية لطباعة كشف الحساب لهذا الموظف.')
        return
      }

      const [compensations, absences] = await Promise.all([
        fetchEmployeeCompensations(employee.id),
        fetchEmployeeAbsences(employee.id),
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

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-sky-700">EMPLOYEES</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">إدارة الموظفين والرواتب الشهرية</h1>
              <p className="mt-2 text-sm text-stone-600">ملف خدمة الموظف، سجل الغياب، القيود الفردية، وتسديد الرواتب الجماعي نهاية الشهر.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500" onClick={() => void loadEmployeesData()} type="button">
                تحديث البيانات
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-rose-500 hover:text-rose-700" to="/payroll-report">
                تقرير الرواتب
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/expenses">
                المصروفات
              </Link>
            </div>
          </div>
        </header>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">ACTIVE</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{activeEmployees.length}</p>
            <p className="mt-2 text-sm text-stone-600">موظفون على رأس العمل أو مفعّلون</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">SALARY BASE</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{formatMoney(totalMonthlySalaries, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي الرواتب الشهرية الأساسية</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">MONTH</p>
            <p className="mt-3 font-display text-3xl font-black text-stone-950">{settlementForm.month}</p>
            <p className="mt-2 text-sm text-stone-600">فترة التسوية الحالية</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">PAYABLE</p>
            <p className="mt-3 font-display text-3xl font-black">{formatMoney(payableTotal, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-300">إجمالي المتبقي القابل للتسديد</p>
          </article>
        </section>

        <section className={`mt-6 grid gap-6 ${canManageEmployeeAccounts ? 'xl:grid-cols-[0.95fr_1.05fr]' : ''}`}>
          {canManageEmployeeAccounts ? <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-teal-700">PROFILE</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">{editingEmployee ? 'تعديل ملف موظف' : 'إضافة موظف جديد'}</h2>
              </div>
              {editingEmployee ? (
                <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" onClick={resetEmployeeForm} type="button">
                  إلغاء
                </button>
              ) : null}
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleEmployeeSubmit}>
              <label className="block text-sm font-black text-stone-800">
                الاسم
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={employeeForm.name} onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))} />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  الدور
                  <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={employeeForm.role} onChange={(event) => setEmployeeForm((current) => ({ ...current, role: event.target.value as EmployeeRole }))}>
                    <option value="cashier">كاشير</option>
                    <option value="inventory">مخزن</option>
                    <option value="accountant">محاسب</option>
                    <option value="admin">مدير</option>
                  </select>
                </label>
                <label className="block text-sm font-black text-stone-800">
                  تاريخ المباشرة
                  <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="date" value={employeeForm.startDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-stone-800">
                  الراتب الشهري
                  <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="decimal" value={employeeForm.monthlySalaryIqd} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlySalaryIqd: sanitizeDecimalInput(event.target.value) }))} />
                </label>
                <label className="block text-sm font-black text-stone-800">
                  حالة الخدمة
                  <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={employeeForm.employmentStatus} onChange={(event) => setEmployeeForm((current) => ({ ...current, employmentStatus: event.target.value as EmployeeEmploymentStatus }))}>
                    <option value="active">على رأس العمل</option>
                    <option value="suspended">متوقف</option>
                    <option value="terminated">منتهي خدمة</option>
                  </select>
                </label>
              </div>

              {employeeForm.employmentStatus !== 'active' ? (
                <label className="block text-sm font-black text-stone-800">
                  تاريخ التوقف أو إنهاء الخدمة
                  <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="date" value={employeeForm.serviceEndDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, serviceEndDate: event.target.value }))} />
                </label>
              ) : null}

              <label className="block text-sm font-black text-stone-800">
                ملاحظات
                <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right" value={employeeForm.notes} onChange={(event) => setEmployeeForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>

              {editingEmployee ? (
                <label className="block text-sm font-black text-stone-800">
                  PIN جديد اختياري
                  <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="numeric" value={employeeForm.newPin} onChange={(event) => setEmployeeForm((current) => ({ ...current, newPin: sanitizeIntegerInput(event.target.value) }))} />
                </label>
              ) : (
                <label className="block text-sm font-black text-stone-800">
                  PIN الدخول الأولي
                  <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="numeric" value={employeeForm.pin} onChange={(event) => setEmployeeForm((current) => ({ ...current, pin: sanitizeIntegerInput(event.target.value) }))} />
                  <p className="mt-2 text-xs font-bold text-stone-500">يمكن إدخال PIN بالأرقام العربية أو الإنجليزية.</p>
                </label>
              )}

              <button className="rounded-2xl bg-teal-700 px-5 py-3 text-base font-black text-white disabled:bg-stone-400" disabled={isSavingEmployee} type="submit">
                {isSavingEmployee ? 'جارٍ الحفظ...' : editingEmployee ? 'حفظ التعديل' : 'إضافة الموظف'}
              </button>
            </form>
          </section> : null}

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">TEAM</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">قائمة الموظفين</h2>
                {!canManageEmployeeAccounts ? <p className="mt-2 text-sm text-stone-600">يمكنك استعراض ملفات الموظفين والرواتب، بينما تبقى إدارة الحسابات والأدوار وحالة التفعيل محصورة بالمدير.</p> : null}
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{employees.length} موظف</span>
            </div>

            <div className="mt-6 space-y-4">
              {isLoading ? (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل الموظفين...</div>
              ) : employees.map((employee) => (
                <article key={employee.id} className={`rounded-[26px] border p-5 ${selectedEmployeeId === employee.id ? 'border-teal-300 bg-teal-50/70' : 'border-stone-200 bg-stone-50/90'}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-2xl font-black text-stone-950">{employee.name}</h3>
                        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-black text-stone-700">{getRoleLabel(employee.role)}</span>
                        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-black text-stone-700">{getEmploymentStatusLabel(employee.employmentStatus)}</span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                        <p><span className="font-black text-stone-900">الرقم:</span> {employee.employeeNo}</p>
                        <p><span className="font-black text-stone-900">المباشرة:</span> {employee.startDate ? formatDate(employee.startDate) : 'غير محدد'}</p>
                        <p><span className="font-black text-stone-900">الراتب:</span> {employee.monthlySalaryIqd ? formatMoney(employee.monthlySalaryIqd, 'IQD') : 'غير محدد'}</p>
                        <p><span className="font-black text-stone-900">نهاية الخدمة:</span> {employee.serviceEndDate ? formatDate(employee.serviceEndDate) : 'لا يوجد'}</p>
                      </div>
                      {cumulativePayrollByEmployeeId.get(employee.id) ? <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <article className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                          <p className="text-xs font-black text-sky-700">إجمالي الاستحقاق</p>
                          <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(cumulativePayrollByEmployeeId.get(employee.id)!.totalExpectedNetSalaryIqd, 'IQD')}</p>
                        </article>
                        <article className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                          <p className="text-xs font-black text-amber-700">السلف والمدفوع</p>
                          <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(cumulativePayrollByEmployeeId.get(employee.id)!.totalPaidOutIqd, 'IQD')}</p>
                        </article>
                        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                          <p className="text-xs font-black text-emerald-700">المتبقي التراكمي</p>
                          <p className="mt-2 font-display text-xl font-black text-stone-950">{formatMoney(cumulativePayrollByEmployeeId.get(employee.id)!.totalOutstandingIqd, 'IQD')}</p>
                        </article>
                      </div> : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button className="rounded-full border border-teal-300 px-4 py-2 text-sm font-black text-teal-700" onClick={() => setSelectedEmployeeId(employee.id)} type="button">
                        فتح الملف
                      </button>
                      <button className="rounded-full border border-sky-300 px-4 py-2 text-sm font-black text-sky-700" onClick={() => void handlePrintEmployeeLedger(employee)} type="button">
                        كشف حساب
                      </button>
                      {canManageEmployeeAccounts ? <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" onClick={() => startEditing(employee)} type="button">
                        تعديل
                      </button> : null}
                      {canManageEmployeeAccounts ? <button className="rounded-full border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 disabled:opacity-50" disabled={isProtectedAdmin(employee)} onClick={() => void handleToggleStatus(employee)} type="button">
                        {employee.isActive ? 'إيقاف' : 'تفعيل'}
                      </button> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">EMPLOYEE FILE</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">{selectedEmployee ? selectedEmployee.name : 'اختر موظفاً'}</h2>
            </div>

            {selectedEmployee ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <article className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-4">
                    <p className="text-sm font-black text-rose-700">المتبقي التراكمي</p>
                    <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(selectedEmployeeCumulativeSummary?.totalOutstandingIqd ?? selectedEmployeeBalance, 'IQD')}</p>
                  </article>
                  <article className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
                    <p className="text-sm font-black text-amber-700">إجمالي الغياب</p>
                    <p className="mt-2 font-display text-2xl font-black text-stone-950">{selectedEmployeeCumulativeSummary?.totalAbsenceDays ?? selectedEmployeeMonthSummary?.absenceDays ?? 0}</p>
                  </article>
                  <article className="rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-4">
                    <p className="text-sm font-black text-teal-700">السلف والمدفوع</p>
                    <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(selectedEmployeeCumulativeSummary?.totalPaidOutIqd ?? 0, 'IQD')}</p>
                  </article>
                </div>
                <div className="mt-4 print:hidden">
                  <button className="rounded-full border border-sky-300 px-4 py-2 text-sm font-black text-sky-700" onClick={() => void handlePrintEmployeeLedger(selectedEmployee)} type="button">
                    طباعة كشف حساب الموظف
                  </button>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <form className="space-y-4 rounded-[28px] border border-stone-200 bg-stone-50/80 p-4" onSubmit={handleAbsenceSubmit}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black tracking-[0.2em] text-amber-700">ABSENCE</p>
                        <h3 className="mt-2 font-display text-2xl font-black text-stone-950">سجل الغيابات</h3>
                      </div>
                      {editingAbsenceId ? (
                        <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700" onClick={resetAbsenceForm} type="button">
                          إلغاء التعديل
                        </button>
                      ) : null}
                    </div>
                    <label className="block text-sm font-black text-stone-800">
                      تاريخ الغياب
                      <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="date" value={absenceForm.absenceDate} onChange={(event) => setAbsenceForm((current) => ({ ...current, absenceDate: event.target.value }))} />
                    </label>
                    <label className="block text-sm font-black text-stone-800">
                      أيام الاستقطاع
                      <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="decimal" value={absenceForm.deductionDays} onChange={(event) => setAbsenceForm((current) => ({ ...current, deductionDays: sanitizeDecimalInput(event.target.value) }))} />
                    </label>
                    <label className="block text-sm font-black text-stone-800">
                      ملاحظات
                      <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right" value={absenceForm.notes} onChange={(event) => setAbsenceForm((current) => ({ ...current, notes: event.target.value }))} />
                    </label>
                    <button className="rounded-2xl bg-amber-700 px-5 py-3 text-base font-black text-white disabled:bg-stone-400" disabled={isSavingAbsence} type="submit">
                      {isSavingAbsence ? 'جارٍ الحفظ...' : editingAbsenceId ? 'حفظ تعديل الغياب' : 'تسجيل غياب'}
                    </button>
                  </form>

                  <form className="space-y-4 rounded-[28px] border border-stone-200 bg-stone-50/80 p-4" onSubmit={handleCompensationSubmit}>
                    <div>
                      <p className="text-sm font-black tracking-[0.2em] text-sky-700">ENTRY</p>
                      <h3 className="mt-2 font-display text-2xl font-black text-stone-950">قيود فردية إضافية</h3>
                      <p className="mt-2 text-sm text-stone-600">بديل واضح لعبارة قيد راتب أو دفعة، ويستخدم للمكافآت والخصومات والسلف والدفعات الفردية.</p>
                    </div>
                    <label className="block text-sm font-black text-stone-800">
                      نوع القيد
                      <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={compensationForm.kind} onChange={(event) => setCompensationForm((current) => ({ ...current, kind: event.target.value as EmployeeCompensationKind }))}>
                        <option value="bonus">مكافأة</option>
                        <option value="deduction">خصم يدوي</option>
                        <option value="advance">سلفة</option>
                        <option value="payment">دفعة راتب فردية</option>
                        <option value="salary">استحقاق راتب يدوي</option>
                      </select>
                    </label>
                    <label className="block text-sm font-black text-stone-800">
                      المبلغ
                      <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="decimal" value={compensationForm.amountIqd} onChange={(event) => setCompensationForm((current) => ({ ...current, amountIqd: sanitizeDecimalInput(event.target.value) }))} />
                    </label>
                    {compensationRequiresPaymentMethod(compensationForm.kind) ? (
                      <label className="block text-sm font-black text-stone-800">
                        طريقة الدفع
                        <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={compensationForm.paymentMethod} onChange={(event) => setCompensationForm((current) => ({ ...current, paymentMethod: event.target.value as EmployeeCompensationPaymentMethod }))}>
                          <option value="cash">نقدي</option>
                          <option value="bank">تحويل</option>
                        </select>
                      </label>
                    ) : null}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-black text-stone-800">
                        تاريخ القيد
                        <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="date" value={compensationForm.paymentDate} onChange={(event) => setCompensationForm((current) => ({ ...current, paymentDate: event.target.value }))} />
                      </label>
                      <label className="block text-sm font-black text-stone-800">
                        شهر القيد
                        <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="month" value={compensationForm.periodLabel} onChange={(event) => setCompensationForm((current) => ({ ...current, periodLabel: event.target.value }))} />
                      </label>
                    </div>
                    <p className="text-xs font-bold text-stone-500">شهر القيد هو الشهر الذي سيظهر فيه أثر السلفة أو الدفعة أو المكافأة داخل كشف الراتب، أما تاريخ القيد فهو تاريخ تنفيذ الحركة فقط.</p>
                    <label className="block text-sm font-black text-stone-800">
                      ملاحظات
                      <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right" value={compensationForm.notes} onChange={(event) => setCompensationForm((current) => ({ ...current, notes: event.target.value }))} />
                    </label>
                    <button className="rounded-2xl bg-sky-700 px-5 py-3 text-base font-black text-white disabled:bg-stone-400" disabled={isSavingCompensation} type="submit">
                      {isSavingCompensation ? 'جارٍ الحفظ...' : 'حفظ القيد'}
                    </button>
                  </form>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <section className="rounded-[28px] border border-stone-200 bg-stone-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-2xl font-black text-stone-950">سجل الغيابات</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-700">{filteredEmployeeAbsences.length}</span>
                    </div>
                    <div className="mt-4">
                      <label className="block text-sm font-black text-stone-800">
                        شهر الغيابات المعروض
                        <input
                          className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right"
                          type="date"
                          value={getMonthDateValue(absenceFilterMonth)}
                          onChange={(event) => setAbsenceFilterMonth(getMonthKeyFromDate(event.target.value) || absenceFilterMonth)}
                          onFocus={(event) => event.currentTarget.showPicker?.()}
                        />
                        <p className="mt-2 text-xs font-bold text-stone-500">يعرض الغيابات الخاصة بالشهر المحدد فقط لتسهيل المراجعة قبل احتساب الرواتب.</p>
                      </label>
                    </div>
                    <div className="mt-4 space-y-3">
                      {filteredEmployeeAbsences.length ? filteredEmployeeAbsences.map((absence) => (
                        <article key={absence.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-700">
                          <p className="font-black text-stone-950">{formatDate(absence.absenceDate)} - {absence.deductionDays} يوم</p>
                          {absence.notes ? <p className="mt-2">{absence.notes}</p> : null}
                          <p className="mt-2 text-xs text-stone-500">سجله {absence.createdByEmployeeName} - {formatDateTime(absence.createdAt)}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button className="rounded-full border border-stone-300 px-3 py-1 text-xs font-black text-stone-700" onClick={() => startEditingAbsence(absence)} type="button">
                              تعديل
                            </button>
                            <button className="rounded-full border border-rose-300 px-3 py-1 text-xs font-black text-rose-700 disabled:opacity-50" disabled={isSavingAbsence} onClick={() => void handleDeleteAbsence(absence)} type="button">
                              إلغاء الغياب
                            </button>
                          </div>
                        </article>
                      )) : <div className="rounded-2xl bg-white px-4 py-6 text-center text-stone-500">لا توجد غيابات مسجلة في هذا الشهر.</div>}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-stone-200 bg-stone-50/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-2xl font-black text-stone-950">آخر القيود</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-700">{employeeCompensations.length}</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {employeeCompensations.length ? employeeCompensations.map((entry) => (
                        <article key={entry.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${getCompensationKindClasses(entry.kind)}`}>{getCompensationKindLabel(entry.kind)}</span>
                            <span className="font-black text-stone-950">{formatMoney(entry.amountIqd, 'IQD')}</span>
                          </div>
                          <p className="mt-2">{formatDate(entry.paymentDate)} {entry.periodLabel ? `- ${entry.periodLabel}` : ''}</p>
                          {entry.notes ? <p className="mt-2">{entry.notes}</p> : null}
                        </article>
                      )) : <div className="rounded-2xl bg-white px-4 py-6 text-center text-stone-500">لا توجد قيود مسجلة.</div>}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">اختر موظفاً من القائمة.</div>
            )}
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-emerald-700">SETTLEMENT</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تسديد رواتب</h2>
              <p className="mt-2 text-sm text-stone-600">بطاقة جماعية لصرف نهاية الشهر بعد استقطاع الغيابات أو التوقف أو إنهاء الخدمة.</p>
            </div>

            <form className="mt-6 grid gap-4 sm:grid-cols-3" onSubmit={handleSettlementSubmit}>
              <label className="block text-sm font-black text-stone-800">
                شهر التسديد عبر التقويم
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right"
                  type="date"
                  value={getMonthDateValue(settlementForm.month)}
                  onChange={(event) => setSettlementForm((current) => ({ ...current, month: getMonthKeyFromDate(event.target.value) || current.month }))}
                  onFocus={(event) => event.currentTarget.showPicker?.()}
                />
                <p className="mt-2 text-xs font-bold text-stone-500">اختر أي يوم من الشهر المطلوب ليتم اعتماد ذلك الشهر في التسديد.</p>
              </label>
              <label className="block text-sm font-black text-stone-800">
                تاريخ الدفع
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" type="date" value={settlementForm.paymentDate} onChange={(event) => setSettlementForm((current) => ({ ...current, paymentDate: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                طريقة الدفع
                <select className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={settlementForm.paymentMethod} onChange={(event) => setSettlementForm((current) => ({ ...current, paymentMethod: event.target.value as EmployeeCompensationPaymentMethod }))}>
                  <option value="cash">نقدي</option>
                  <option value="bank">تحويل</option>
                </select>
              </label>
              <button className="rounded-2xl bg-emerald-700 px-5 py-3 text-base font-black text-white disabled:bg-stone-400 sm:col-span-3" disabled={isSettling || !monthlyPayroll.some((entry) => entry.remainingPayableIqd > 0)} type="submit">
                {isSettling ? 'جارٍ التسديد...' : 'تسديد جميع الرواتب المستحقة'}
              </button>
            </form>

            <div className="mt-6 space-y-4">
              {monthlyPayroll.length ? monthlyPayroll.map((entry) => (
                <article key={entry.employeeId} className="rounded-[26px] border border-stone-200 bg-stone-50/90 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-black text-stone-950">{entry.employeeName}</h3>
                      <p className="mt-1 text-sm text-stone-600">{entry.employeeNo} - {getRoleLabel(entry.role)} - {getEmploymentStatusLabel(entry.employmentStatus)}</p>
                      <div className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
                        <p><span className="font-black text-stone-900">الراتب الأساسي:</span> {formatMoney(entry.monthlySalaryIqd, 'IQD')}</p>
                        <p><span className="font-black text-stone-900">الأيام المستحقة:</span> {entry.payableDays}</p>
                        <p><span className="font-black text-stone-900">أيام الغياب:</span> {entry.absenceDays}</p>
                        <p><span className="font-black text-stone-900">خصم الغياب:</span> {formatMoney(entry.absenceDeductionIqd, 'IQD')}</p>
                        <p><span className="font-black text-stone-900">المكافآت:</span> {formatMoney(entry.bonusIqd, 'IQD')}</p>
                        <p><span className="font-black text-stone-900">الخصومات:</span> {formatMoney(entry.deductionIqd, 'IQD')}</p>
                        <p><span className="font-black text-stone-900">السلف:</span> {formatMoney(entry.advanceIqd, 'IQD')}</p>
                        <p><span className="font-black text-stone-900">المدفوع سابقاً:</span> {formatMoney(entry.paymentIqd, 'IQD')}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-3xl font-black text-emerald-700">{formatMoney(entry.remainingPayableIqd, 'IQD')}</p>
                      <p className="mt-1 text-xs font-black text-stone-500">المتبقي للتسديد</p>
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد بيانات شهرية لعرضها.</div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
