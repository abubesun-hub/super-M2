export type Product = {
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

export type SaleUnitMode = 'retail' | 'wholesale'

export type CartLine = {
  lineId: string
  productId: string
  name: string
  barcode: string
  quantity: number
  baseQuantity: number
  unitPrice: number
  vatRate: number
  lineTotal: number
  stockQty: number
  minStock: number
  unitLabel: string
  saleUnit: SaleUnitMode
  retailUnit: string
  wholesaleQuantity?: number
  source: 'barcode' | 'scale' | 'manual'
}

export type ScaleBarcodeResult = {
  plu: string
  totalPrice: number
}

export type ProductScanMatch = {
  product: Product
  saleUnit: SaleUnitMode
  matchedBarcode: string
}

export const sampleCatalog: Product[] = [
  {
    id: 'prod-water',
    name: 'مياه معدنية 600 مل',
    barcode: '6281000010012',
    wholesaleBarcode: '6281000011019',
    department: 'المشروبات',
    measurementType: 'unit',
    purchaseCostBasis: 'wholesale',
    retailUnit: 'عبوة',
    wholesaleUnit: 'كارتون',
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
    retailUnit: 'كغم',
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
    retailUnit: 'كغم',
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
    wholesaleUnit: 'كارتون',
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
    unitLabel: 'علبة',
  },
]

export function parseScaleBarcode(scan: string): ScaleBarcodeResult | null {
  const digits = scan.replace(/\D/g, '')

  if (digits.length !== 13 || !digits.startsWith('24')) {
    return null
  }

  const plu = digits.slice(2, 6)
  const totalPrice = Number(digits.slice(6, 11))

  if (!plu || totalPrice <= 0) {
    return null
  }

  return { plu, totalPrice }
}

export function findProductByScan(products: Product[], scan: string): ProductScanMatch | null {
  const exactRetail = products.find((product) => product.barcode === scan)
  if (exactRetail) {
    return {
      product: exactRetail,
      saleUnit: 'retail',
      matchedBarcode: exactRetail.barcode,
    }
  }

  const exactWholesale = products.find((product) => product.wholesaleBarcode === scan)
  if (exactWholesale && hasWholesaleOption(exactWholesale)) {
    return {
      product: exactWholesale,
      saleUnit: 'wholesale',
      matchedBarcode: exactWholesale.wholesaleBarcode ?? scan,
    }
  }

  const parsed = parseScaleBarcode(scan)
  if (!parsed) {
    return null
  }

  const weightedProduct = products.find((product) => product.plu === parsed.plu) ?? null

  return weightedProduct
    ? {
        product: weightedProduct,
        saleUnit: 'retail',
        matchedBarcode: scan,
      }
    : null
}

export function hasWholesaleOption(product: Product) {
  return Boolean(
    product.wholesaleUnit &&
    product.wholesaleQuantity &&
    product.wholesaleQuantity > 0 &&
    product.wholesaleSalePrice !== undefined,
  )
}

export function getSaleUnitLabel(product: Product, saleUnit: SaleUnitMode) {
  return saleUnit === 'wholesale' && product.wholesaleUnit ? product.wholesaleUnit : product.retailUnit
}

export function getSaleUnitPrice(product: Product, saleUnit: SaleUnitMode) {
  return saleUnit === 'wholesale' && product.wholesaleSalePrice !== undefined
    ? product.wholesaleSalePrice
    : product.retailSalePrice
}

export function getSaleBarcode(product: Product, saleUnit: SaleUnitMode) {
  return saleUnit === 'wholesale' && product.wholesaleBarcode
    ? product.wholesaleBarcode
    : product.barcode
}

export function getBaseQuantity(product: Product, quantity: number, saleUnit: SaleUnitMode) {
  if (saleUnit === 'wholesale' && product.wholesaleQuantity) {
    return roundQuantity(quantity * product.wholesaleQuantity)
  }

  return roundQuantity(quantity)
}

export function getLineId(productId: string, saleUnit: SaleUnitMode) {
  return `${productId}:${saleUnit}`
}

export function getProductSaleModes(product: Product): SaleUnitMode[] {
  return hasWholesaleOption(product) ? ['retail', 'wholesale'] : ['retail']
}

export function createCartLine(
  product: Product,
  source: CartLine['source'],
  quantity = 1,
  saleUnit: SaleUnitMode = 'retail',
): CartLine {
  const safeQuantity = roundQuantity(quantity)
  const baseQuantity = getBaseQuantity(product, safeQuantity, saleUnit)
  const unitPrice = getSaleUnitPrice(product, saleUnit)
  const lineTotal = roundMoney(unitPrice * safeQuantity)

  return {
    lineId: getLineId(product.id, saleUnit),
    productId: product.id,
    name: product.name,
    barcode: getSaleBarcode(product, saleUnit),
    quantity: safeQuantity,
    baseQuantity,
    unitPrice,
    vatRate: product.vatRate,
    lineTotal,
    stockQty: product.stockQty,
    minStock: product.minStock,
    unitLabel: getSaleUnitLabel(product, saleUnit),
    saleUnit,
    retailUnit: product.retailUnit,
    wholesaleQuantity: product.wholesaleQuantity,
    source,
  }
}

export function addLineToCart(cart: CartLine[], nextLine: CartLine): CartLine[] {
  const existingLine = cart.find((line) => line.lineId === nextLine.lineId)

  if (!existingLine) {
    return [...cart, nextLine]
  }

  return cart.map((line) => {
    if (line.lineId !== nextLine.lineId) {
      return line
    }

    const quantity = roundQuantity(line.quantity + nextLine.quantity)
    const baseQuantity = roundQuantity(line.baseQuantity + nextLine.baseQuantity)
    return {
      ...line,
      quantity,
      baseQuantity,
      lineTotal: roundMoney(quantity * line.unitPrice),
      source: nextLine.source,
    }
  })
}

export function updateCartLineQuantity(
  cart: CartLine[],
  lineId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) {
    return cart.filter((line) => line.lineId !== lineId)
  }

  return cart.map((line) => {
    if (line.lineId !== lineId) {
      return line
    }

    const safeQuantity = roundQuantity(quantity)
    const multiplier = line.saleUnit === 'wholesale' ? line.wholesaleQuantity ?? 1 : 1
    const baseQuantity = roundQuantity(safeQuantity * multiplier)
    return {
      ...line,
      quantity: safeQuantity,
      baseQuantity,
      lineTotal: roundMoney(safeQuantity * line.unitPrice),
    }
  })
}

