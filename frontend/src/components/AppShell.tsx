import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useEmployeeSession } from '../lib/auth'
import { navigationItems } from '../lib/app-navigation'
import { hasPermission } from '../lib/permissions'
import { useSystemSettings } from '../lib/system-settings'
import { CurrentEmployeeBanner } from './CurrentEmployeeBanner'

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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useEmployeeSession()
  const { permissions, viewerSettings } = useSystemSettings()
  const allowedItems = navigationItems.filter((item) => !item.permission || hasPermission(permissions, item.permission))

  if (!session) {
    return null
  }

  return (
    <div className="flex h-full flex-col rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,239,228,0.96))] p-4 shadow-[0_24px_80px_rgba(77,60,27,0.12)] backdrop-blur-xl sm:p-5">
      <div className="rounded-[24px] bg-stone-950 px-5 py-5 text-white shadow-[0_20px_50px_rgba(28,25,23,0.24)]">
        <p className="text-xs font-black tracking-[0.24em] text-teal-200/90">SUPER M2</p>
        <h2 className="mt-3 font-display text-2xl font-black">{viewerSettings?.storeName || 'Super M2'}</h2>
        <p className="mt-2 text-sm leading-7 text-stone-300">تنقل مباشر بين صفحات البرنامج حسب الصلاحيات الفعلية للمستخدم الحالي.</p>
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/8 px-4 py-3">
          <p className="text-xs font-black tracking-[0.18em] text-stone-400">CURRENT ROLE</p>
          <p className="mt-2 text-base font-black">{getRoleLabel(session.employee.role)}</p>
          <p className="mt-1 text-sm text-stone-300">{session.employee.name}</p>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="mb-3 flex items-center justify-between px-2 text-xs font-black tracking-[0.18em] text-stone-500">
          <span>APP NAVIGATION</span>
          <span>{allowedItems.length} صفحات</span>
        </div>

        <nav className="space-y-2">
          {allowedItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => [
                'group block rounded-[24px] border px-4 py-3 transition',
                isActive
                  ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-[0_10px_30px_rgba(13,148,136,0.16)]'
                  : 'border-stone-200/80 bg-white/82 text-stone-700 hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white',
              ].join(' ')}
              onClick={onNavigate}
              to={item.to}
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg font-black">{item.label}</h3>
                    <span className={[
                      'rounded-full px-3 py-1 text-[11px] font-black tracking-[0.18em]',
                      isActive ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-500 group-hover:bg-teal-100 group-hover:text-teal-700',
                    ].join(' ')}>
                      {isActive ? 'ACTIVE' : 'OPEN'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-stone-500 group-hover:text-stone-700">{item.description}</p>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { session } = useEmployeeSession()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const shouldShowSidebar = session?.employee.role !== 'cashier' && location.pathname !== '/quick-navigation'
  const shouldShowSessionBanner = location.pathname !== '/quick-navigation'

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!shouldShowSidebar) {
      setIsSidebarOpen(false)
    }
  }, [shouldShowSidebar])

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_42%,#f8f5ef_100%)] text-stone-900">
      <div className="mx-auto flex max-w-[1820px] gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {shouldShowSidebar ? (
          <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[320px] flex-none lg:block">
            <SidebarContent />
          </aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {shouldShowSidebar ? (
            <div className="mb-4 lg:hidden">
              <div className="rounded-[28px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_20px_60px_rgba(77,60,27,0.10)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black tracking-[0.2em] text-stone-500">APP MENU</p>
                    <h2 className="mt-1 font-display text-2xl font-black text-stone-950">التجوال داخل البرنامج</h2>
                  </div>
                  <button
                    className="rounded-full bg-stone-950 px-4 py-2 text-sm font-black text-white transition hover:bg-stone-800"
                    onClick={() => setIsSidebarOpen((current) => !current)}
                    type="button"
                  >
                    {isSidebarOpen ? 'إغلاق' : 'القائمة'}
                  </button>
                </div>

                {isSidebarOpen ? (
                  <div className="mt-4 max-h-[70vh] overflow-y-auto">
                    <SidebarContent onNavigate={() => setIsSidebarOpen(false)} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {shouldShowSessionBanner ? <CurrentEmployeeBanner className="mb-4" /> : null}
          {children}
        </div>
      </div>
    </div>
  )
}