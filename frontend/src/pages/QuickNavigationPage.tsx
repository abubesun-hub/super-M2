import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { navigationItems } from '../lib/app-navigation'
import { useEmployeeSession } from '../lib/auth'
import { formatMoney } from '../lib/currency'
import { buildDashboardSummaryRequest, createDefaultDashboardFilter, getDashboardFilterLabel } from '../lib/dashboard-periods'
import { fetchDashboardSummary, type DashboardSummary } from '../lib/dashboard-api'
import { fetchSuppliersTotalDebt } from '../lib/suppliers-api'
import { buildExpiryAlertSummary, type ExpiryAlertSummary } from '../lib/expiry-alerts'
import { hasPermission } from '../lib/permissions'
import { fetchProducts } from '../lib/products-api'
import { fetchPurchaseReceipts } from '../lib/purchases-api'
import { closeShift, fetchShifts } from '../lib/shifts-api'
import { useSystemSettings } from '../lib/system-settings'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'

type QuickCategory = 'عام' | 'مبيعات' | 'مخزون' | 'مالية' | 'إدارة'

type RouteMeta = {
  category: QuickCategory
  eyebrow: string
  accentClassName: string
  badgeClassName: string
  icon: IconName
}

type IconName =
  | 'home'
  | 'dashboard'
  | 'pos'
  | 'invoices'
  | 'inventory'
  | 'batches'
  | 'purchases'
  | 'customers'
  | 'cash'
  | 'expenses'
  | 'payroll'
  | 'employees'
  | 'shifts'
  | 'settings'
  | 'sales'
  | 'profit'
  | 'returns'
  | 'expiry'
  | 'stock'

const routeMetaByPath: Record<string, RouteMeta> = {
  '/': { category: 'عام', eyebrow: 'HOME', accentClassName: 'border-stone-200 bg-stone-50/85 hover:border-stone-400 hover:bg-white', badgeClassName: 'bg-stone-950 text-white', icon: 'home' },
  '/dashboard': { category: 'إدارة', eyebrow: 'OVERVIEW', accentClassName: 'border-teal-200 bg-teal-50/85 hover:border-teal-400 hover:bg-teal-100/75', badgeClassName: 'bg-teal-700 text-white', icon: 'dashboard' },
  '/pos': { category: 'مبيعات', eyebrow: 'POS', accentClassName: 'border-emerald-200 bg-emerald-50/85 hover:border-emerald-400 hover:bg-emerald-100/75', badgeClassName: 'bg-emerald-700 text-white', icon: 'pos' },
  '/invoices': { category: 'مبيعات', eyebrow: 'INVOICES', accentClassName: 'border-sky-200 bg-sky-50/85 hover:border-sky-400 hover:bg-sky-100/75', badgeClassName: 'bg-sky-700 text-white', icon: 'invoices' },
  '/inventory': { category: 'مخزون', eyebrow: 'INVENTORY', accentClassName: 'border-amber-200 bg-amber-50/85 hover:border-amber-400 hover:bg-amber-100/75', badgeClassName: 'bg-amber-700 text-white', icon: 'inventory' },
  '/batches': { category: 'مخزون', eyebrow: 'BATCHES', accentClassName: 'border-rose-200 bg-rose-50/85 hover:border-rose-400 hover:bg-rose-100/75', badgeClassName: 'bg-rose-700 text-white', icon: 'batches' },
  '/purchases': { category: 'مخزون', eyebrow: 'PURCHASES', accentClassName: 'border-cyan-200 bg-cyan-50/85 hover:border-cyan-400 hover:bg-cyan-100/75', badgeClassName: 'bg-cyan-700 text-white', icon: 'purchases' },
  '/customers': { category: 'مبيعات', eyebrow: 'CUSTOMERS', accentClassName: 'border-fuchsia-200 bg-fuchsia-50/85 hover:border-fuchsia-400 hover:bg-fuchsia-100/75', badgeClassName: 'bg-fuchsia-700 text-white', icon: 'customers' },
  '/cash-revenues': { category: 'مالية', eyebrow: 'CASH FLOW', accentClassName: 'border-lime-200 bg-lime-50/85 hover:border-lime-400 hover:bg-lime-100/75', badgeClassName: 'bg-lime-700 text-white', icon: 'cash' },
  '/expenses': { category: 'مالية', eyebrow: 'EXPENSES', accentClassName: 'border-orange-200 bg-orange-50/85 hover:border-orange-400 hover:bg-orange-100/75', badgeClassName: 'bg-orange-700 text-white', icon: 'expenses' },
  '/payroll-report': { category: 'مالية', eyebrow: 'PAYROLL', accentClassName: 'border-violet-200 bg-violet-50/85 hover:border-violet-400 hover:bg-violet-100/75', badgeClassName: 'bg-violet-700 text-white', icon: 'payroll' },
  '/employees': { category: 'إدارة', eyebrow: 'TEAM', accentClassName: 'border-indigo-200 bg-indigo-50/85 hover:border-indigo-400 hover:bg-indigo-100/75', badgeClassName: 'bg-indigo-700 text-white', icon: 'employees' },
  '/shifts': { category: 'إدارة', eyebrow: 'SHIFTS', accentClassName: 'border-blue-200 bg-blue-50/85 hover:border-blue-400 hover:bg-blue-100/75', badgeClassName: 'bg-blue-700 text-white', icon: 'shifts' },
  '/settings': { category: 'إدارة', eyebrow: 'SETTINGS', accentClassName: 'border-stone-300 bg-stone-100/85 hover:border-stone-500 hover:bg-white', badgeClassName: 'bg-stone-900 text-white', icon: 'settings' },
}