export function calculateTotals(cart: CartLine[]) {
  const subtotal = roundMoney(cart.reduce((sum, line) => sum + line.lineTotal, 0))
  const vat = roundMoney(
    cart.reduce((sum, line) => sum + line.lineTotal - line.lineTotal / (1 + line.vatRate), 0),
  )
  const total = roundMoney(subtotal)

  return { subtotal, vat, total }
}

export function getCartWarnings(cart: CartLine[]) {
  const warnings: string[] = []
  const aggregatedByProduct = new Map<string, {
    name: string
    stockQty: number
    minStock: number
    retailUnit: string
    totalBaseQuantity: number
  }>()

  for (const line of cart) {
    const current = aggregatedByProduct.get(line.productId)

    if (current) {
      current.totalBaseQuantity = roundQuantity(current.totalBaseQuantity + line.baseQuantity)
      continue
    }

    aggregatedByProduct.set(line.productId, {
      name: line.name,
      stockQty: line.stockQty,
      minStock: line.minStock,
      retailUnit: line.retailUnit,
      totalBaseQuantity: line.baseQuantity,
    })
  }

  for (const product of aggregatedByProduct.values()) {
    if (product.stockQty <= product.minStock) {
      warnings.push(`الصنف ${product.name} وصل إلى حد إعادة الطلب الأدنى.`)
    }

    if (product.totalBaseQuantity > product.stockQty) {
      warnings.push(`الكمية المباعة من ${product.name} تتجاوز الرصيد المتاح حالياً. المطلوب ${roundQuantity(product.totalBaseQuantity)} ${product.retailUnit} والمتاح ${roundQuantity(product.stockQty)} ${product.retailUnit}.`)
    }
  }

  return warnings
}

export function getCartStockConflict(cart: CartLine[]) {
  return getCartWarnings(cart).find((warning) => warning.includes('تتجاوز الرصيد المتاح حالياً')) ?? null
}

export function getStockQuantityForSaleUnit(
  stockQty: number,
  saleUnit: SaleUnitMode,
  wholesaleQuantity?: number,
) {
  if (saleUnit === 'wholesale' && wholesaleQuantity && wholesaleQuantity > 0) {
    return roundQuantity(stockQty / wholesaleQuantity)
  }

  return roundQuantity(stockQty)
}

export function getProductStockSummaries(product: Product) {
  const retailSummary = `${formatStockQuantity(product.stockQty)} ${product.retailUnit}`

  if (!hasWholesaleOption(product) || !product.wholesaleUnit || !product.wholesaleQuantity) {
    return {
      retail: retailSummary,
      wholesale: null,
    }
  }

  return {
    retail: retailSummary,
    wholesale: formatWholesaleStockQuantity(
      product.stockQty,
      product.wholesaleQuantity,
      product.wholesaleUnit,
      product.retailUnit,
    ),
  }
}

export function getCartLineStockSummary(line: CartLine) {
  if (line.saleUnit === 'wholesale' && line.wholesaleQuantity) {
    return formatWholesaleStockQuantity(line.stockQty, line.wholesaleQuantity, line.unitLabel, line.retailUnit)
  }

  const quantity = getStockQuantityForSaleUnit(line.stockQty, line.saleUnit, line.wholesaleQuantity)
  return `${formatStockQuantity(quantity)} ${line.unitLabel}`
}

export function getCartLineMaxSaleQuantity(line: CartLine) {
  if (line.saleUnit === 'wholesale' && line.wholesaleQuantity) {
    return Math.floor(line.stockQty / line.wholesaleQuantity)
  }

  return roundQuantity(line.stockQty)
}

function formatWholesaleStockQuantity(
  stockQty: number,
  wholesaleQuantity: number,
  wholesaleUnit: string,
  retailUnit: string,
) {
  if (wholesaleQuantity <= 0) {
    return `${formatStockQuantity(stockQty)} ${retailUnit}`
  }

  const fullWholesale = Math.floor(stockQty / wholesaleQuantity)
  const remainderRetail = roundQuantity(stockQty - fullWholesale * wholesaleQuantity)

  if (remainderRetail <= 0) {
    return `${formatStockQuantity(fullWholesale)} ${wholesaleUnit}`
  }

  if (fullWholesale <= 0) {
    return `${formatStockQuantity(remainderRetail)} ${retailUnit}`
  }

  return `${formatStockQuantity(fullWholesale)} ${wholesaleUnit} + ${formatStockQuantity(remainderRetail)} ${retailUnit}`
}

function formatStockQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

export function roundQuantity(value: number) {
  return Number(value.toFixed(3))
}
