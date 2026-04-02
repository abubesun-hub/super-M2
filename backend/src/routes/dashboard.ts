import { Router } from 'express'
import { getDataAccess, getStorageInfo } from '../data/index.js'

export const dashboardRouter = Router()

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function buildHourlySales(invoices: Array<{ createdAt: string; totalAmount: number }>) {
  return Array.from({ length: 12 }, (_, bucketIndex) => {
    const startHour = bucketIndex * 2
    const endHour = startHour + 1
    const bucketInvoices = invoices.filter((invoice) => {
      const hour = new Date(invoice.createdAt).getHours()
      return hour >= startHour && hour <= endHour
    })

    return {
      bucketStartHour: startHour,
      bucketEndHour: endHour,
      label: `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:59`,
      invoicesCount: bucketInvoices.length,
      salesTotal: bucketInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
    }
  })
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

dashboardRouter.get('/summary', async (_request, response) => {
  const now = new Date()
  const dataAccess = getDataAccess()
  const [invoices, products, movements] = await Promise.all([
    dataAccess.sales.listInvoices(),
    dataAccess.products.listProducts(),
    dataAccess.products.listMovements(),
  ])
  const todaysInvoices = invoices.filter((invoice) => isSameDay(new Date(invoice.createdAt), now))
  const todaysReturns = invoices.flatMap((invoice) =>
    invoice.returns.filter((saleReturn) => isSameDay(new Date(saleReturn.createdAt), now)),
  )
  const lowStockProducts = products.filter((product) => product.stockQty <= product.minStock)
  const todaysSalesTotal = todaysInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
  const todaysEstimatedProfit = todaysInvoices.reduce(
    (sum, invoice) => sum + invoice.items.reduce((itemsSum, item) => itemsSum + item.lineProfit, 0),
    0,
  )
  const todaysReturnsCount = todaysReturns.length
  const inventoryValue = products.reduce((sum, product) => sum + product.stockQty * product.unitPrice, 0)
  const hourlySales = buildHourlySales(todaysInvoices)
  const departmentBreakdown = buildDepartmentBreakdown(todaysInvoices, products)
  const topProfitProducts = buildTopProfitProducts(todaysInvoices)

  response.json({
    data: {
      todaysSalesCount: todaysInvoices.length,
      todaysSalesTotal,
      todaysEstimatedProfit,
      todaysReturnsCount,
      lowStockCount: lowStockProducts.length,
      productsCount: products.length,
      inventoryValue,
      storage: getStorageInfo(),
      hourlySales,
      departmentBreakdown,
      topProfitProducts,
      recentInvoices: invoices.slice(0, 5),
      lowStockProducts: lowStockProducts.slice(0, 5),
      recentMovements: movements.slice(0, 6),
    },
  })
})
