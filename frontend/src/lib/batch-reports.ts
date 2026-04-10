import type { InventoryBatch } from './products-api'
import type { Product } from './pos'

export type BatchSeverity = 'expired' | 'critical' | 'warning' | 'safe' | 'none'

export type BatchReportRow = InventoryBatch & {
  department: string
  daysUntilExpiry: number | null
  severity: BatchSeverity
  estimatedCostValueIqd: number
  estimatedRetailValueIqd: number
}

export type WasteSummary = {
  expiredBatchesCount: number
  expiredProductsCount: number
  expiredQuantity: number
  estimatedCostLossIqd: number
  estimatedRetailLossIqd: number
}

export type DisposalSuggestion = {
  productId: string
  productName: string
  department: string
  batchNo?: string
  expiryDate: string
  daysUntilExpiry: number
  remainingQuantity: number
  estimatedRetailValueIqd: number
  recommendation: string
  severity: 'critical' | 'warning'
}

export type BatchReportSummary = {
  rows: BatchReportRow[]
  expiredRows: BatchReportRow[]
  wasteSummary: WasteSummary
  disposalSuggestions: DisposalSuggestion[]
}

export function getDaysUntilExpiry(expiryDate?: string) {
  if (!expiryDate) {
    return null
  }

  const today = new Date()
  const expiry = new Date(`${expiryDate}T00:00:00`)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffMs = expiry.getTime() - todayStart.getTime()
  return Math.round(diffMs / 86400000)
}

export function getBatchSeverity(expiryDate?: string): BatchSeverity {
  const days = getDaysUntilExpiry(expiryDate)

  if (days === null) {
    return 'none'
  }

  if (days < 0) {
    return 'expired'
  }

  if (days <= 7) {
    return 'critical'
  }

  if (days <= 30) {
    return 'warning'
  }

  return 'safe'
}

export function getBatchSeverityLabel(expiryDate?: string) {
  const severity = getBatchSeverity(expiryDate)
  const days = getDaysUntilExpiry(expiryDate)

  if (severity === 'none') {
    return 'بدون تاريخ انتهاء'
  }

  if (severity === 'expired') {
    return `منتهي منذ ${Math.abs(days ?? 0)} يوم`
  }

  if (severity === 'critical') {
    return days === 0 ? 'ينتهي اليوم' : `ينتهي خلال ${days} يوم`
  }

  if (severity === 'warning') {
    return `متبقّي ${days} يوم`
  }

  return `آمن حالياً - ${days} يوم`
}

function getRecommendation(daysUntilExpiry: number, remainingQuantity: number) {
  if (daysUntilExpiry <= 3) {
    return remainingQuantity > 10 ? 'انقل الكمية لعرض تصريف عاجل مع تنبيه الكاشير.' : 'صنّفها كأولوية قصوى للبيع اليوم.'
  }

  if (daysUntilExpiry <= 7) {
    return remainingQuantity > 10 ? 'اعمل عرض سعر سريع وادفع الصنف لواجهة الرف.' : 'وجّه الكاشير لتصريف هذه الدفعة أولاً.'
  }

  return remainingQuantity > 10 ? 'ابدأ تخفيضاً تدريجياً وخطة عرض أمامي.' : 'راقبها يومياً مع إبرازها للزبون.'
}

export function buildBatchReportSummary(batches: InventoryBatch[], products: Product[]): BatchReportSummary {
  const productMap = new Map(products.map((product) => [product.id, product]))

  const rows = batches
    .filter((batch) => batch.remainingQuantity > 0)
    .map((batch) => {
      const product = productMap.get(batch.productId)
      const department = product?.department ?? 'غير مصنف'
      const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate)

      return {
        ...batch,
        department,
        daysUntilExpiry,
        severity: getBatchSeverity(batch.expiryDate),
        estimatedCostValueIqd: Number((batch.remainingQuantity * batch.retailUnitCost).toFixed(2)),
        estimatedRetailValueIqd: Number((batch.remainingQuantity * (product?.unitPrice ?? batch.retailUnitCost)).toFixed(2)),
      } satisfies BatchReportRow
    })
    .sort((left, right) => {
      const severityRank = { expired: 0, critical: 1, warning: 2, safe: 3, none: 4 }
      return (
        severityRank[left.severity] - severityRank[right.severity] ||
        (left.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) - (right.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) ||
        right.estimatedRetailValueIqd - left.estimatedRetailValueIqd
      )
    })

  const expiredRows = rows.filter((row) => row.severity === 'expired')
  const wasteSummary = {
    expiredBatchesCount: expiredRows.length,
    expiredProductsCount: new Set(expiredRows.map((row) => row.productId)).size,
    expiredQuantity: Number(expiredRows.reduce((sum, row) => sum + row.remainingQuantity, 0).toFixed(3)),
    estimatedCostLossIqd: Number(expiredRows.reduce((sum, row) => sum + row.estimatedCostValueIqd, 0).toFixed(2)),
    estimatedRetailLossIqd: Number(expiredRows.reduce((sum, row) => sum + row.estimatedRetailValueIqd, 0).toFixed(2)),
  } satisfies WasteSummary

  const disposalSuggestions = rows
    .filter((row) => row.severity === 'critical' || row.severity === 'warning')
    .slice(0, 6)
    .map((row) => ({
      productId: row.productId,
      productName: row.productName,
      department: row.department,
      batchNo: row.batchNo,
      expiryDate: row.expiryDate ?? '',
      daysUntilExpiry: row.daysUntilExpiry ?? 0,
      remainingQuantity: row.remainingQuantity,
      estimatedRetailValueIqd: row.estimatedRetailValueIqd,
      severity: row.severity as 'critical' | 'warning',
      recommendation: getRecommendation(row.daysUntilExpiry ?? 0, row.remainingQuantity),
    }))

  return {
    rows,
    expiredRows,
    wasteSummary,
    disposalSuggestions,
  }
}