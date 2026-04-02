export type CatalogProduct = {
  id: string
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
  purchasePrice: number
  unitPrice: number
  vatRate: number
  stockQty: number
  minStock: number
  soldByWeight?: boolean
  unitLabel: string
}

export type ProductSaleLine = {
  productId: string
  name: string
  quantity: number
}

export type ProductPurchaseLine = {
  productId: string
  name: string
  quantity: number
  retailQuantity: number
  retailUnitCost: number
  wholesaleUnitCost?: number
}

export type ProductUpsertInput = {
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

const catalogProducts: CatalogProduct[] = [
  {
    id: 'prod-water',
    name: 'مياه معدنية 600 مل',
    barcode: '6281000010012',
    wholesaleBarcode: '6281000011019',
    department: 'المشروبات',
    measurementType: 'unit',
    purchaseCostBasis: 'wholesale',
    retailUnit: 'عبوة',
    wholesaleUnit: 'كارتونة',
    wholesaleQuantity: 24,
    retailPurchasePrice: 340,
    wholesalePurchasePrice: 8160,
    retailSalePrice: 500,
    wholesaleSalePrice: 10800,
    purchasePrice: 340,
    unitPrice: 500,
    vatRate: 0.15,
    stockQty: 48,
    minStock: 12,
    soldByWeight: false,
    unitLabel: 'عبوة',
  },
  {
    id: 'prod-bread',
    name: 'خبز عربي كبير',
    barcode: '6281000010029',
    department: 'المخبوزات',
    measurementType: 'unit',
    purchaseCostBasis: 'retail',
    retailUnit: 'ربطة',
    retailPurchasePrice: 950,
    retailSalePrice: 1500,
    purchasePrice: 950,
    unitPrice: 1500,
    vatRate: 0.15,
    stockQty: 14,
    minStock: 10,
    soldByWeight: false,
    unitLabel: 'ربطة',
  },
  {
    id: 'prod-cheese',
    name: 'جبنة بيضاء ميزان',
    barcode: '2400150000000',
    wholesaleBarcode: '6281000012016',
    plu: '0015',
    department: 'الأجبان',
    measurementType: 'weight',
    purchaseCostBasis: 'wholesale',
    retailUnit: 'كجم',
    wholesaleUnit: 'تنكة',
    wholesaleQuantity: 16,
    retailPurchasePrice: 12400,
    wholesalePurchasePrice: 198400,
    retailSalePrice: 18000,
    wholesaleSalePrice: 272000,
    purchasePrice: 12400,
    unitPrice: 18000,
    vatRate: 0.15,
    stockQty: 22.4,
    minStock: 6,
    soldByWeight: true,
    unitLabel: 'كجم',
  },
  {
    id: 'prod-meat',
    name: 'لحم مفروم طازج',
    barcode: '2400210000000',
    plu: '0021',
    department: 'اللحوم',
    measurementType: 'weight',
    purchaseCostBasis: 'retail',
    retailUnit: 'كجم',
    retailPurchasePrice: 11250,
    retailSalePrice: 16000,
    purchasePrice: 11250,
    unitPrice: 16000,
    vatRate: 0.15,
    stockQty: 17.2,
    minStock: 5,
    soldByWeight: true,
    unitLabel: 'كجم',
  },
  {
    id: 'prod-detergent',
    name: 'منظف أرضيات 1 لتر',
    barcode: '6281000010036',
    wholesaleBarcode: '6281000011033',
    department: 'المنظفات',
    measurementType: 'unit',
    purchaseCostBasis: 'wholesale',
    retailUnit: 'عبوة',
    wholesaleUnit: 'شدة',
    wholesaleQuantity: 12,
    retailPurchasePrice: 3000,
    wholesalePurchasePrice: 36000,
    retailSalePrice: 4500,
    wholesaleSalePrice: 50400,
    purchasePrice: 3000,
    unitPrice: 4500,
    vatRate: 0.15,
    stockQty: 9,
    minStock: 8,
    soldByWeight: false,
    unitLabel: 'عبوة',
  },
  {
    id: 'prod-dates',
    name: 'تمر فاخر 500 جم',
    barcode: '6281000010043',
    wholesaleBarcode: '6281000011040',
    department: 'التمور',
    measurementType: 'unit',
    purchaseCostBasis: 'wholesale',
    retailUnit: 'علبة',
    wholesaleUnit: 'كارتونة',
    wholesaleQuantity: 20,
    retailPurchasePrice: 4100,
    wholesalePurchasePrice: 82000,
    retailSalePrice: 6000,
    wholesaleSalePrice: 110000,
    purchasePrice: 4100,
    unitPrice: 6000,
    vatRate: 0.15,
    stockQty: 31,
    minStock: 7,
    soldByWeight: false,
    unitLabel: 'علبة',
  },
]

const stockMovements: StockMovement[] = []

function createMovementId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `movement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function recordStockMovement(input: Omit<StockMovement, 'id' | 'createdAt'>) {
  const movement: StockMovement = {
    ...input,
    id: createMovementId(),
    createdAt: new Date().toISOString(),
  }

  stockMovements.unshift(movement)

  return movement
}

export function listCatalogProducts() {
  return catalogProducts.map((product) => ({ ...product }))
}

export function listStockMovements() {
  return stockMovements.map((movement) => ({ ...movement }))
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3))
}

function generateProductId() {
  return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeCatalogProduct(id: string, input: ProductUpsertInput): CatalogProduct {
  const wholesaleEnabled = Boolean(input.wholesaleUnit && input.wholesaleQuantity && input.wholesaleQuantity > 0)
  const retailPurchasePrice = Number(input.retailPurchasePrice.toFixed(2))
  const retailSalePrice = Number(input.retailSalePrice.toFixed(2))

  return {
    id,
    name: input.name,
    barcode: input.barcode,
    wholesaleBarcode: wholesaleEnabled ? input.wholesaleBarcode : undefined,
    plu: input.plu,
    department: input.department,
    measurementType: input.measurementType,
    purchaseCostBasis: wholesaleEnabled ? input.purchaseCostBasis : 'retail',
    retailUnit: input.retailUnit,
    wholesaleUnit: wholesaleEnabled ? input.wholesaleUnit : undefined,
    wholesaleQuantity: wholesaleEnabled ? roundQuantity(input.wholesaleQuantity ?? 0) : undefined,
    retailPurchasePrice,
    wholesalePurchasePrice: wholesaleEnabled && input.wholesalePurchasePrice !== undefined ? Number(input.wholesalePurchasePrice.toFixed(2)) : undefined,
    retailSalePrice,
    wholesaleSalePrice: wholesaleEnabled && input.wholesaleSalePrice !== undefined ? Number(input.wholesaleSalePrice.toFixed(2)) : undefined,
    purchasePrice: retailPurchasePrice,
    unitPrice: retailSalePrice,
    vatRate: input.vatRate,
    stockQty: roundQuantity(input.stockQty),
    minStock: roundQuantity(input.minStock),
    soldByWeight: input.measurementType === 'weight',
    unitLabel: input.retailUnit,
  }
}

function assertUniqueBarcode(barcode: string, excludedProductId?: string) {
  const existingProduct = catalogProducts.find((product) => {
    if (product.id === excludedProductId) {
      return false
    }

    return product.barcode === barcode || product.wholesaleBarcode === barcode
  })

  if (existingProduct) {
    throw new Error('الباركود مستخدم مسبقاً لصنف آخر.')
  }
}

function assertUniqueWholesaleBarcode(wholesaleBarcode: string | undefined, excludedProductId?: string) {
  if (!wholesaleBarcode) {
    return
  }

  const existingProduct = catalogProducts.find((product) => {
    if (product.id === excludedProductId) {
      return false
    }

    return product.barcode === wholesaleBarcode || product.wholesaleBarcode === wholesaleBarcode
  })

  if (existingProduct) {
    throw new Error('باركود الجملة مستخدم مسبقاً لصنف آخر.')
  }
}

function assertUniquePlu(plu: string | undefined, excludedProductId?: string) {
  if (!plu) {
    return
  }

  const existingProduct = catalogProducts.find(
    (product) => product.plu === plu && product.id !== excludedProductId,
  )

  if (existingProduct) {
    throw new Error('رمز PLU مستخدم مسبقاً لصنف آخر.')
  }
}

export function applySaleToInventory(lines: ProductSaleLine[]) {
  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`)
    }

    if (roundQuantity(line.quantity) > roundQuantity(product.stockQty)) {
      throw new Error(`الكمية المطلوبة من ${line.name} تتجاوز الرصيد المتاح حالياً.`)
    }
  }

  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      continue
    }

    product.stockQty = roundQuantity(product.stockQty - line.quantity)
    recordStockMovement({
      productId: product.id,
      productName: product.name,
      movementType: 'sale',
      quantityDelta: roundQuantity(-line.quantity),
      balanceAfter: product.stockQty,
      note: `خصم بيع عبر POS للصنف ${line.name}`,
    })
  }
}

