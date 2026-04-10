import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { useEmployeeSession } from '../lib/auth'
import { formatMoney } from '../lib/currency'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  createExpense,
  createExpenseCategory,
  fetchExpenseCategories,
  fetchExpenses,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryKind,
  type ExpensePaymentMethod,
} from '../lib/expenses-api'

const emptyCategoryForm = {
  name: '',
  code: '',
  kind: 'operating' as ExpenseCategoryKind,
  description: '',
}

const emptyExpenseForm = {
  expenseDate: new Date().toISOString().slice(0, 10),
  categoryId: '',
  amountIqd: '',
  paymentMethod: 'cash' as ExpensePaymentMethod,
  beneficiaryName: '',
  notes: '',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getCategoryKindLabel(kind: ExpenseCategoryKind) {
  if (kind === 'payroll') {
    return 'رواتب'
  }

  if (kind === 'service') {
    return 'خدمات'
  }

  if (kind === 'supplier') {
    return 'موردون'
  }

  if (kind === 'operating') {
    return 'تشغيلي'
  }

  return 'أخرى'
}

function getPaymentMethodLabel(method: ExpensePaymentMethod) {
  return method === 'bank' ? 'تحويل/بنك' : 'نقدي'
}

function getReferenceLabel(expense: Expense) {
  if (expense.referenceType === 'supplier-payment') {
    return 'مولد تلقائياً من دفعة مورد'
  }

  if (expense.referenceType === 'employee-compensation') {
    if (expense.notes?.includes('تسديد راتب شهر')) {
      return 'مولد تلقائياً من تسديد راتب شهري'
    }

    if (expense.notes?.includes('سلفة')) {
      return 'مولد تلقائياً من سلفة موظف'
    }

    return 'مولد تلقائياً من دفعة أو تسوية رواتب'
  }

  return 'إدخال يدوي'
}

function getReferenceAccentClasses(expense: Expense) {
  if (expense.referenceType === 'supplier-payment') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (expense.referenceType === 'employee-compensation') {
    if (expense.notes?.includes('تسديد راتب شهر')) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    }

    if (expense.notes?.includes('سلفة')) {
      return 'border-amber-200 bg-amber-50 text-amber-800'
    }

    return 'border-rose-200 bg-rose-50 text-rose-800'
  }

  return 'border-stone-200 bg-stone-100 text-stone-700'
}

function getKindBadgeClasses(kind: ExpenseCategoryKind) {
  if (kind === 'payroll') {
    return 'border-rose-200 bg-rose-50 text-rose-800'
  }

  if (kind === 'service') {
    return 'border-sky-200 bg-sky-50 text-sky-800'
  }

  if (kind === 'supplier') {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }

  if (kind === 'operating') {
    return 'border-teal-200 bg-teal-50 text-teal-800'
  }

  return 'border-stone-200 bg-stone-100 text-stone-700'
}

