import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmployeeSession } from '../lib/auth'
import { closeShift, fetchShifts } from '../lib/shifts-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'

function getRoleLabel(role: 'admin' | 'cashier' | 'inventory' | 'accountant') {
  if (role === 'admin') {
    return 'المدير'
  }

  if (role === 'cashier') {
    return 'الكاشير'
  }

  if (role === 'inventory') {
    return 'المخزون والمشتريات'
  }

  return 'المحاسب'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function CurrentEmployeeBanner({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { session, logout } = useEmployeeSession()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null)

  if (!session) {
    return null
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return
    }

    const activeSession = session

    if (!activeSession) {
      return
    }

    setIsLoggingOut(true)
    setLogoutMessage(null)

    try {
      if (activeSession.employee.role === 'cashier') {
        const shifts = await fetchShifts(activeSession.employee.id)
        const openShift = shifts.find((shift) => shift.status === 'open')

        if (openShift) {
          await closeShift({
            shiftId: openShift.id,
            closingCashIqd: openShift.closingSummary?.expectedCashIqd ?? openShift.openingFloatIqd,
            closingNote: 'إغلاق تلقائي عند تسجيل خروج الكاشير.',
          })
        }
      }

      logout()
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutMessage(getUserFacingErrorMessage(error, 'تعذر إغلاق الوردية تلقائياً قبل تسجيل الخروج.'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <section className={[className, compact ? 'rounded-[28px] border border-white/75 bg-white/88 px-5 py-5 shadow-[0_20px_60px_rgba(77,60,27,0.10)] backdrop-blur-xl' : 'rounded-[24px] border border-white/70 bg-white/82 px-5 py-4 shadow-[0_18px_50px_rgba(77,60,27,0.10)] backdrop-blur-xl'].filter(Boolean).join(' ')}>
      <div className={`flex ${compact ? 'flex-col gap-4 xl:flex-row xl:items-center xl:justify-between' : 'flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'}`}>
        <div>
          <p className="text-xs font-black tracking-[0.2em] text-stone-500">CURRENT SESSION</p>
          <h2 className={`mt-1 font-black text-stone-950 ${compact ? 'text-2xl' : 'text-lg'}`}>{session.employee.name}</h2>
          <p className={`mt-1 text-stone-600 ${compact ? 'text-sm leading-7' : 'text-sm'}`}>
            {getRoleLabel(session.employee.role)}
            <span className="mx-2 text-stone-400">|</span>
            الرقم الوظيفي: {session.employee.employeeNo}
            <span className="mx-2 text-stone-400">|</span>
            وقت الدخول: {formatDate(session.loggedInAt)}
          </p>
        </div>

        <div className={`flex ${compact ? 'flex-wrap items-center gap-3' : ''}`}>
          {compact ? <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-black text-stone-700">الجلسة الحالية مفعلة</div> : null}
          <button
            className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-500 hover:bg-rose-100"
            disabled={isLoggingOut}
            onClick={handleLogout}
            type="button"
          >
            {isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
          </button>
        </div>
      </div>
      {logoutMessage ? <p className="mt-3 text-sm font-bold text-rose-700">{logoutMessage}</p> : null}
    </section>
  )
}