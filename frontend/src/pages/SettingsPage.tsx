import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { useSystemSettings } from '../lib/system-settings'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  fetchStorageInfo,
  fetchSystemSettings,
  resetAllSystemData,
  systemPermissionKeys,
  updateSystemSettings,
  type RolePermissions,
  type StorageInfo,
  type SystemPermission,
  type SystemSettings,
} from '../lib/system-settings-api'

const permissionLabels: Record<SystemPermission, string> = {
  dashboard: 'لوحة التشغيل',
  inventory: 'المخزون',
  batches: 'الدفعات والصلاحية',
  purchases: 'المشتريات',
  expenses: 'المصروفات',
  payroll: 'الرواتب',
  employees: 'ملفات الموظفين',
  customers: 'العملاء',
  sales: 'المبيعات والكاشير',
  shifts: 'الورديات',
  suppliers: 'الموردون',
  'system-settings': 'إعدادات النظام',
}

const roleLabels = {
  admin: 'المدير',
  cashier: 'الكاشير',
  inventory: 'المخزن',
  accountant: 'المحاسب',
} as const

function createEmptyState(): Omit<SystemSettings, 'updatedAt'> {
  return {
    storeName: 'Super M2',
    legalName: '',
    primaryPhone: '',
    secondaryPhone: '',
    whatsapp: '',
    email: '',
    address: '',
    invoiceFooter: '',
    defaultDiscountPercent: 0,
    maxManualDiscountPercent: 15,
    allowPriceDiscounts: false,
    rolePermissions: {
      admin: [...systemPermissionKeys],
      cashier: [],
      inventory: [],
      accountant: [],
    },
  }
}

