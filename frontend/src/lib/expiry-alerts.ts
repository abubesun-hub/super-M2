import type { Product } from './pos'
import type { StoredPurchaseReceipt } from './purchases-api'

export type ExpiryAlertSeverity = 'expired' | 'critical' | 'warning'

export type ExpiryAlert = {
  key: string
  productId: string
  productName: string
  department: string
  receiptNo: string
  supplierName?: string
  purchaseDate: string
  expiryDate: string
  batchNo?: string
  receivedQuantity: number
  remainingStockQty: number
  unitLabel: string
  daysUntilExpiry: number
  severity: ExpiryAlertSeverity
}

export type ExpiryAlertSummary = {
  alerts: ExpiryAlert[]
  expiredCount: number
  criticalCount: number
  warningCount: number
  affectedProductsCount: number
}

type BuildExpiryAlertSummaryOptions = {
  warningDays?: number
  criticalDays?: number
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function getDaysUntilExpiry(expiryDate: string, today = new Date()) {
  const diffMs = startOfDay(parseIsoDate(expiryDate)).getTime() - startOfDay(today).getTime()
  return Math.round(diffMs / 86400000)
}

function getSeverity(daysUntilExpiry: number, criticalDays: number): ExpiryAlertSeverity {
  if (daysUntilExpiry < 0) {
    return 'expired'
  }

  if (daysUntilExpiry <= criticalDays) {
    return 'critical'
  }

  return 'warning'
}

export function buildExpiryAlertSummary(
  receipts: StoredPurchaseReceipt[],
  products: Product[],
  options: BuildExpiryAlertSummaryOptions = {},
): ExpiryAlertSummary {
  const warningDays = options.warningDays ?? 30
  const criticalDays = options.criticalDays ?? 7
  const productsById = new Map(products.map((product) => [product.id, product]))
  const severityRank = { expired: 0, critical: 1, warning: 2 } as const

  const alerts = receipts
    .flatMap((receipt) =>
      receipt.items.map((item, itemIndex) => ({
        receipt,
        item,
        itemIndex,
      })),
    )
    .reduce<ExpiryAlert[]>((result, { receipt, item, itemIndex }) => {
      if (!item.expiryDate) {
        return result
      }

      const product = productsById.get(item.productId)

      if (!product || product.stockQty <= 0) {
        return result
      }

      const daysUntilExpiry = getDaysUntilExpiry(item.expiryDate)

      if (daysUntilExpiry > warningDays) {
        return result
      }

      result.push({
        key: `${receipt.id}:${item.productId}:${item.batchNo ?? item.expiryDate}:${itemIndex}`,
        productId: item.productId,
        productName: item.name,
        department: product.department,
        receiptNo: receipt.receiptNo,
        supplierName: receipt.supplierName,
        purchaseDate: receipt.purchaseDate,
        expiryDate: item.expiryDate,
        batchNo: item.batchNo,
        receivedQuantity: item.baseQuantity,
        remainingStockQty: product.stockQty,
        unitLabel: product.unitLabel,
        daysUntilExpiry,
        severity: getSeverity(daysUntilExpiry, criticalDays),
      })

      return result
    }, [])
    .sort((left, right) => {
      return (
        severityRank[left.severity] - severityRank[right.severity] ||
        left.daysUntilExpiry - right.daysUntilExpiry ||
        left.productName.localeCompare(right.productName, 'ar')
      )
    })

  return {
    alerts,
    expiredCount: alerts.filter((alert) => alert.severity === 'expired').length,
    criticalCount: alerts.filter((alert) => alert.severity === 'critical').length,
    warningCount: alerts.filter((alert) => alert.severity === 'warning').length,
    affectedProductsCount: new Set(alerts.map((alert) => alert.productId)).size,
  }
}