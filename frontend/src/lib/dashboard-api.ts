import type { StockMovement } from './products-api'
import type { StoredSaleInvoice } from './sales-api'
import type { Product } from './pos'

export type DashboardStorageInfo = {
  driver: 'memory' | 'postgres'
  persistence: boolean
  connected: boolean
  message: string
}

export type DashboardHourlySales = {
  bucketStartHour: number
  bucketEndHour: number
  label: string
  invoicesCount: number
  salesTotal: number
}

export type DashboardDepartmentMetric = {
  department: string
  totalAmount: number
  totalQuantity: number
  totalProfit: number
  itemsCount: number
}

export type DashboardProfitProduct = {
  productId: string
  name: string
  totalQuantity: number
  totalProfit: number
}

export type DashboardSummary = {
  todaysSalesCount: number
  todaysSalesTotal: number
  todaysEstimatedProfit: number
  todaysReturnsCount: number
  lowStockCount: number
  productsCount: number
  inventoryValue: number
  storage: DashboardStorageInfo
  hourlySales: DashboardHourlySales[]
  departmentBreakdown: DashboardDepartmentMetric[]
  topProfitProducts: DashboardProfitProduct[]
  recentInvoices: StoredSaleInvoice[]
  lowStockProducts: Product[]
  recentMovements: StockMovement[]
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
}

export async function fetchDashboardSummary() {
  const response = await fetch(`${getApiBaseUrl()}/dashboard/summary`)

  if (!response.ok) {
    throw new Error('تعذر تحميل ملخص لوحة التشغيل.')
  }

  const body = (await response.json()) as { data: DashboardSummary }
  return body.data
}