export function adjustProductStock(input: {
  productId: string
  quantityDelta: number
  note: string
}) {
  const product = catalogProducts.find((entry) => entry.id === input.productId)

  if (!product) {
    throw new Error('الصنف المطلوب غير موجود.')
  }

  const nextBalance = roundQuantity(product.stockQty + input.quantityDelta)

  if (nextBalance < 0) {
    throw new Error(`لا يمكن أن يصبح رصيد ${product.name} أقل من الصفر.`)
  }

  product.stockQty = nextBalance

  recordStockMovement({
    productId: product.id,
    productName: product.name,
    movementType: 'adjustment',
    quantityDelta: roundQuantity(input.quantityDelta),
    balanceAfter: product.stockQty,
    note: input.note,
  })

  return { ...product }
}

export function restoreSaleToInventory(lines: ProductSaleLine[], reason: string) {
  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`)
    }
  }

  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      continue
    }

    product.stockQty = roundQuantity(product.stockQty + line.quantity)
    recordStockMovement({
      productId: product.id,
      productName: product.name,
      movementType: 'return',
      quantityDelta: roundQuantity(line.quantity),
      balanceAfter: product.stockQty,
      note: `مرتجع مبيعات: ${reason}`,
    })
  }
}

export function receivePurchaseToInventory(lines: Array<{
  productId: string
  name: string
  quantity: number
  retailQuantity: number
  retailUnitCost: number
  wholesaleUnitCost?: number
}>, note: string) {
  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`)
    }

    if (roundQuantity(line.retailQuantity) <= 0) {
      throw new Error(`كمية الاستلام للصنف ${line.name} يجب أن تكون أكبر من الصفر.`)
    }
  }

  for (const line of lines) {
    const product = catalogProducts.find((entry) => entry.id === line.productId)

    if (!product) {
      continue
    }

    product.stockQty = roundQuantity(product.stockQty + line.retailQuantity)
    product.purchasePrice = Number(line.retailUnitCost.toFixed(2))
    product.retailPurchasePrice = Number(line.retailUnitCost.toFixed(2))
    if (line.wholesaleUnitCost !== undefined) {
      product.wholesalePurchasePrice = Number(line.wholesaleUnitCost.toFixed(2))
    } else if (product.wholesaleQuantity && product.wholesaleQuantity > 0) {
      product.wholesalePurchasePrice = Number((line.retailUnitCost * product.wholesaleQuantity).toFixed(2))
    }
    recordStockMovement({
      productId: product.id,
      productName: product.name,
      movementType: 'purchase',
      quantityDelta: roundQuantity(line.retailQuantity),
      balanceAfter: product.stockQty,
      note,
    })
  }
}

