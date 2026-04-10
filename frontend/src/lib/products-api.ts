import type { Product } from './pos'
import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type StockMovement = {
  id: string
  productId: string
  productName: string
  movementType: 'sale' | 'adjustment' | 'return' | 'purchase'
  quantityDelta: number
  balanceAfter: number
  note: string
  createdAt: string
}

export type InventoryBatch = {
  id: string
  productId: string
  productName: string
  source: 'purchase' | 'opening'
  batchNo?: string
  expiryDate?: string
  purchaseDate?: string
  supplierName?: string
  receivedQuantity: number
  remainingQuantity: number
  retailUnitCost: number
  createdAt: string
}

export type ProductUpsertPayload = {
  name: string
  productFamilyName?: string
  variantLabel?: string
  barcode: string
  wholesaleBarcode?: string
  plu?: string
  department: string
  measurementType: 'unit' | 'weight'
  purchaseCostBasis: 'retail' | 'wholesale'
  retailUnit: string
  wholesaleUnit?: string
  wholesaleQuantity?: number
  retailPurchasePrice: number
  wholesalePurchasePrice?: number
  retailSalePrice: number
  wholesaleSalePrice?: number
  vatRate: number
  stockQty: number
  minStock: number
}

export type PriceCheckerProduct = {
  id: string
  name: string
  productFamilyName: string
  variantLabel?: string
  barcode: string
  wholesaleBarcode?: string
  plu?: string
  department: string
  measurementType: 'unit' | 'weight'
  retailUnit: string
  wholesaleUnit?: string
  wholesaleQuantity?: number
  retailSalePrice: number
  wholesaleSalePrice?: number
  unitLabel: string
}

export function findPriceCheckerProductByScan(products: PriceCheckerProduct[], scan: string) {
  const exactRetail = products.find((product) => product.barcode === scan)
  if (exactRetail) {
    return exactRetail
  }

  const exactWholesale = products.find((product) => product.wholesaleBarcode === scan)
  if (exactWholesale) {
    return exactWholesale
  }

  const digits = scan.replace(/\D/g, '')
  if (digits.length !== 13 || !digits.startsWith('24')) {
    return null
  }

  const plu = digits.slice(2, 6)
  return products.find((product) => product.plu === plu) ?? null
}

export async function fetchProducts() {
  const response = await apiFetch('/products')

  if (!response.ok) {
    throw new Error('تعذر تحميل الأصناف من الخادم.')
  }

  const body = (await response.json()) as { data: Product[] }
  return body.data
}

export async function fetchStockMovements() {
  const response = await apiFetch('/products/movements')

  if (!response.ok) {
    throw new Error('تعذر تحميل حركات المخزون من الخادم.')
  }

  const body = (await response.json()) as { data: StockMovement[] }
  return body.data
}

export async function fetchInventoryBatches(productId?: string) {
  const params = new URLSearchParams()

  if (productId) {
    params.set('productId', productId)
  }

  const response = await apiFetch(`/products/batches${params.size ? `?${params.toString()}` : ''}`)

  if (!response.ok) {
    throw new Error('تعذر تحميل دفعات المخزون من الخادم.')
  }

  const body = (await response.json()) as { data: InventoryBatch[] }
  return body.data
}

export async function submitStockAdjustment(payload: {
  productId: string
  quantityDelta: number
  note: string
}) {
  const response = await apiFetch('/products/adjustments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر تنفيذ تعديل المخزون.'))
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function createProduct(payload: ProductUpsertPayload) {
  const response = await apiFetch('/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر إنشاء الصنف.'))
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function updateProduct(productId: string, payload: ProductUpsertPayload) {
  const response = await apiFetch(`/products/${productId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر تعديل الصنف.'))
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function deleteProduct(productId: string) {
  const response = await apiFetch(`/products/${productId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(getUserFacingApiErrorMessage(errorBody?.message, 'تعذر حذف الصنف.'))
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function fetchPriceCheckerProducts() {
  const response = await apiFetch('/products/price-check', {}, { auth: false })

  if (!response.ok) {
    throw new Error('تعذر تحميل بيانات السعارات من الخادم.')
  }

  const body = (await response.json()) as { data: PriceCheckerProduct[] }
  return body.data
}

