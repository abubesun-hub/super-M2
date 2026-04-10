import { Router } from 'express'
import { getDataAccess, getStorageInfo } from '../data/index.js'
import { requireEmployeePermission } from '../middleware/employee-auth.js'

export const dashboardRouter = Router()

dashboardRouter.use(requireEmployeePermission('dashboard', ['admin', 'accountant']))

type DashboardPreset = 'today' | 'month' | 'year' | 'all' | 'custom'

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0)
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function parseDateOnly(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null
  }

  return parsed
}

function toDateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : undefined
}

function formatPeriodLabel(preset: DashboardPreset, start: Date | null, end: Date | null) {
  const formatter = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' })

  if (preset === 'today') {
    return 'اليوم'
  }

  if (preset === 'month' && start) {
    return `هذا الشهر (${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, '0')})`
  }

  if (preset === 'year' && start) {
    return `هذه السنة (${start.getFullYear()})`
  }

  if (preset === 'all') {
    return 'تراكمي من بداية البيانات'
  }

  if (start && end) {
    return `${formatter.format(start)} - ${formatter.format(end)}`
  }

  return 'الفترة المحددة'
}

function resolvePeriod(query: Record<string, unknown>) {
  const now = new Date()
  const requestedPreset = typeof query.preset === 'string' ? query.preset : 'today'
  const preset: DashboardPreset = ['today', 'month', 'year', 'all', 'custom'].includes(requestedPreset)
    ? requestedPreset as DashboardPreset
    : 'today'

  let start: Date | null = null
  let end: Date | null = null

  if (preset === 'today') {
    start = startOfDay(now)
    end = endOfDay(now)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  } else if (preset === 'year') {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
  } else if (preset === 'custom') {
    const requestedStart = parseDateOnly(typeof query.startDate === 'string' ? query.startDate : undefined)
    const requestedEnd = parseDateOnly(typeof query.endDate === 'string' ? query.endDate : undefined)

    if (requestedStart && requestedEnd) {
      start = startOfDay(requestedStart)
      end = endOfDay(requestedEnd)

      if (start.getTime() > end.getTime()) {
        const originalStart = start
        start = startOfDay(requestedEnd)
        end = endOfDay(originalStart)
      }
    } else {
      start = startOfDay(now)
      end = endOfDay(now)
    }
  }

  return {
    preset,
    start,
    end,
    startDate: toDateValue(start),
    endDate: toDateValue(end),
    label: formatPeriodLabel(preset, start, end),
  }
}

function isWithinRange(value: string, start: Date | null, end: Date | null) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  if (start && date.getTime() < start.getTime()) {
    return false
  }

  if (end && date.getTime() > end.getTime()) {
    return false
  }

  return true
}

function buildHourlyTimeline(invoices: Array<{ createdAt: string; totalAmount: number }>) {
  return Array.from({ length: 12 }, (_, bucketIndex) => {
    const startHour = bucketIndex * 2
    const endHour = startHour + 1
    const bucketInvoices = invoices.filter((invoice) => {
      const hour = new Date(invoice.createdAt).getHours()
      return hour >= startHour && hour <= endHour
    })

    return {
      bucketKey: `hour-${startHour}`,
      label: `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:59`,
      invoicesCount: bucketInvoices.length,
      salesTotal: bucketInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    }
  })
}

function buildDailyTimeline(invoices: Array<{ createdAt: string; totalAmount: number }>, start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat('ar-IQ', { month: 'short', day: 'numeric' })
  const buckets: Array<{ bucketKey: string; label: string; invoicesCount: number; salesTotal: number }> = []

  for (const cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const bucketStart = startOfDay(new Date(cursor))
    const bucketEnd = endOfDay(new Date(cursor))
    const bucketInvoices = invoices.filter((invoice) => isWithinRange(invoice.createdAt, bucketStart, bucketEnd))

    buckets.push({
      bucketKey: bucketStart.toISOString().slice(0, 10),
      label: formatter.format(bucketStart),
      invoicesCount: bucketInvoices.length,
      salesTotal: bucketInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    })
  }

  return buckets
}

function buildMonthlyTimeline(invoices: Array<{ createdAt: string; totalAmount: number }>, start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat('ar-IQ', { month: 'short', year: 'numeric' })
  const buckets: Array<{ bucketKey: string; label: string; invoicesCount: number; salesTotal: number }> = []

  for (const cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor.getTime() <= end.getTime(); cursor.setMonth(cursor.getMonth() + 1)) {
    const bucketStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0)
    const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999)
    const bucketInvoices = invoices.filter((invoice) => isWithinRange(invoice.createdAt, bucketStart, bucketEnd))

    buckets.push({
      bucketKey: `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, '0')}`,
      label: formatter.format(bucketStart),
      invoicesCount: bucketInvoices.length,
      salesTotal: bucketInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    })
  }

  return buckets
}

