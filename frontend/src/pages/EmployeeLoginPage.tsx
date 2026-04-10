import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import { useEmployeeSession } from '../lib/auth'
import { sanitizeIntegerInput } from '../lib/number-input'
import { useSystemSettings } from '../lib/system-settings'
import { authenticateEmployee, fetchActiveEmployees, type ActiveEmployee, type Employee } from '../lib/employees-api'

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

function getDefaultRouteForRole(role: Employee['role']) {
  if (role === 'cashier') {
    return '/pos'
  }

  if (role === 'inventory') {
    return '/inventory'
  }

  if (role === 'accountant') {
    return '/expenses'
  }

  return '/dashboard'
}

export function EmployeeLoginPage() {
  const navigate = useNavigate()
  const { session, login } = useEmployeeSession()
  const { viewerSettings } = useSystemSettings()
  const [employees, setEmployees] = useState<ActiveEmployee[]>([])
  const [loginInput, setLoginInput] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadEmployeesData() {
    setIsLoading(true)

    try {
      const data = await fetchActiveEmployees()
      setEmployees(data)
      setSelectedEmployeeId((current) => current || data[0]?.id || '')
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل الموظفين.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadEmployeesData()
  }, [])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  )

  if (session) {
    return <Navigate replace to={getDefaultRouteForRole(session.employee.role)} />
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const resolvedLogin = loginInput.trim() || selectedEmployeeId

    if (!resolvedLogin) {
      setMessage('أدخل اسم المستخدم أو اختر موظفاً لتسجيل الدخول.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await authenticateEmployee({ login: resolvedLogin, pin })
      login(result)
      navigate(getDefaultRouteForRole(result.employee.role), { replace: true })
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'فشل تسجيل الدخول.'))
    } finally {
      setIsSubmitting(false)
      setPin('')
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(13,148,136,0.18),transparent_35%),linear-gradient(180deg,#f7f3ea_0%,#efe7d8_45%,#f9f7f1_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">EMPLOYEE LOGIN</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">دخول الموظفين</h1>
              <p className="mt-2 text-sm text-stone-600">{viewerSettings?.storeName ? `شاشة دخول موظفي ${viewerSettings.storeName} مع توجيه حسب الدور.` : 'شاشة دخول مناسبة لأجهزة الكاشير على الشبكة مع توجيه حسب الدور.'}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadEmployeesData()}
                type="button"
              >
                تحديث القائمة
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/employees">
                إدارة الموظفين
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-amber-500 hover:text-amber-700" to="/">
                الرئيسية
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.95fr]">
          <section className="rounded-[34px] border border-white/75 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">ACCESS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">أدخل اسم المستخدم أو اختر الموظف</h2>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm font-black text-stone-800">
                اسم المستخدم
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                  placeholder="مثال: admin"
                  value={loginInput}
                  onChange={(event) => setLoginInput(event.target.value)}
                />
              </label>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                يمكن للإدارة تسجيل الدخول باسم المستخدم، بينما يمكن للكاشير أو المخزن أو المحاسب اختيار الموظف من القائمة ثم إدخال PIN.
              </div>

              <label className="block text-sm font-black text-stone-800">
                الموظف
                <select
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                  disabled={isLoading || employees.length === 0}
                  value={selectedEmployeeId}
                  onChange={(event) => setSelectedEmployeeId(event.target.value)}
                >
                  {employees.length === 0 ? <option value="">لا يوجد موظفون مفعلون</option> : null}
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.employeeNo} - {employee.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-black text-stone-800">
                PIN
                <input
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="أدخل PIN الحساب"
                  value={pin}
                  onChange={(event) => setPin(sanitizeIntegerInput(event.target.value))}
                />
              </label>

              <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" />

              <button
                className="rounded-2xl bg-teal-700 px-5 py-3 text-base font-black text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-stone-400"
                disabled={isSubmitting || (!loginInput.trim() && isLoading) || (!loginInput.trim() && !employees.length)}
                type="submit"
              >
                {isSubmitting ? 'جارٍ التحقق...' : 'دخول'}
              </button>
            </form>
          </section>

          <section className="rounded-[34px] border border-white/75 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-sky-700">ACTIVE TEAM</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الموظفون المفعلون</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{employees.length} موظف</span>
            </div>

            <div className="mt-5 space-y-3">
              {employees.length ? employees.map((employee) => (
                <button
                  key={employee.id}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-right transition ${selectedEmployeeId === employee.id ? 'border-teal-400 bg-teal-50' : 'border-stone-200 bg-stone-50/90 hover:border-teal-300 hover:bg-white'}`}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  type="button"
                >
                  <div>
                    <p className="font-display text-xl font-black text-stone-950">{employee.name}</p>
                    <p className="mt-1 text-sm text-stone-600">{employee.employeeNo} • {getRoleLabel(employee.role)}</p>
                  </div>
                  <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">{getRoleLabel(employee.role)}</span>
                </button>
              )) : <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا يوجد موظفون مفعلون. أضف موظفاً من شاشة إدارة الموظفين أولاً.</div>}
            </div>

            {selectedEmployee ? <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">سيتم توجيه {selectedEmployee.name} إلى {selectedEmployee.role === 'cashier' ? 'شاشة الكاشير' : selectedEmployee.role === 'inventory' ? 'شاشة المخزن' : selectedEmployee.role === 'accountant' ? 'شاشة المصروفات والرواتب' : 'لوحة الإدارة'} بعد نجاح التحقق.</div> : null}
          </section>
        </section>
      </div>
    </main>
  )
}