export function ExpensesPage() {
  const { session } = useEmployeeSession()
  const isAccountant = session?.employee.role === 'accountant'
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [isSavingExpense, setIsSavingExpense] = useState(false)

  async function loadExpensesData() {
    setIsLoading(true)

    try {
      const [nextCategories, nextExpenses] = await Promise.all([
        fetchExpenseCategories(),
        fetchExpenses(),
      ])
      setCategories(nextCategories)
      setExpenses(nextExpenses)
      setExpenseForm((current) => ({
        ...current,
        categoryId: current.categoryId && nextCategories.some((category) => category.id === current.categoryId && category.isActive && category.kind !== 'payroll')
          ? current.categoryId
          : nextCategories.find((category) => category.isActive && category.kind !== 'payroll')?.id || '',
      }))
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات المصروفات.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadExpensesData()
  }, [])

  const totalExpensesIqd = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amountIqd, 0), [expenses])
  const payrollTotalIqd = useMemo(() => expenses.filter((expense) => expense.categoryKind === 'payroll').reduce((sum, expense) => sum + expense.amountIqd, 0), [expenses])
  const supplierTotalIqd = useMemo(() => expenses.filter((expense) => expense.categoryKind === 'supplier').reduce((sum, expense) => sum + expense.amountIqd, 0), [expenses])
  const activeCategoriesCount = useMemo(() => categories.filter((category) => category.isActive).length, [categories])
  const manualExpenseCategories = useMemo(
    () => categories.filter((category) => category.isActive && category.kind !== 'payroll'),
    [categories],
  )
  const topCategories = useMemo(() => {
    const totals = new Map<string, { label: string; total: number }>()

    for (const expense of expenses) {
      const current = totals.get(expense.categoryId) ?? { label: expense.categoryName, total: 0 }
      current.total += expense.amountIqd
      totals.set(expense.categoryId, current)
    }

    return [...totals.values()].sort((left, right) => right.total - left.total).slice(0, 4)
  }, [expenses])

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSavingCategory(true)

    try {
      await createExpenseCategory({
        name: categoryForm.name,
        code: categoryForm.code,
        kind: categoryForm.kind,
        description: categoryForm.description || undefined,
      })
      setCategoryForm(emptyCategoryForm)
      setMessage('تمت إضافة فئة المصروف بنجاح.')
      await loadExpensesData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر إنشاء فئة المصروف.'))
    } finally {
      setIsSavingCategory(false)
    }
  }

  async function handleCreateExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSavingExpense(true)

    try {
      await createExpense({
        expenseDate: expenseForm.expenseDate,
        categoryId: expenseForm.categoryId,
        amountIqd: Number(expenseForm.amountIqd),
        paymentMethod: expenseForm.paymentMethod,
        beneficiaryName: expenseForm.beneficiaryName || undefined,
        notes: expenseForm.notes || undefined,
      })
      setExpenseForm((current) => ({
        ...emptyExpenseForm,
        expenseDate: current.expenseDate,
        categoryId: current.categoryId,
      }))
      setMessage('تم تسجيل المصروف بنجاح.')
      await loadExpensesData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تسجيل المصروف.'))
    } finally {
      setIsSavingExpense(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPENSES</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">{isAccountant ? 'مركز المحاسب والمصروفات' : 'المصروفات التشغيلية'}</h1>
              <p className="mt-2 text-sm text-stone-600">{isAccountant ? 'واجهة مالية مركزة لمراجعة المصروفات والرواتب اليومية، مع انتقال سريع إلى تقارير الرواتب وملفات الموظفين.' : 'دفتر مصروفات موحد يعرض المصروفات اليدوية مع القيود التلقائية الواردة من الموردين والرواتب دون الحاجة إلى صرف يدوي من هذه الشاشة.'}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadExpensesData()}
                type="button"
              >
                تحديث البيانات
              </button>
              {session?.employee.role === 'admin' ? <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/dashboard">
                لوحة التشغيل
              </Link> : null}
              {session?.employee.role === 'admin' ? <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-amber-500 hover:text-amber-700" to="/purchases">
                المشتريات
              </Link> : null}
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-rose-500 hover:text-rose-700" to="/payroll-report">
                تقرير الرواتب
              </Link>
              {session?.employee.role === 'admin' ? <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500 hover:text-stone-950" to="/settings">
                الإعدادات
              </Link> : null}
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/">
                الرئيسية
              </Link>
            </div>
          </div>
        </header>

        {isAccountant ? (
          <section className="mt-4 rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(255,255,255,0.92))] p-5 shadow-[0_12px_40px_rgba(16,185,129,0.10)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-emerald-700">ACCOUNTANT FLOW</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">المسار المالي المختصر</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-700">
                  من هنا يمكنك تسجيل المصروفات، مراجعة قيد الرواتب، والانتقال بسرعة إلى ملفات الموظفين المالية دون الدخول إلى لوحات الإدارة العامة.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-600" to="/payroll-report">
                  تقرير الرواتب
                </Link>
                <Link className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/employees">
                  ملفات الموظفين
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-rose-700">TOTAL</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(totalExpensesIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي المصروفات المسجلة حالياً</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-sky-700">PAYROLL</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(payrollTotalIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">المصروفات المصنفة كرواتب ومستحقات</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">SUPPLIERS</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(supplierTotalIqd, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">المصروفات المصنفة كتسديدات موردين</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-teal-700">CATEGORIES</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{activeCategoriesCount}</p>
            <p className="mt-2 text-sm text-stone-600">فئات مصروفات فعالة وجاهزة للاستخدام</p>
          </article>
        </section>

        <section className="mt-6 rounded-[32px] border border-amber-200 bg-[linear-gradient(135deg,rgba(217,119,6,0.10),rgba(255,255,255,0.92))] p-6 shadow-[0_24px_80px_rgba(217,119,6,0.10)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">CASH REVENUES</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">نقلت حركة رأس المال إلى شاشة مستقلة</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-700">
                إدارة صندوق الإيرادات وصندوق رأس المال وكشف حساب المساهمين أصبحت الآن في صفحة منفصلة حتى تبقى شاشة المصروفات مخصصة للصرف التشغيلي فقط.
              </p>
            </div>

            <Link className="inline-flex items-center justify-center rounded-2xl bg-amber-700 px-6 py-3 text-base font-black text-white transition hover:bg-amber-600" to="/cash-revenues">
              فتح الايرادات النقدية
            </Link>
          </div>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" />

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-6">
            <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-teal-700">NEW EXPENSE</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">تسجيل مصروف</h2>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleCreateExpense}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-black text-stone-800">
                    تاريخ المصروف
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                      type="date"
                      value={expenseForm.expenseDate}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))}
                    />
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    الفئة
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                      value={expenseForm.categoryId}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, categoryId: event.target.value }))}
                    >
                      {manualExpenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs font-bold text-stone-500">تم إلغاء صرف الرواتب والسلف من شاشة المصروفات. استخدم شاشة الموظفين والرواتب الشهرية.</p>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-black text-stone-800">
                    المبلغ بالدينار
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                      inputMode="decimal"
                      placeholder="مثال: 25000"
                      value={expenseForm.amountIqd}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, amountIqd: event.target.value.replace(/[^\d.]/g, '') }))}
                    />
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    وسيلة الدفع
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                      value={expenseForm.paymentMethod}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value as ExpensePaymentMethod }))}
                    >
                      <option value="cash">نقدي</option>
                      <option value="bank">تحويل / بنك</option>
                    </select>
                  </label>
                </div>

                <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
                  سيتم خصم هذا المصروف تلقائياً من FINAL CASH بحسب الرصيد النقدي النهائي المتاح.
                </div>

                <label className="block text-sm font-black text-stone-800">
                  الجهة المستفيدة
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                    placeholder="مثال: شركة الكهرباء أو اسم الموظف"
                    value={expenseForm.beneficiaryName}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, beneficiaryName: event.target.value }))}
                  />
                </label>

                <label className="block text-sm font-black text-stone-800">
                  ملاحظات
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-stone-900 outline-none focus:border-teal-500"
                    placeholder="سبب المصروف أو تفاصيل إضافية"
                    value={expenseForm.notes}
                    onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>

                <button
                  className="rounded-2xl bg-teal-700 px-5 py-3 text-base font-black text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-stone-400"
                  disabled={isSavingExpense || !expenseForm.categoryId || !expenseForm.amountIqd}
                  type="submit"
                >
                  {isSavingExpense ? 'جارٍ الحفظ...' : 'حفظ المصروف'}
                </button>
              </form>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-sky-700">CATEGORIES</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">فئات المصروفات</h2>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleCreateCategory}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-black text-stone-800">
                    اسم الفئة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                      value={categoryForm.name}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label className="block text-sm font-black text-stone-800">
                    الرمز الداخلي
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-left text-stone-900 outline-none focus:border-teal-500"
                      dir="ltr"
                      placeholder="example-code"
                      value={categoryForm.code}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="block text-sm font-black text-stone-800">
                  النوع
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-stone-900 outline-none focus:border-teal-500"
                    value={categoryForm.kind}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, kind: event.target.value as ExpenseCategoryKind }))}
                  >
                    <option value="operating">تشغيلي</option>
                    <option value="service">خدمات</option>
                    <option value="supplier">موردون</option>
                    <option value="other">أخرى</option>
                  </select>
                  <p className="mt-2 text-xs font-bold text-stone-500">فئات الرواتب تُدار تلقائياً من شاشة الموظفين ولا تُنشأ يدوياً هنا.</p>
                </label>

                <label className="block text-sm font-black text-stone-800">
                  وصف مختصر
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-right text-stone-900 outline-none focus:border-teal-500"
                    value={categoryForm.description}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <button
                  className="rounded-2xl border border-stone-300 px-5 py-3 text-base font-black text-stone-800 transition hover:border-teal-500 hover:text-teal-700 disabled:cursor-not-allowed disabled:text-stone-400"
                  disabled={isSavingCategory || !categoryForm.name.trim() || !categoryForm.code.trim()}
                  type="submit"
                >
                  {isSavingCategory ? 'جارٍ الإضافة...' : 'إضافة فئة'}
                </button>
              </form>

              <div className="mt-5 space-y-3">
                {categories.map((category) => (
                  <article key={category.id} className="rounded-2xl border border-stone-200 bg-stone-50/90 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-950">{category.name}</p>
                        <p className="mt-1 text-sm text-stone-600" dir="ltr">{category.code}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black ${getKindBadgeClasses(category.kind)}`}>{getCategoryKindLabel(category.kind)}</span>
                    </div>
                    {category.description ? <p className="mt-3 text-sm leading-7 text-stone-600">{category.description}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section className="rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">LEDGER</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">سجل المصروفات</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{expenses.length} سجل</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {topCategories.map((entry) => (
                <div key={entry.label} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <p className="text-sm font-bold text-stone-600">{entry.label}</p>
                  <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(entry.total, 'IQD')}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل المصروفات...</div> : null}
              {!isLoading && !expenses.length ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد مصروفات مسجلة بعد.</div> : null}
              {!isLoading ? expenses.map((expense) => (
                <article key={expense.id} className="rounded-[24px] border border-stone-200 bg-stone-50/90 px-5 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-2xl font-black text-stone-950">{expense.expenseNo}</p>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getKindBadgeClasses(expense.categoryKind)}`}>{getCategoryKindLabel(expense.categoryKind)}</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getReferenceAccentClasses(expense)}`}>{getReferenceLabel(expense)}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-stone-700">{expense.categoryName}</p>
                      <p className="mt-1 text-sm text-stone-600">{expense.beneficiaryName || 'بدون جهة مستفيدة محددة'} • {getPaymentMethodLabel(expense.paymentMethod)}</p>
                      {expense.referenceId ? <p className="mt-1 text-xs font-black text-stone-500">المرجع الداخلي: {expense.referenceId}</p> : null}
                    </div>

                    <div className="text-left">
                      <p className="font-display text-3xl font-black text-rose-700">{formatMoney(expense.amountIqd, 'IQD')}</p>
                      <p className="mt-1 text-xs font-bold text-stone-500">{expense.expenseDate}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
                    <p>سجل بواسطة: <span className="font-bold text-stone-800">{expense.createdByEmployeeName}</span></p>
                    <p>وقت الإدخال: <span className="font-bold text-stone-800">{formatDate(expense.createdAt)}</span></p>
                  </div>

                  {expense.notes ? <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm leading-7 text-stone-700">{expense.notes}</p> : null}
                </article>
              )) : null}
            </div>
          </section>

        </section>
      </div>
    </main>
  )
}