function getTimelineMeta(period: ReturnType<typeof resolvePeriod>, invoices: Array<{ createdAt: string; totalAmount: number }>) {
  if (!invoices.length) {
    if (period.preset === 'today' || (period.start && period.end && isSameDay(period.start, period.end))) {
      return {
        title: 'مبيعات الفترة حسب الساعات',
        subtitle: 'مجمعة على فترات كل ساعتين',
        points: buildHourlyTimeline([]),
      }
    }

    if (period.preset === 'year') {
      return {
        title: 'مبيعات الفترة حسب الأشهر',
        subtitle: 'مجمعة على مستوى كل شهر',
        points: buildMonthlyTimeline([], period.start ?? new Date(), period.end ?? new Date()),
      }
    }

    if (period.start && period.end) {
      return {
        title: 'مبيعات الفترة حسب الأيام',
        subtitle: 'مجمعة يومياً خلال الفترة المختارة',
        points: buildDailyTimeline([], period.start, period.end),
      }
    }

    return {
      title: 'مبيعات الفترة حسب الأشهر',
      subtitle: 'مجمعة على مستوى كل شهر',
      points: [],
    }
  }

  const firstInvoiceDate = new Date(invoices[invoices.length - 1]?.createdAt ?? invoices[0].createdAt)
  const lastInvoiceDate = new Date(invoices[0]?.createdAt ?? invoices[invoices.length - 1].createdAt)
  const start = period.start ?? startOfDay(firstInvoiceDate)
  const end = period.end ?? endOfDay(lastInvoiceDate)
  const daySpan = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1)

  if (period.preset === 'today' || daySpan <= 1) {
    return {
      title: 'مبيعات الفترة حسب الساعات',
      subtitle: 'مجمعة على فترات كل ساعتين',
      points: buildHourlyTimeline(invoices),
    }
  }

  if (period.preset === 'year' || daySpan > 45) {
    return {
      title: 'مبيعات الفترة حسب الأشهر',
      subtitle: 'مجمعة على مستوى كل شهر',
      points: buildMonthlyTimeline(invoices, start, end),
    }
  }

  return {
    title: 'مبيعات الفترة حسب الأيام',
    subtitle: 'مجمعة يومياً خلال الفترة المختارة',
    points: buildDailyTimeline(invoices, start, end),
  }
}

function buildDepartmentBreakdown(
  invoices: Array<{
    items: Array<{ productId: string; quantity: number; lineTotal: number; lineProfit: number }>
  }>,
  products: Array<{ id: string; department: string }>,
) {
  const departments = new Map<string, { department: string; totalAmount: number; totalQuantity: number; totalProfit: number; itemsCount: number }>()
  const productDepartments = new Map(products.map((product) => [product.id, product.department]))

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const department = productDepartments.get(item.productId) ?? 'غير مصنف'
      const current = departments.get(department) ?? {
        department,
        totalAmount: 0,
        totalQuantity: 0,
        totalProfit: 0,
        itemsCount: 0,
      }

      current.totalAmount += item.lineTotal
      current.totalQuantity += item.quantity
      current.totalProfit += item.lineProfit
      current.itemsCount += 1
      departments.set(department, current)
    }
  }

  return [...departments.values()]
    .sort((left, right) => right.totalProfit - left.totalProfit)
    .slice(0, 5)
}

function buildTopProfitProducts(
  invoices: Array<{
    items: Array<{ productId: string; name: string; quantity: number; lineProfit: number }>
  }>,
) {
  const products = new Map<string, { productId: string; name: string; totalQuantity: number; totalProfit: number }>()

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const current = products.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        totalQuantity: 0,
        totalProfit: 0,
      }

      current.totalQuantity += item.quantity
      current.totalProfit += item.lineProfit
      products.set(item.productId, current)
    }
  }

  return [...products.values()]
    .sort((left, right) => right.totalProfit - left.totalProfit)
    .slice(0, 5)
}

dashboardRouter.get('/summary', async (request, response) => {
  const period = resolvePeriod(request.query as Record<string, unknown>)
  const dataAccess = getDataAccess()
  const [invoices, products, movements] = await Promise.all([
    dataAccess.sales.listInvoices(),
    dataAccess.products.listProducts(),
    dataAccess.products.listMovements(),
  ])
  const filteredInvoices = invoices.filter((invoice) => isWithinRange(invoice.createdAt, period.start, period.end))
  const filteredReturns = filteredInvoices.flatMap((invoice) =>
    invoice.returns.filter((saleReturn) => isWithinRange(saleReturn.createdAt, period.start, period.end)),
  )
  const filteredMovements = movements.filter((movement) => isWithinRange(movement.createdAt, period.start, period.end))
  const lowStockProducts = products.filter((product) => product.stockQty <= product.minStock)
  const salesTotal = filteredInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
  const estimatedProfit = filteredInvoices.reduce(
    (sum, invoice) => sum + invoice.items.reduce((itemsSum, item) => itemsSum + item.lineProfit, 0),
    0,
  )
  const returnsCount = filteredReturns.length
  const inventoryValue = products.reduce((sum, product) => sum + product.stockQty * product.unitPrice, 0)
  const timeline = getTimelineMeta(period, filteredInvoices)
  const departmentBreakdown = buildDepartmentBreakdown(filteredInvoices, products)
  const topProfitProducts = buildTopProfitProducts(filteredInvoices)

  response.json({
    data: {
      period: {
        preset: period.preset,
        startDate: period.startDate,
        endDate: period.endDate,
        label: period.label,
      },
      salesCount: filteredInvoices.length,
      salesTotal,
      estimatedProfit,
      returnsCount,
      lowStockCount: lowStockProducts.length,
      productsCount: products.length,
      inventoryValue,
      storage: getStorageInfo(),
      salesTimeline: timeline.points,
      salesTimelineTitle: timeline.title,
      salesTimelineSubtitle: timeline.subtitle,
      departmentBreakdown,
      topProfitProducts,
      recentInvoices: filteredInvoices.slice(0, 5),
      lowStockProducts: lowStockProducts.slice(0, 5),
      recentMovements: filteredMovements.slice(0, 6),
    },
  })
})
