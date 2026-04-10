import { Link } from 'react-router-dom'
import { useEmployeeSession } from '../lib/auth'
import { hasPermission } from '../lib/permissions'
import { useSystemSettings } from '../lib/system-settings'

const quickStats = [
  {
    value: '24/7',
    label: 'جاهزية نقاط البيع',
    detail: 'واجهة مصممة للمس وشاشات الكاشير والعمل أثناء الضغط.',
  },
  {
    value: 'FEFO',
    label: 'إدارة الصلاحية والدفعات',
    detail: 'تنبيهات انتهاء الصلاحية وتصريف تلقائي حسب الأقدم فالأحدث.',
  },
  {
    value: 'CENTRAL',
    label: 'إدارة مركزية وشبكة كاشير',
    detail: 'حاسبة إدارة مركزية واحدة مع نقاط بيع POS ترتبط بها عبر الشبكة السلكية أو اللاسلكية.',
  },
] as const

const modules = [
  {
    title: 'نقطة البيع POS',
    body: 'بيع سريع، باركود، باركود ميزان، فواتير حرارية، مرتجعات، وضريبة قيمة مضافة.',
  },
  {
    title: 'المخزون والمخازن',
    body: 'أصناف غير محدودة، دفعات وصلاحيات، جرد بالباركود، وحدات متعددة، وربط الفروع.',
  },
  {
    title: 'المشتريات والموردون',
    body: 'فواتير شراء، مرتجعات، تحديث تكلفة الصنف، وحسابات الموردين وإيصالات الاستلام.',
  },
  {
    title: 'الحسابات والمالية',
    body: 'خزائن، بنوك، مصروفات، أرباح، تقارير تشغيلية، وحماية صارمة ضد التلاعب.',
  },
  {
    title: 'الموظفون والصلاحيات',
    body: 'أدوار دقيقة للكاشير وأمين المخزن والمحاسب والمدير مع فصل واضح بين العرض والتعديل.',
  },
  {
    title: 'العملاء والتقارير',
    body: 'حسابات آجلة، تتبع المشتريات، أفضل الأصناف مبيعاً، والنواقص اليومية في المخزون.',
  },
] as const

const basketItems = [
  {
    name: 'جبنة بيضاء ميزان',
    meta: 'باركود ميزان 2400150562574 | وزن تقريبي 0.312 كجم',
    qty: '1',
    price: '5,625 د.ع',
  },
  {
    name: 'مياه معدنية 600 مل',
    meta: 'باركود 6281000010012 | مخزن الواجهة',
    qty: '3',
    price: '1,500 د.ع',
  },
  {
    name: 'خبز عربي كبير',
    meta: 'دفعة B-24 | صلاحية 05/04/2026',
    qty: '2',
    price: '3,000 د.ع',
  },
] as const

const milestones = [
  'صفحة رئيسية عربية بهوية بصرية واضحة ومسار تنقل للنظام.',
  'واجهة كاشير كاملة مع سلة بيع وحساب الضريبة والمرتجعات والبحث بالباركود.',
  'ربط الواجهة الخلفية وقاعدة البيانات ثم تفعيل العمل دون اتصال والمزامنة.',
  'لوحات التقارير، الفروع المتعددة، والمحاسبة المتقدمة وصلاحيات المستخدمين.',
] as const

const actionCardStyles = [
  'border-teal-200/80 hover:border-teal-400 hover:bg-teal-50/70',
  'border-emerald-200/80 hover:border-emerald-400 hover:bg-emerald-50/70',
  'border-sky-200/80 hover:border-sky-400 hover:bg-sky-50/70',
  'border-amber-200/80 hover:border-amber-400 hover:bg-amber-50/70',
  'border-rose-200/80 hover:border-rose-400 hover:bg-rose-50/70',
] as const

