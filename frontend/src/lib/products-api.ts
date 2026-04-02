import type { Product } from './pos'

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

export type ProductUpsertPayload = {
  name: string
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

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
}

export async function fetchProducts() {
  const response = await fetch(`${getApiBaseUrl()}/products`)

  if (!response.ok) {
    throw new Error('تعذر تحميل الأصناف من الخادم.')
  }

  const body = (await response.json()) as { data: Product[] }
  return body.data
}

export async function fetchStockMovements() {
  const response = await fetch(`${getApiBaseUrl()}/products/movements`)

  if (!response.ok) {
    throw new Error('تعذر تحميل حركات المخزون من الخادم.')
  }

  const body = (await response.json()) as { data: StockMovement[] }
  return body.data
}

export async function submitStockAdjustment(payload: {
  productId: string
  quantityDelta: number
  note: string
}) {
  const response = await fetch(`${getApiBaseUrl()}/products/adjustments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر تنفيذ تعديل المخزون.')
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function createProduct(payload: ProductUpsertPayload) {
  const response = await fetch(`${getApiBaseUrl()}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر إنشاء الصنف.')
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function updateProduct(productId: string, payload: ProductUpsertPayload) {
  const response = await fetch(`${getApiBaseUrl()}/products/${productId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر تعديل الصنف.')
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

export async function deleteProduct(productId: string) {
  const response = await fetch(`${getApiBaseUrl()}/products/${productId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? 'تعذر حذف الصنف.')
  }

  const body = (await response.json()) as { data: Product }
  return body.data
}