const categoryPresentation: Record<QuickCategory, { title: string; description: string; stripClassName: string }> = {
  عام: { title: 'عام', description: 'صفحات الدخول العامة ومسارات البداية.', stripClassName: 'border-stone-200 bg-stone-50/85' },
  مبيعات: { title: 'المبيعات والعملاء', description: 'البيع، الفواتير، والعملاء ومسار الكاشير.', stripClassName: 'border-emerald-200 bg-emerald-50/70' },
  مخزون: { title: 'المخزون والمشتريات', description: 'الأصناف، الدفعات، والاستلامات وتحديث الكلفة.', stripClassName: 'border-amber-200 bg-amber-50/70' },
  مالية: { title: 'المالية', description: 'الإيرادات، المصروفات، والرواتب.', stripClassName: 'border-violet-200 bg-violet-50/70' },
  إدارة: { title: 'الإدارة والتشغيل', description: 'اللوحة، الورديات، الموظفون، والإعدادات.', stripClassName: 'border-teal-200 bg-teal-50/70' },
}

const categoryOrder: QuickCategory[] = ['مبيعات', 'مخزون', 'مالية', 'إدارة', 'عام']

const featuredRoutePaths = new Set(['/dashboard', '/pos', '/inventory', '/cash-revenues'])

function IconGlyph({ icon, className }: { icon: IconName; className?: string }) {
  const shared = 'h-5 w-5'

  switch (icon) {
    case 'home':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13V10.5" /></svg>
    case 'dashboard':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 13h6V5H4zM14 19h6V5h-6zM4 19h6v-4H4z" /></svg>
    case 'pos':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h2m2 0h2m2 0h0M8 16h8" /></svg>
    case 'invoices':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M7 3h10l2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1V5z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
    case 'inventory':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7 12 3l8 4-8 4-8-4Z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" /></svg>
    case 'batches':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></svg>
    case 'purchases':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M6 6h15l-1.5 8h-11z" /><path d="M6 6 5 3H3" /><circle cx="10" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>
    case 'customers':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M4 19c0-3 2.5-5 5-5s5 2 5 5" /><path d="M16 8h4M18 6v4" /></svg>
    case 'cash':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9h.01M17 15h.01" /></svg>
    case 'expenses':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M7 4h10v16H7z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
    case 'payroll':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 19h16" /><path d="M7 16V9M12 16V5M17 16v-7" /></svg>
    case 'employees':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M4.5 19c0-3 2.5-5 5-5s5 2 5 5" /><path d="M14.5 19c.2-1.6 1.2-3 2.8-3.8" /></svg>
    case 'shifts':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /></svg>
    case 'settings':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.4 1.9Z" /></svg>
    case 'sales':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 18V9" /><path d="M10 18V6" /><path d="M16 18v-4" /><path d="M22 18H2" /></svg>
    case 'profit':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 16 9 11l4 4 7-8" /><path d="M14 7h6v6" /></svg>
    case 'returns':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 7H5v4" /><path d="M5 11a7 7 0 1 0 2-5" /></svg>
    case 'expiry':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 8v5" /><circle cx="12" cy="15.5" r=".5" fill="currentColor" stroke="none" /><path d="M10 3h4" /><path d="M12 3v3" /><circle cx="12" cy="14" r="7" /></svg>
    case 'stock':
      return <svg className={className ?? shared} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7 12 3l8 4-8 4-8-4Z" /><path d="M12 11v10" /><path d="M4 12l8 4 8-4" /></svg>
  }
}

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