export function createCatalogProduct(input: ProductUpsertInput) {
  assertUniqueBarcode(input.barcode)
  assertUniqueWholesaleBarcode(input.wholesaleBarcode)
  assertUniquePlu(input.plu)

  const product = normalizeCatalogProduct(generateProductId(), input)

  catalogProducts.unshift(product)

  if (product.stockQty > 0) {
    recordStockMovement({
      productId: product.id,
      productName: product.name,
      movementType: 'adjustment',
      quantityDelta: product.stockQty,
      balanceAfter: product.stockQty,
      note: 'رصيد افتتاحي عند إنشاء الصنف',
    })
  }

  return { ...product }
}

export function updateCatalogProduct(productId: string, input: ProductUpsertInput) {
  const product = catalogProducts.find((entry) => entry.id === productId)

  if (!product) {
    throw new Error('الصنف المطلوب غير موجود.')
  }

  assertUniqueBarcode(input.barcode, productId)
  assertUniqueWholesaleBarcode(input.wholesaleBarcode, productId)
  assertUniquePlu(input.plu, productId)

  const previousStockQty = product.stockQty

  Object.assign(product, normalizeCatalogProduct(productId, input))

  const stockDelta = roundQuantity(product.stockQty - previousStockQty)

  if (stockDelta !== 0) {
    recordStockMovement({
      productId: product.id,
      productName: product.name,
      movementType: 'adjustment',
      quantityDelta: stockDelta,
      balanceAfter: product.stockQty,
      note: 'تعديل بيانات الصنف وتحديث الرصيد',
    })
  }

  return { ...product }
}

export function deleteCatalogProduct(productId: string) {
  const productIndex = catalogProducts.findIndex((entry) => entry.id === productId)

  if (productIndex < 0) {
    throw new Error('الصنف المطلوب غير موجود.')
  }

  const product = catalogProducts[productIndex]

  if (product.stockQty > 0) {
    throw new Error('لا يمكن حذف صنف لا يزال لديه رصيد مخزني. صفّر الرصيد أولاً.')
  }

  catalogProducts.splice(productIndex, 1)

  return { ...product }
}
