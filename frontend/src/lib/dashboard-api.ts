import type { StockMovement } from './products-api'
import type { StoredSaleInvoice } from './sales-api'
import type { Product } from './pos'
import { apiFetch } from './api'

export type DashboardSummaryPeriodPreset = 'today' | 'month' | 'year' | 'all' | 'custom'

export type DashboardSummaryPeriod = {
  preset: DashboardSummaryPeriodPreset
  startDate?: string
  endDate?: string
  label: string
}

export type DashboardStorageInfo = {
  driver: 'memory' | 'postgres'
  persistence: boolean
  connected: boolean
  message: string
}

export type DashboardSalesTimelinePoint = {
  bucketKey: string
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
  period: DashboardSummaryPeriod
  salesCount: number
  salesTotal: number
  estimatedProfit: number
  returnsCount: number
  lowStockCount: number
  productsCount: number
  inventoryValue: number
  storage: DashboardStorageInfo
  salesTimeline: DashboardSalesTimelinePoint[]
  salesTimelineTitle: string
  salesTimelineSubtitle: string
  departmentBreakdown: DashboardDepartmentMetric[]
  topProfitProducts: DashboardProfitProduct[]
  recentInvoices: StoredSaleInvoice[]
  lowStockProducts: Product[]
  recentMovements: StockMovement[]
}

export async function fetchDashboardSummary(filter?: {
  preset?: DashboardSummaryPeriodPreset
  startDate?: string
  endDate?: string
}) {
  const params = new URLSearchParams()

  if (filter?.preset) {
    params.set('preset', filter.preset)
  }

  if (filter?.startDate) {
    params.set('startDate', filter.startDate)
  }

  if (filter?.endDate) {
    params.set('endDate', filter.endDate)
  }

  const response = await apiFetch(`/dashboard/summary${params.size ? `?${params.toString()}` : ''}`)

  if (!response.ok) {
    throw new Error('تعذر تحميل ملخص لوحة التشغيل.')
  }

  const body = (await response.json()) as { data: DashboardSummary }
  return body.data
}