export function SettingsPage() {
  const { refresh } = useSystemSettings()
  const [form, setForm] = useState<Omit<SystemSettings, 'updatedAt'>>(createEmptyState())
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)

  async function loadSettings() {
    setIsLoading(true)

    try {
      const [settings, storage] = await Promise.all([fetchSystemSettings(), fetchStorageInfo()])
      setForm({
        storeName: settings.storeName,
        legalName: settings.legalName || '',
        primaryPhone: settings.primaryPhone || '',
        secondaryPhone: settings.secondaryPhone || '',
        whatsapp: settings.whatsapp || '',
        email: settings.email || '',
        address: settings.address || '',
        invoiceFooter: settings.invoiceFooter || '',
        defaultDiscountPercent: settings.defaultDiscountPercent,
        maxManualDiscountPercent: settings.maxManualDiscountPercent,
        allowPriceDiscounts: settings.allowPriceDiscounts,
        rolePermissions: settings.rolePermissions,
      })
      setStorageInfo(storage)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل الإعدادات.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()
  }, [])

  function togglePermission(role: keyof RolePermissions, permission: SystemPermission) {
    if (role === 'admin') {
      return
    }

    setForm((current) => {
      const currentPermissions = current.rolePermissions[role]
      const nextPermissions = currentPermissions.includes(permission)
        ? currentPermissions.filter((entry) => entry !== permission)
        : [...currentPermissions, permission]

      return {
        ...current,
        rolePermissions: {
          ...current.rolePermissions,
          [role]: nextPermissions,
        },
      }
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)

    try {
      await updateSystemSettings(form)
      await refresh()
      setMessage('تم حفظ إعدادات النظام بنجاح.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ إعدادات النظام.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleResetAllData() {
    const confirmed = window.confirm('سيتم حذف جميع البيانات المدخلة وإرجاع النظام إلى الحالة الأساسية. هل تريد المتابعة؟')

    if (!confirmed) {
      return
    }

    setIsResetting(true)

    try {
      const result = await resetAllSystemData()
      try {
        await loadSettings()
      } catch {
        // If the reset recreated the active admin account, the current token may need a fresh login.
      }

      setMessage(result.storage.driver === 'memory'
        ? `${result.message} إذا طُلب منك تسجيل الدخول مرة أخرى فهذا طبيعي لأن التخزين الحالي مؤقت.`
        : result.message)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر مسح جميع البيانات.'))
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-stone-700">SYSTEM SETTINGS</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">إعدادات النظام</h1>
              <p className="mt-2 text-sm text-stone-600">مركز موحد لاسم السوبر ماركت، التواصل، الخصومات، وصلاحيات الأدوار داخل النظام.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500" onClick={() => void loadSettings()} type="button">
                تحديث البيانات
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/dashboard">
                لوحة التشغيل
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-amber-500 hover:text-amber-700" to="/">
                الرئيسية
              </Link>
            </div>
          </div>
        </header>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900" />

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-sky-700">STORAGE</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">حالة التخزين</h2>
                <p className="mt-2 text-sm text-stone-600">
                  {storageInfo?.message ?? 'جارٍ فحص حالة التخزين الحالية.'}
                </p>
              </div>

              <div className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-black ${storageInfo?.driver === 'postgres' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                {storageInfo?.driver === 'postgres' ? 'PostgreSQL دائم' : 'ذاكرة مؤقتة'}
              </div>
            </div>

            {storageInfo?.driver === 'memory' ? (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
                عند التشغيل الحالي، البيانات محفوظة داخل ذاكرة الخادم فقط. لذلك أي إيقاف لـ <span dir="ltr">start-live-preview</span> أو إعادة تشغيل للخلفية سيمسحها تلقائيًا.
              </p>
            ) : null}
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">STORE PROFILE</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">بيانات السوبر ماركت</h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-black text-stone-800">
                الاسم التجاري
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={form.storeName} onChange={(event) => setForm((current) => ({ ...current, storeName: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                الاسم القانوني
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={form.legalName || ''} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                الهاتف الرئيسي
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={form.primaryPhone || ''} onChange={(event) => setForm((current) => ({ ...current, primaryPhone: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                هاتف إضافي
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={form.secondaryPhone || ''} onChange={(event) => setForm((current) => ({ ...current, secondaryPhone: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                واتساب
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" value={form.whatsapp || ''} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                البريد الإلكتروني
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-left" dir="ltr" value={form.email || ''} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block text-sm font-black text-stone-800">
                العنوان
                <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right" value={form.address || ''} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                تذييل الفاتورة أو الرسالة الختامية
                <textarea className="mt-2 min-h-20 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right" value={form.invoiceFooter || ''} onChange={(event) => setForm((current) => ({ ...current, invoiceFooter: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">PRICING</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الخصومات والسياسة السعرية</h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-black text-stone-800">
                الخصم الافتراضي على الأسعار %
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="decimal" value={String(form.defaultDiscountPercent)} onChange={(event) => setForm((current) => ({ ...current, defaultDiscountPercent: Number(event.target.value || 0) }))} />
              </label>
              <label className="block text-sm font-black text-stone-800">
                الحد الأعلى للخصم اليدوي %
                <input className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right" inputMode="decimal" value={String(form.maxManualDiscountPercent)} onChange={(event) => setForm((current) => ({ ...current, maxManualDiscountPercent: Number(event.target.value || 0) }))} />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm font-black text-stone-800">
              <input checked={form.allowPriceDiscounts} onChange={(event) => setForm((current) => ({ ...current, allowPriceDiscounts: event.target.checked }))} type="checkbox" />
              تفعيل الخصومات السعرية العامة داخل النظام
            </label>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">PERMISSIONS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">صلاحيات الأدوار</h2>
              <p className="mt-2 text-sm text-stone-600">صلاحيات المدير كاملة وثابتة، بينما يمكن إعادة توزيع صلاحيات الكاشير والمخزن والمحاسب من هنا.</p>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-right text-xs font-black tracking-[0.18em] text-stone-500">
                    <th className="px-3 py-2">الصلاحية</th>
                    <th className="px-3 py-2">المدير</th>
                    <th className="px-3 py-2">الكاشير</th>
                    <th className="px-3 py-2">المخزن</th>
                    <th className="px-3 py-2">المحاسب</th>
                  </tr>
                </thead>
                <tbody>
                  {systemPermissionKeys.map((permission) => (
                    <tr key={permission} className="rounded-2xl bg-stone-50 text-sm text-stone-800">
                      <td className="rounded-r-2xl px-3 py-3 font-black">{permissionLabels[permission]}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">ثابتة</span></td>
                      <td className="px-3 py-3"><input checked={form.rolePermissions.cashier.includes(permission)} onChange={() => togglePermission('cashier', permission)} type="checkbox" /></td>
                      <td className="px-3 py-3"><input checked={form.rolePermissions.inventory.includes(permission)} onChange={() => togglePermission('inventory', permission)} type="checkbox" /></td>
                      <td className="rounded-l-2xl px-3 py-3"><input checked={form.rolePermissions.accountant.includes(permission)} onChange={() => togglePermission('accountant', permission)} type="checkbox" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {(['admin', 'cashier', 'inventory', 'accountant'] as const).map((role) => (
                <article key={role} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <p className="text-sm font-black text-stone-900">{roleLabels[role]}</p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">
                    {(role === 'admin' ? systemPermissionKeys : form.rolePermissions[role]).map((permission) => permissionLabels[permission]).join('، ') || 'بدون صلاحيات'}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-rose-200 bg-rose-50/90 p-6 shadow-[0_24px_80px_rgba(120,28,48,0.08)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-rose-700">DANGER ZONE</p>
                <h2 className="mt-2 font-display text-3xl font-black text-rose-950">مسح جميع البيانات</h2>
                <p className="mt-2 max-w-3xl text-sm text-rose-900/80">
                  هذا الإجراء يحذف كل البيانات التشغيلية والمدخلة ويعيد النظام إلى القيم الأساسية فقط، بما في ذلك الأصناف الافتراضية وحساب المدير الافتراضي.
                </p>
              </div>

              <button className="rounded-2xl bg-rose-700 px-6 py-3 text-base font-black text-white transition hover:bg-rose-800 disabled:bg-rose-300" disabled={isLoading || isSaving || isResetting} onClick={() => void handleResetAllData()} type="button">
                {isResetting ? 'جارٍ المسح...' : 'مسح جميع البيانات'}
              </button>
            </div>
          </section>

          <div className="flex justify-end">
            <button className="rounded-2xl bg-stone-950 px-6 py-3 text-base font-black text-white transition hover:bg-stone-800 disabled:bg-stone-400" disabled={isSaving || isLoading} type="submit">
              {isSaving ? 'جارٍ الحفظ...' : 'حفظ إعدادات النظام'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}