const accountantWorkflow = [
  {
    label: 'الايرادات النقدية',
    body: 'مراجعة صندوق الإيرادات ورأس المال مع كشف حساب المساهمين وتحرير الحركات.',
    to: '/cash-revenues',
  },
  {
    label: 'دفتر المصروفات',
    body: 'تسجيل المدفوعات اليومية ومراجعة القيود المالية المباشرة في شاشة واحدة.',
    to: '/expenses',
  },
  {
    label: 'تقرير الرواتب',
    body: 'مراجعة الاستحقاق والمدفوع والمتبقي لكل موظف حسب الشهر.',
    to: '/payroll-report',
  },
  {
    label: 'ملفات الموظفين',
    body: 'متابعة السلف والمكافآت والغيابات وتسوية الرواتب دون إدارة الحسابات الحساسة.',
    to: '/employees',
  },
] as const

export function HomePage() {
  const { session } = useEmployeeSession()
  const { viewerSettings, permissions } = useSystemSettings()
  const currentRole = session?.employee.role
  const isAccountant = currentRole === 'accountant'
  const storeName = viewerSettings?.storeName || 'Super M2'
  const actionCards = [
    hasPermission(permissions, 'dashboard') ? { label: 'لوحة التشغيل', body: 'مؤشرات المبيعات والتنبيهات والتشغيل اليومي.', to: '/dashboard' } : null,
    hasPermission(permissions, 'inventory') ? { label: 'لوحة المخزون', body: 'الأصناف والحركات والتنبيهات والرصيد الحالي.', to: '/inventory' } : null,
    hasPermission(permissions, 'batches') ? { label: 'شاشة الدفعات', body: 'مراقبة الصلاحيات والدفعات والتالف المتوقع.', to: '/batches' } : null,
    hasPermission(permissions, 'purchases') ? { label: 'شاشة المشتريات', body: 'استلام الموردين وتحديث التكلفة والأرصدة.', to: '/purchases' } : null,
    hasPermission(permissions, 'expenses') ? { label: 'الايرادات النقدية', body: 'صندوق الإيرادات ورأس المال وكشف حساب المساهمين في شاشة مستقلة.', to: '/cash-revenues' } : null,
    hasPermission(permissions, 'expenses') ? { label: 'المصروفات', body: 'تسجيل الرواتب والخدمات والمصروفات التشغيلية في سجل موحد.', to: '/expenses' } : null,
    hasPermission(permissions, 'payroll') ? { label: 'تقرير الرواتب', body: 'عرض مجمع للرواتب والسلف والمكافآت حسب الموظف والفترة.', to: '/payroll-report' } : null,
    hasPermission(permissions, 'sales') ? { label: 'سجل الفواتير', body: 'متابعة فواتير البيع والمزامنة والمرتجعات.', to: '/invoices' } : null,
    hasPermission(permissions, 'customers') ? { label: 'حسابات العملاء', body: 'الأرصدة والتسديدات والبيع الآجل.', to: '/customers' } : null,
    { label: 'شاشة السعارات', body: 'واجهة مستقلة للعميل لفحص السعر فقط.', to: '/price-checker' },
    hasPermission(permissions, 'employees') ? { label: 'إدارة الموظفين', body: 'ملفات الموظفين والرواتب والقيود الشهرية، مع إدارة الحسابات الحساسة للمدير فقط.', to: '/employees' } : null,
    hasPermission(permissions, 'system-settings') ? { label: 'إعدادات النظام', body: 'اسم المتجر، وسائل التواصل، الخصومات، وصلاحيات الأدوار من شاشة مركزية واحدة.', to: '/settings' } : null,
  ].filter((entry): entry is { label: string; body: string; to: string } => entry !== null)

  return (
    <main className="relative isolate overflow-hidden pb-16 text-stone-900">
      <div className="absolute inset-x-0 top-[-12rem] -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,_rgba(13,148,136,0.22),_transparent_52%),radial-gradient(circle_at_right,_rgba(249,115,22,0.20),_transparent_32%)]" />
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <header className="rounded-[30px] border border-white/70 bg-white/72 px-6 py-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 via-emerald-500 to-amber-400 text-lg font-black text-white shadow-lg shadow-emerald-900/20">
                SM
              </div>
              <div>
                <p className="font-display text-lg font-extrabold tracking-tight text-stone-900">
                  {storeName}
                </p>
                <p className="text-sm text-stone-600">
                  منصة تشغيل السوبر ماركت والبقالة بنقطة بيع ومخزون ومحاسبة في واجهة واحدة.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-700">
              <a className="rounded-full bg-stone-950 px-4 py-2 text-white" href="#hero">
                الرئيسية
              </a>
              <a className="rounded-full border border-stone-300 px-4 py-2 transition hover:border-teal-500 hover:text-teal-700" href="#modules">
                الموديولات
              </a>
              <a className="rounded-full border border-stone-300 px-4 py-2 transition hover:border-teal-500 hover:text-teal-700" href="#preview">
                معاينة الكاشير
              </a>
              <a className="rounded-full border border-stone-300 px-4 py-2 transition hover:border-teal-500 hover:text-teal-700" href="#roadmap">
                خارطة التنفيذ
              </a>
            </nav>
          </div>
        </header>
        <section id="hero" className="mt-6 grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-stretch">
          <div className="rounded-[34px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(245,239,226,0.92))] p-7 shadow-[0_28px_90px_rgba(77,60,27,0.12)] backdrop-blur-xl sm:p-9">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-800">
              {isAccountant ? 'مسار المحاسب' : 'المرحلة الحالية'}
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              {isAccountant ? 'الوصول السريع إلى الرواتب والمصروفات' : 'انطلاق الهيكل التنفيذي للنظام'}
            </div>

            <h1 className="font-display text-4xl font-black leading-[1.15] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
              نظام عربي متكامل لإدارة
              <span className="block bg-gradient-to-l from-teal-700 via-emerald-600 to-amber-500 bg-clip-text text-transparent">
                السوبر ماركت والبقالة
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-700 sm:text-lg">
              الواجهة الحالية أصبحت مدخلاً فعلياً للنظام، والمرحلة التالية جاهزة الآن عبر
              شاشة POS تفاعلية، مع مخطط قاعدة بيانات وهيكل مشروع يدعم التوسع إلى فروع
              متعددة والعمل دون اتصال، مع اعتماد نموذج إدارة مركزي ونقاط بيع مرتبطة عبر
              الشبكة، ومع اعتماد الدينار العراقي والدولار الأمريكي داخل البرنامج.
            </p>

            {isAccountant ? (
              <div className="mt-6 rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(255,255,255,0.92))] p-5 shadow-[0_12px_40px_rgba(16,185,129,0.10)]">
                <p className="text-sm font-black tracking-[0.2em] text-emerald-700">ACCOUNTING DESK</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">مركز العمل المالي اليومي</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-700">
                  هذا المسار يجمع المصروفات، الرواتب، والسجل المالي للموظفين في واجهة واحدة، مع إبقاء إدارة الحسابات وتغيير الصلاحيات بيد المدير فقط.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {accountantWorkflow.map((entry) => (
                    <Link
                      key={entry.to}
                      className="rounded-[22px] border border-emerald-200/80 bg-white/90 p-4 transition hover:-translate-y-1 hover:border-emerald-400 hover:bg-emerald-50/70"
                      to={entry.to}
                    >
                      <p className="text-xs font-black tracking-[0.18em] text-emerald-700">FOCUS</p>
                      <h3 className="mt-2 font-display text-xl font-black text-stone-950">{entry.label}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-600">{entry.body}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isAccountant ? (
                <>
                  <Link
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-700 px-6 py-3 text-base font-bold text-white transition hover:bg-emerald-600"
                    to="/cash-revenues"
                  >
                    فتح الايرادات النقدية
                  </Link>
                  <Link
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-700 px-6 py-3 text-base font-bold text-white transition hover:bg-emerald-600"
                    to="/expenses"
                  >
                    فتح دفتر المصروفات
                  </Link>
                  <Link
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white/80 px-6 py-3 text-base font-bold text-stone-800 transition hover:border-rose-500 hover:text-rose-700"
                    to="/payroll-report"
                  >
                    متابعة تقرير الرواتب
                  </Link>
                </>
              ) : null}
              {hasPermission(permissions, 'dashboard') ? (
                <Link
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-6 py-3 text-base font-bold text-white transition hover:bg-teal-600"
                  to="/dashboard"
                >
                  فتح لوحة التشغيل
                </Link>
              ) : null}
              <Link
                className="inline-flex items-center justify-center rounded-2xl bg-stone-950 px-6 py-3 text-base font-bold text-white transition hover:bg-stone-800"
                to="/login"
              >
                دخول الكاشير
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white/80 px-6 py-3 text-base font-bold text-stone-800 transition hover:border-sky-500 hover:text-sky-700"
                to="/price-checker"
              >
                فتح شاشة السعارات
              </Link>
              <a
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white/80 px-6 py-3 text-base font-bold text-stone-800 transition hover:border-amber-500 hover:text-amber-700"
                href="#modules"
              >
                استكشاف الموديولات الأساسية
              </a>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {actionCards.map((card, index) => (
                <Link
                  key={card.to}
                  className={`rounded-[24px] border bg-white/86 p-4 shadow-[0_12px_40px_rgba(120,98,61,0.08)] transition hover:-translate-y-1 ${actionCardStyles[index % actionCardStyles.length]}`}
                  to={card.to}
                >
                  <p className="text-sm font-black tracking-[0.18em] text-stone-500">QUICK ACCESS</p>
                  <h3 className="mt-3 font-display text-2xl font-black text-stone-950">{card.label}</h3>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{card.body}</p>
                </Link>
              ))}
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {quickStats.map((stat) => (
                <article
                  key={stat.label}
                  className="rounded-[26px] border border-stone-200/80 bg-white/80 p-4 shadow-[0_12px_40px_rgba(120,98,61,0.08)]"
                >
                  <p className="font-display text-2xl font-black text-stone-950">{stat.value}</p>
                  <p className="mt-1 text-sm font-bold text-stone-800">{stat.label}</p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">{stat.detail}</p>
                </article>
              ))}
            </div>
          </div>

          <div id="preview" className="relative overflow-hidden rounded-[34px] border border-stone-200/80 bg-stone-950 p-5 text-white shadow-[0_28px_90px_rgba(29,78,70,0.18)] sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,146,60,0.22),_transparent_30%)]" />
            <div className="relative">
              <div className="flex items-center justify-between rounded-[26px] border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-200/80">POS LIVE</p>
                  <p className="mt-1 font-display text-xl font-black">شاشة الكاشير الذكية</p>
                </div>
                <div className="rounded-full bg-emerald-400/20 px-3 py-1 text-sm font-bold text-emerald-300">
                  جاهزة للتجربة
                </div>
              </div>

              <div className="mt-5 rounded-[28px] border border-white/10 bg-white/6 p-4 backdrop-blur-xl">
                <div className="flex flex-wrap gap-2 text-sm font-semibold text-stone-200">
                  <span className="rounded-full bg-white/10 px-3 py-1">قارئ باركود</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">باركود الميزان</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">VAT تلقائي</span>
                  <span className="rounded-full bg-white/10 px-3 py-1">IQD / USD</span>
                  <span className="rounded-full bg-amber-400/20 px-3 py-1 text-amber-200">تنبيه صلاحية قريب</span>
                </div>

                <div className="mt-4 space-y-3">
                  {basketItems.map((item) => (
                    <article key={item.name} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-bold text-white">{item.name}</h2>
                          <p className="mt-1 text-sm text-stone-300">{item.meta}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-stone-400">الكمية</p>
                          <p className="font-bold text-white">{item.qty}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3 text-sm">
                        <span className="text-stone-300">السعر النهائي</span>
                        <span className="font-display text-lg font-black text-amber-300">{item.price}</span>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 rounded-[24px] bg-white px-4 py-4 text-stone-900 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-stone-500">الإجمالي قبل الضريبة</p>
                    <p className="mt-1 font-display text-2xl font-black">8,804 د.ع</p>
                    <p className="mt-1 text-xs font-bold text-stone-500">$6.72</p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">ضريبة القيمة المضافة</p>
                    <p className="mt-1 font-display text-2xl font-black">1,321 د.ع</p>
                    <p className="mt-1 text-xs font-bold text-stone-500">$1.01</p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">الإجمالي المستحق</p>
                    <p className="mt-1 font-display text-2xl font-black text-teal-700">10,125 د.ع</p>
                    <p className="mt-1 text-xs font-bold text-stone-500">$7.73</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modules" className="mt-8 grid gap-6 lg:grid-cols-[0.98fr_1.02fr]">
          <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-8">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">CORE MODULES</p>
            <h2 className="mt-3 font-display text-3xl font-black text-stone-950 sm:text-4xl">الموديولات التي سيقوم عليها النظام</h2>
            <p className="mt-4 text-base leading-8 text-stone-700">
              التصميم الحالي يضع أساساً واضحاً لكل جزء من المنظومة حتى يمكن تحويله لاحقاً
              إلى تطبيق إنتاجي متعدد الفروع ونقاط البيع دون إعادة بناء الواجهة من الصفر.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {modules.map((module, index) => (
                <article key={module.title} className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-5 transition hover:-translate-y-1 hover:border-teal-300 hover:bg-white">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">0{index + 1}</span>
                    <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-teal-500 to-amber-400" />
                  </div>
                  <h3 className="font-display text-xl font-black text-stone-950">{module.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-600">{module.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-6 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">OPERATIONS HUB</p>
                <h2 className="mt-2 font-display text-3xl font-black sm:text-4xl">لوحة تشغيل قابلة للتوسع</h2>
              </div>
              <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/90">سحابي + محلي</div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                <p className="text-sm text-stone-300">التكاملات الحرجة</p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-white/90">
                  <li>دعم باركود الميزان لاستخراج الوزن والسعر مباشرة.</li>
                  <li>العمل دون اتصال مع سجل محلي ومزامنة تلقائية.</li>
                  <li>FEFO للدفعات والصلاحية والتنبيهات قبل التلف.</li>
                  <li>صلاحيات تفصيلية تمنع الوصول غير المصرح للأرباح أو التكاليف.</li>
                </ul>
              </article>

              <article className="rounded-[24px] border border-white/10 bg-gradient-to-br from-teal-500/18 to-amber-400/12 p-5">
                <p className="text-sm text-stone-300">حالة التنفيذ الحالية</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl bg-black/20 px-4 py-3">
                    <p className="text-xs text-stone-400">العملات المدعومة</p>
                    <p className="mt-1 font-display text-2xl font-black">IQD + USD</p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-4 py-3">
                    <p className="text-xs text-stone-400">شاشة POS</p>
                    <p className="mt-1 font-bold text-white">جاهزة للتشغيل والورديات</p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-4 py-3">
                    <p className="text-xs text-stone-400">سجل الفواتير</p>
                    <p className="mt-1 font-bold text-emerald-300">متابعة ومزامنة ومرتجعات</p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-4 py-3">
                    <p className="text-xs text-stone-400">الورديات</p>
                    <p className="mt-1 font-bold text-teal-200">فتح وإغلاق ومحضر تسليم</p>
                  </div>
                  <div className="rounded-2xl bg-black/20 px-4 py-3">
                    <p className="text-xs text-stone-400">هيكل البيانات</p>
                    <p className="mt-1 font-bold text-amber-300">جاهز للتوسع إلى بيئة إنتاجية</p>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="roadmap" className="mt-8 rounded-[34px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">ROADMAP</p>
              <h2 className="mt-3 font-display text-3xl font-black text-stone-950 sm:text-4xl">كيف سنبني النظام تدريجياً</h2>
              <p className="mt-4 text-base leading-8 text-stone-700">
                بعد هذه المرحلة صار لدينا أساس بصري ومسار مبدئي للكاشير. المرحلة التالية
                الآن تبني المنطق البيعي، قاعدة البيانات، والربط الخلفي بطريقة قابلة للنمو.
              </p>
            </div>

            <div className="grid gap-4">
              {milestones.map((step, index) => (
                <article key={step} className="flex gap-4 rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-950 font-display text-lg font-black text-white">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-7 text-stone-700">{step}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