export function QuickNavigationPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, logout } = useEmployeeSession()
  const { viewerSettings, permissions } = useSystemSettings()
  const [filter, setFilter] = useState(createDefaultDashboardFilter)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [expirySummary, setExpirySummary] = useState<ExpiryAlertSummary>({
    alerts: [],
    expiredCount: 0,
    criticalCount: 0,
    warningCount: 0,
    affectedProductsCount: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
    const [suppliersDebt, setSuppliersDebt] = useState<number | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const storeName = viewerSettings?.storeName || 'Super M2'
  const quickLinks = navigationItems.filter((item) => !item.permission || hasPermission(permissions, item.permission))
  const cardLinks = quickLinks.filter((item) => item.to !== '/quick-navigation')
  const currentRoleLabel = session ? getRoleLabel(session.employee.role) : 'المستخدم'
  const canViewSummaryCards = session?.employee.role === 'admin' || session?.employee.role === 'accountant'
  const rolePrimaryPaths: Record<'admin' | 'cashier' | 'inventory' | 'accountant', string[]> = {
    admin: ['/dashboard', '/quick-navigation', '/purchases', '/settings'],
    cashier: ['/pos', '/invoices', '/customers'],
    inventory: ['/inventory', '/purchases', '/batches'],
    accountant: ['/cash-revenues', '/expenses', '/payroll-report'],
  }
  const recommendedLinks = session
    ? rolePrimaryPaths[session.employee.role]
      .map((path) => quickLinks.find((item) => item.to === path))
      .filter((item): item is (typeof quickLinks)[number] => Boolean(item))
    : []
  const groupedLinks = categoryOrder
    .map((category) => ({
      category,
      items: cardLinks.filter((item) => (routeMetaByPath[item.to]?.category ?? 'عام') === category),
    }))
    .filter((group) => group.items.length > 0)
  async function loadQuickNavigationData(nextFilter = filter) {
    setIsLoading(true)

    try {
      const dashboardData = await fetchDashboardSummary(buildDashboardSummaryRequest(nextFilter))
      setSummary(dashboardData)

        // جلب ديون الموردين
        try {
          const debt = await fetchSuppliersTotalDebt()
          setSuppliersDebt(debt)
        } catch {
          setSuppliersDebt(null)
        }

      const [productsResult, receiptsResult] = await Promise.allSettled([
        fetchProducts(),
        fetchPurchaseReceipts(),
      ])

      if (productsResult.status === 'fulfilled' && receiptsResult.status === 'fulfilled') {
        setExpirySummary(buildExpiryAlertSummary(receiptsResult.value, productsResult.value))
      } else {
        setExpirySummary({
          alerts: [],
          expiredCount: 0,
          criticalCount: 0,
          warningCount: 0,
          affectedProductsCount: 0,
        })
      }

      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات صفحة التنقل السريع.'))
        setSuppliersDebt(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadQuickNavigationData()
  }, [])

  const salesPeriodLabel = summary?.period.label ?? getDashboardFilterLabel(filter.preset)

  function handleSummaryPresetChange(preset: typeof filter.preset) {
    const nextFilter = { ...filter, preset }
    setFilter(nextFilter)
    void loadQuickNavigationData(nextFilter)
  }

  function applyCustomSummaryFilter() {
    const nextFilter = { ...filter, preset: 'custom' as const }
    setFilter(nextFilter)
    void loadQuickNavigationData(nextFilter)
  }

  function formatSessionDate(value: string) {
    return new Intl.DateTimeFormat('ar-IQ', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  async function handleLogout() {
    if (!session || isLoggingOut) {
      return
    }

    setIsLoggingOut(true)

    try {
      if (session.employee.role === 'cashier') {
        const shifts = await fetchShifts(session.employee.id)
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
      setMessage(getUserFacingErrorMessage(error, 'تعذر إغلاق الوردية تلقائياً قبل تسجيل الخروج.'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  const expiryWatchCount = expirySummary.expiredCount + expirySummary.criticalCount + expirySummary.warningCount
  const summaryCards = [
    {
      key: 'available',
      eyebrow: 'SALES COUNT',
      value: isLoading ? '...' : String(summary?.salesCount ?? 0),
      label: `عدد الفواتير خلال ${salesPeriodLabel}`,
      className: 'min-h-[190px] rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl',
      eyebrowClassName: 'text-emerald-700',
      valueClassName: 'text-stone-950',
      labelClassName: 'text-stone-600',
      icon: 'sales' as IconName,
    },
    {
      key: 'sales-value',
      eyebrow: 'SALES VALUE',
      value: isLoading ? '...' : formatMoney(summary?.salesTotal ?? 0, 'IQD'),
      label: `إجمالي المبيعات خلال ${salesPeriodLabel}`,
      className: 'min-h-[190px] rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl',
      eyebrowClassName: 'text-teal-700',
      valueClassName: 'text-stone-950 text-[2.2rem] leading-tight',
      labelClassName: 'text-stone-600',
      icon: 'cash' as IconName,
    },
    {
      key: 'profit',
      eyebrow: 'GROSS PROFIT',
      value: isLoading ? '...' : formatMoney(summary?.estimatedProfit ?? 0, 'IQD'),
      label: `ربح تقديري خلال ${salesPeriodLabel}`,
      className: 'min-h-[190px] rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl',
      eyebrowClassName: 'text-indigo-700',
      valueClassName: 'text-stone-950 text-[2.2rem] leading-tight',
      labelClassName: 'text-stone-600',
      icon: 'profit' as IconName,
    },
    {
      key: 'returns',
      eyebrow: 'RETURNS',
      value: isLoading ? '...' : String(summary?.returnsCount ?? 0),
      label: `عدد المرتجعات خلال ${salesPeriodLabel}`,
      className: 'min-h-[190px] rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl',
      eyebrowClassName: 'text-rose-700',
      valueClassName: 'text-stone-950',
      labelClassName: 'text-stone-600',
      icon: 'returns' as IconName,
    },
    {
      key: 'expiry',
      eyebrow: 'EXPIRY WATCH',
      value: isLoading ? '...' : String(expiryWatchCount),
      label: expirySummary.expiredCount > 0 ? 'دفعات منتهية أو قريبة الانتهاء وتتطلب مراجعة' : 'دفعات منتهية أو قريبة الانتهاء خلال 30 يوماً',
      className: 'min-h-[190px] rounded-[28px] border border-rose-200 bg-[linear-gradient(180deg,#fff1f2_0%,#ffe4e6_100%)] p-5 shadow-[0_24px_80px_rgba(159,18,57,0.10)]',
      eyebrowClassName: 'text-rose-700',
      valueClassName: 'text-rose-900',
      labelClassName: 'text-rose-800',
      icon: 'expiry' as IconName,
    },
    {
      key: 'stock',
      eyebrow: 'LOW STOCK',
      value: isLoading ? '...' : String(summary?.lowStockCount ?? 0),
      label: 'أصناف عند حد الطلب وتحتاج متابعة مخزنية',
      className: 'min-h-[190px] rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]',
      eyebrowClassName: 'text-amber-200/80',
      valueClassName: 'text-white',
      labelClassName: 'text-stone-300',
      icon: 'stock' as IconName,
    },
      {
        key: 'suppliers-debt',
        eyebrow: 'SUPPLIER DEBT',
        value: isLoading ? '...' : suppliersDebt === null ? '...' : formatMoney(suppliersDebt, 'IQD'),
        label: 'إجمالي المبالغ المستحقة للموردين',
        className: 'min-h-[190px] rounded-[28px] border border-amber-300 bg-amber-50/90 p-5 shadow-[0_24px_80px_rgba(180,83,9,0.10)] backdrop-blur-xl',
        eyebrowClassName: 'text-amber-700',
        valueClassName: 'text-amber-900',
        labelClassName: 'text-stone-600',
        icon: 'cash' as IconName,
      },
  ] as const

  return (
    <main className="relative isolate min-h-[calc(100vh-2rem)] overflow-hidden pb-14 text-stone-900">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(244,239,227,0.72)_0%,rgba(248,245,239,0.86)_42%,rgba(244,239,227,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 bg-[radial-gradient(circle_at_top,_rgba(13,148,136,0.14),_transparent_34%),radial-gradient(circle_at_85%_10%,_rgba(245,158,11,0.18),_transparent_26%),radial-gradient(circle_at_12%_78%,_rgba(255,255,255,0.42),_transparent_18%)]" />
      <div className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
        <header className="rounded-[32px] border border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,245,239,0.92))] px-6 py-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-7">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
            <div className="max-w-3xl">
              <h1 className="mt-3 font-display text-4xl font-black text-stone-950 sm:text-5xl">صفحة التنقل السريع</h1>
              <p className="mt-4 text-base leading-8 text-stone-700">
                هذه الصفحة مصممة كلوحة دخول حديثة وغنية بالمعلومات. ستجد ملخصاً سريعاً لصلاحياتك، ثم بطاقات دخول واضحة ومجمعة حسب طبيعة العمل داخل النظام.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-800">مدخل سريع موحّد</span>
                <span className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-black text-stone-700">بطاقات أفقية</span>
                <span className="rounded-full border border-stone-200 bg-white/90 px-4 py-2 text-sm font-black text-stone-700">حسب الصلاحيات الفعلية</span>
              </div>
            </div>

            <div className="h-full rounded-[30px] border border-teal-200/80 bg-[linear-gradient(135deg,rgba(240,253,250,0.98),rgba(255,255,255,0.94))] px-5 py-5 shadow-[0_20px_60px_rgba(13,148,136,0.10)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.2em] text-teal-700">ملف المستخدم الحالي</p>
                  <h2 className="mt-3 font-display text-4xl font-black text-stone-950">{session?.employee.name || 'مستخدم النظام'}</h2>
                  <p className="mt-2 text-sm font-bold text-stone-600">{currentRoleLabel}</p>
                </div>
                <button
                  className="rounded-full border border-rose-300 bg-white/90 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-500 hover:bg-rose-50"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  type="button"
                >
                  {isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/90 bg-white/90 px-4 py-4 shadow-sm">
                  <p className="text-xs font-black tracking-[0.18em] text-stone-500">الرقم الوظيفي</p>
                  <p className="mt-2 text-lg font-black text-stone-950">{session?.employee.employeeNo || '-'}</p>
                </div>
                <div className="rounded-[22px] border border-white/90 bg-white/90 px-4 py-4 shadow-sm">
                  <p className="text-xs font-black tracking-[0.18em] text-stone-500">وقت الدخول</p>
                  <p className="mt-2 text-lg font-black text-stone-950">{session ? formatSessionDate(session.loggedInAt) : '-'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/90 bg-white/90 px-4 py-4 shadow-sm">
                <p className="text-xs font-black tracking-[0.18em] text-stone-500">بيانات المتجر الحالية</p>
                <p className="mt-2 text-base font-black text-stone-950">{storeName}</p>
                <p className="mt-2 text-sm leading-7 text-stone-600">{viewerSettings?.address || viewerSettings?.primaryPhone || 'يمكنك استخدام هذه الصفحة كنقطة دخول سريعة إلى جميع الشاشات المتاحة لك.'}</p>
              </div>
            </div>
          </div>
        </header>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        {canViewSummaryCards ? (
          <section className="mt-6">
            <div className="rounded-[28px] border border-white/75 bg-white/82 p-4 shadow-[0_16px_50px_rgba(77,60,27,0.08)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-black tracking-[0.2em] text-stone-500">SUMMARY FILTER</p>
                  <h2 className="mt-1 font-display text-2xl font-black text-stone-950">الفترة الحالية: {salesPeriodLabel}</h2>
                  <p className="mt-2 text-sm text-stone-600">بطاقات المبيعات والربحية والمرتجعات تتبع هذا الفلتر. بطاقات المخزون والصلاحية تبقى لحظية.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(['today', 'month', 'year', 'all'] as const).map((preset) => (
                    <button
                      key={preset}
                      className={`rounded-full border px-4 py-2 text-sm font-black transition ${filter.preset === preset ? 'border-teal-600 bg-teal-600 text-white' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}
                      onClick={() => handleSummaryPresetChange(preset)}
                      type="button"
                    >
                      {getDashboardFilterLabel(preset)}
                    </button>
                  ))}
                  <input
                    className="h-11 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 outline-none focus:border-teal-500"
                    type="date"
                    value={filter.startDate}
                    onChange={(event) => setFilter((current) => ({ ...current, startDate: event.target.value, preset: 'custom' }))}
                  />
                  <input
                    className="h-11 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700 outline-none focus:border-teal-500"
                    type="date"
                    value={filter.endDate}
                    onChange={(event) => setFilter((current) => ({ ...current, endDate: event.target.value, preset: 'custom' }))}
                  />
                  <button
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
                    onClick={applyCustomSummaryFilter}
                    type="button"
                  >
                    تطبيق الفترة
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <article key={card.key} className={card.className}>
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-sm font-black tracking-[0.2em] ${card.eyebrowClassName}`}>{card.eyebrow}</p>
                    <div className={`rounded-2xl p-3 ${card.key === 'stock' ? 'bg-white/10 text-white' : card.key === 'expiry' ? 'bg-white/60 text-rose-700' : 'bg-stone-100 text-stone-700'}`}>
                      <IconGlyph icon={card.icon} />
                    </div>
                  </div>
                  <p className={`mt-3 font-display text-4xl font-black ${card.valueClassName}`}>{card.value}</p>
                  <p className={`mt-2 text-sm ${card.labelClassName}`}>{card.label}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 rounded-[32px] border border-white/75 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">FAST ENTRY CARDS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">بطاقات الدخول السريع</h2>
              <p className="mt-2 text-sm leading-7 text-stone-600">التصفيط هنا أفقي داخل كل مجموعة، مع تقسيم واضح يساعد على الوصول السريع دون ازدحام بصري.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-black tracking-[0.14em] text-stone-500">
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2">أفقي</span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2">دخول مباشر</span>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-2">غني بالمعلومات</span>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {groupedLinks.map((group) => {
              const presentation = categoryPresentation[group.category]

              return (
                <section key={group.category} className={`rounded-[28px] border p-4 sm:p-5 ${presentation.stripClassName}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.2em] text-stone-500">{group.category}</p>
                      <h3 className="mt-2 font-display text-2xl font-black text-stone-950">{presentation.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-600">{presentation.description}</p>
                    </div>
                    <div className="rounded-full border border-white/80 bg-white/85 px-4 py-2 text-sm font-black text-stone-700">{group.items.length} بطاقات</div>
                  </div>

                  <div className="mt-4 overflow-x-auto overflow-y-hidden pb-2">
                    <div className="flex min-w-max gap-4" dir="rtl">
                      {group.items.map((item, index) => {
                        const meta = routeMetaByPath[item.to] ?? routeMetaByPath['/']
                        const isActive = location.pathname === item.to
                        const isFeatured = featuredRoutePaths.has(item.to)

                        return (
                          <Link
                            key={item.to}
                            className={[
                              'group shrink-0 rounded-[28px] border p-5 shadow-[0_12px_40px_rgba(120,98,61,0.08)] transition hover:-translate-y-1',
                              isFeatured ? 'w-[360px] sm:w-[400px] xl:w-[440px]' : 'w-[280px] sm:w-[320px] xl:w-[340px]',
                              isActive ? 'border-stone-950 bg-stone-950 text-white' : meta.accentClassName,
                            ].join(' ')}
                            to={item.to}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={[
                                  'rounded-2xl p-3',
                                  isActive ? 'bg-white/12 text-white' : 'bg-white/90 text-stone-700',
                                ].join(' ')}>
                                  <IconGlyph icon={meta.icon} />
                                </div>
                                <span className={[
                                  'rounded-full px-3 py-1 text-[11px] font-black tracking-[0.18em]',
                                  isActive ? 'bg-white/14 text-white' : meta.badgeClassName,
                                ].join(' ')}>
                                  {meta.eyebrow}
                                </span>
                              </div>
                              <span className={[
                                'rounded-full px-3 py-1 text-[11px] font-black tracking-[0.18em]',
                                isActive ? 'bg-teal-500 text-white' : 'bg-white/90 text-stone-600',
                              ].join(' ')}>
                                {isFeatured ? 'أساسي' : String(index + 1).padStart(2, '0')}
                              </span>
                            </div>

                            <h4 className={`mt-6 font-display font-black ${isFeatured ? 'text-[2.2rem]' : 'text-3xl'}`}>{item.label}</h4>
                            <p className={[
                              'mt-3 text-sm leading-7',
                              isActive ? 'text-stone-200' : 'text-stone-700',
                            ].join(' ')}>
                              {item.description}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className={[
                                'rounded-full px-3 py-2 text-xs font-black',
                                isActive ? 'bg-white/10 text-white' : 'bg-white/85 text-stone-700',
                              ].join(' ')}>
                                فئة {group.category}
                              </span>
                              <span className={[
                                'rounded-full px-3 py-2 text-xs font-black',
                                isActive ? 'bg-white/10 text-white' : 'bg-white/85 text-stone-700',
                              ].join(' ')}>
                                {isFeatured ? 'بوابة موصى بها' : 'دخول مباشر'}
                              </span>
                            </div>

                            <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm font-black">
                              <span className={isActive ? 'text-stone-300' : 'text-stone-500'}>مسار {group.category}</span>
                              <span className={isActive ? 'text-white' : 'text-stone-950'}>فتح الشاشة</span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        </section>

        <section className="mt-6 grid items-stretch gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="h-full rounded-[32px] border border-white/75 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">RECOMMENDED START</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">ابدأ من هنا</h2>
                <p className="mt-2 text-sm leading-7 text-stone-600">هذه الاختصارات مرشحة حسب دورك الحالي لتصل إلى أهم الشاشات بأقل عدد من الخطوات.</p>
              </div>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/">العودة إلى الرئيسية</Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recommendedLinks.map((item) => {
                const meta = routeMetaByPath[item.to] ?? routeMetaByPath['/']

                return (
                  <Link key={item.to} className={`flex min-h-[220px] flex-col rounded-[24px] border p-4 shadow-sm transition hover:-translate-y-1 ${meta.accentClassName}`} to={item.to}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black tracking-[0.18em] text-stone-500">{meta.eyebrow}</p>
                      <div className="rounded-2xl bg-white/90 p-3 text-stone-700">
                        <IconGlyph icon={meta.icon} />
                      </div>
                    </div>
                    <h3 className="mt-2 font-display text-2xl font-black text-stone-950">{item.label}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{item.description}</p>
                    <div className="mt-auto pt-4 text-sm font-black text-stone-700">الانتقال المباشر</div>
                  </Link>
                )
              })}
            </div>
          </article>

          <article className="h-full rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">ACCESS MAP</p>
            <h2 className="mt-2 font-display text-3xl font-black">خريطة الوصول الحالية</h2>
            <p className="mt-3 text-sm leading-7 text-stone-300">كل شارة تمثل شاشة متاحة لك الآن. تغيّر الصلاحيات سيغيّر محتوى هذه الصفحة تلقائياً، مع بقاء بطاقات الدخول مرتبطة بنفس المصدر.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {cardLinks.map((item) => {
                const meta = routeMetaByPath[item.to] ?? routeMetaByPath['/']

                return <span key={item.to} className={`rounded-full px-4 py-2 text-sm font-black ${meta.badgeClassName}`}>{item.label}</span>
              })}
            </div>
          </article>
        </section>

        <section className="mt-6 grid items-stretch gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="h-full rounded-[32px] border border-white/75 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">OPERATIONS SNAPSHOT</p>
            <h2 className="mt-2 font-display text-3xl font-black text-stone-950">لقطة تشغيلية سريعة</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-stone-200 bg-stone-50/85 p-4">
                <p className="text-xs font-black tracking-[0.18em] text-stone-500">إجمالي الأصناف</p>
                <p className="mt-2 font-display text-3xl font-black text-stone-950">{isLoading ? '...' : summary?.productsCount ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-stone-200 bg-stone-50/85 p-4">
                <p className="text-xs font-black tracking-[0.18em] text-stone-500">قيمة المخزون</p>
                <p className="mt-2 font-display text-3xl font-black text-stone-950">{isLoading ? '...' : formatMoney(summary?.inventoryValue ?? 0, 'IQD')}</p>
              </div>
              <div className="rounded-[24px] border border-stone-200 bg-stone-50/85 p-4 sm:col-span-2">
                <p className="text-xs font-black tracking-[0.18em] text-stone-500">وضع التخزين</p>
                <p className="mt-2 text-base font-black text-stone-950">{isLoading ? 'جارٍ التحميل...' : summary?.storage.message ?? 'لا توجد بيانات حالياً.'}</p>
              </div>
            </div>
          </article>

          <article className="h-full rounded-[32px] border border-rose-200/80 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_55%,#fff1f2_100%)] p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">ATTENTION ITEMS</p>
            <h2 className="mt-2 font-display text-3xl font-black text-stone-950">ما يحتاج انتباهاً الآن</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(summary?.lowStockProducts ?? []).slice(0, 4).map((product) => (
                <Link key={product.id} className="rounded-[24px] border border-white/90 bg-white/85 p-4 transition hover:-translate-y-1 hover:border-amber-300" to="/inventory">
                  <p className="text-xs font-black tracking-[0.18em] text-amber-700">LOW STOCK</p>
                  <h3 className="mt-2 font-display text-xl font-black text-stone-950">{product.name}</h3>
                  <p className="mt-2 text-sm leading-7 text-stone-600">المتوفر: {product.stockQty} | حد الطلب: {product.minStock}</p>
                </Link>
              ))}
              {!isLoading && (summary?.lowStockProducts ?? []).length === 0 ? <div className="rounded-[24px] border border-white/90 bg-white/85 p-4 text-sm font-bold text-stone-600 sm:col-span-2">لا توجد أصناف منخفضة حالياً.</div> : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}