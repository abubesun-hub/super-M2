import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { FamilyVariantsPanel } from '../components/FamilyVariantsPanel'
import { SuggestionInput } from '../components/SuggestionInput'
import { useEmployeeSession } from '../lib/auth'
import { formatMoney } from '../lib/currency'
import { buildExpiryAlertSummary, type ExpiryAlertSummary } from '../lib/expiry-alerts'
import { exportRowsToCsv } from '../lib/export'
import { fetchPurchaseReceipts } from '../lib/purchases-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  createProduct,
  deleteProduct,
  fetchInventoryBatches,
  fetchProducts,
  fetchStockMovements,
  submitStockAdjustment,
  updateProduct,
  type InventoryBatch,
  type StockMovement,
} from '../lib/products-api'
import { buildProductDisplayName, roundMoney, type Product } from '../lib/pos'

type ProductFormState = {
  name: string
  variantLabel: string
  barcode: string
  wholesaleBarcode: string
  plu: string
  department: string
  measurementType: 'unit' | 'weight'
  purchaseCostBasis: 'retail' | 'wholesale'
  retailUnit: string
  wholesaleEnabled: boolean
  wholesaleUnit: string
  wholesaleQuantity: string
  retailPurchasePrice: string
  wholesalePurchasePrice: string
  retailSalePrice: string
  wholesaleSalePrice: string
  vatRate: string
  stockQty: string
  minStock: string
}

const unitRetailUnits = ['قطعة', 'عبوة', 'علبة', 'ربطة']
const unitWholesaleUnits = ['شدة', 'كارتون', 'كيس', 'ربطة كبيرة']
const weightRetailUnits = ['كغم', 'غرام']
const weightWholesaleUnits = ['كيس', 'شوال', 'تنكة']

const emptyProductForm: ProductFormState = {
  name: '',
  variantLabel: '',
  barcode: '',
  wholesaleBarcode: '',
  plu: '',
  department: '',
  measurementType: 'unit',
  purchaseCostBasis: 'retail',
  retailUnit: 'عبوة',
  wholesaleEnabled: false,
  wholesaleUnit: 'كارتون',
  wholesaleQuantity: '',
  retailPurchasePrice: '',
  wholesalePurchasePrice: '',
  retailSalePrice: '',
  wholesaleSalePrice: '',
  vatRate: '0.15',
  stockQty: '0',
  minStock: '0',
}

function formatQuantity(value: number | undefined | null) {
  if (typeof value !== 'number' || isNaN(value)) return 'غير محدد';
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatDate(value: string | undefined | null) {
  if (!value) return 'غير محدد';
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'غير محدد';
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getRetailUnitOptions(measurementType: ProductFormState['measurementType']) {
  return measurementType === 'weight' ? weightRetailUnits : unitRetailUnits
}

function getWholesaleUnitOptions(measurementType: ProductFormState['measurementType']) {
  return measurementType === 'weight' ? weightWholesaleUnits : unitWholesaleUnits
}

function getPurchaseBasisLabel(product: Product) {
  return product.purchaseCostBasis === 'wholesale' ? 'الكلفة الأصلية محفوظة على الجملة' : 'الكلفة الأصلية محفوظة على المفرد'
}

function isPendingSalePricing(product: Product) {
  const retailPending = product.retailSalePrice <= 0
  const wholesalePending = Boolean(product.wholesaleUnit && product.wholesaleQuantity && (product.wholesaleSalePrice ?? 0) <= 0)
  return retailPending || wholesalePending
}

function getInventoryWorkflowHint(product: Product) {
  if (isPendingSalePricing(product)) {
    return 'تم استلام بيانات الشراء، ويبقى تحديد سعر البيع قبل الاعتماد الكامل في الكاشير.'
  }

  return 'بيانات الشراء والتسعير مكتملة، والصنف جاهز للبيع حسب وحداته المعرفة.'
}

function getMovementTypeLabel(movementType: StockMovement['movementType']) {
  return movementType === 'sale'
    ? 'بيع'
    : movementType === 'return'
      ? 'مرتجع'
      : movementType === 'purchase'
        ? 'شراء'
        : 'تعديل'
}

function getExpiryCardClasses(severity: 'expired' | 'critical' | 'warning') {
  return severity === 'expired'
    ? 'border-rose-200 bg-rose-50/90 text-rose-900'
    : severity === 'critical'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : 'border-sky-200 bg-sky-50/90 text-sky-900'
}

function getExpiryBadgeClasses(severity: 'expired' | 'critical' | 'warning') {
  return severity === 'expired'
    ? 'bg-rose-100 text-rose-800'
    : severity === 'critical'
      ? 'bg-amber-100 text-amber-800'
      : 'bg-sky-100 text-sky-800'
}

function getExpiryLabel(daysUntilExpiry: number) {
  if (daysUntilExpiry < 0) {
    return `منتهي منذ ${Math.abs(daysUntilExpiry)} يوم`
  }

  if (daysUntilExpiry === 0) {
    return 'ينتهي اليوم'
  }

  return `متبقّي ${daysUntilExpiry} يوم`
}

function createProductForm(product: Product): ProductFormState {
  return {
    name: product.productFamilyName,
    variantLabel: product.variantLabel ?? '',
    barcode: product.barcode,
    wholesaleBarcode: product.wholesaleBarcode ?? '',
    plu: product.plu ?? '',
    department: product.department,
    measurementType: product.measurementType,
    purchaseCostBasis: product.purchaseCostBasis,
    retailUnit: product.retailUnit,
    wholesaleEnabled: Boolean(product.wholesaleUnit && product.wholesaleQuantity),
    wholesaleUnit: product.wholesaleUnit ?? getWholesaleUnitOptions(product.measurementType)[0],
    wholesaleQuantity: product.wholesaleQuantity ? String(product.wholesaleQuantity) : '',
    retailPurchasePrice: String(product.retailPurchasePrice),
    wholesalePurchasePrice: product.wholesalePurchasePrice ? String(product.wholesalePurchasePrice) : '',
    retailSalePrice: String(product.retailSalePrice),
    wholesaleSalePrice: product.wholesaleSalePrice ? String(product.wholesaleSalePrice) : '',
    vatRate: String(product.vatRate),
    stockQty: String(product.stockQty),
    minStock: String(product.minStock),
  }
}

type ProductFamilyGroup = {
  familyName: string
  departments: string[]
  products: Product[]
  variantCount: number
  lowStockCount: number
  totalStockQty: number
  totalInventoryValue: number
  hasExpiryAlert: boolean
}

type ProductFamilyProfile = {
  familyName: string
  variantSuggestions: string[]
  department: string
  measurementType: ProductFormState['measurementType']
  purchaseCostBasis: ProductFormState['purchaseCostBasis']
  retailUnit: string
  wholesaleEnabled: boolean
  wholesaleUnit: string
  wholesaleQuantity: string
  vatRate: string
  skuCount: number
  totalStockQty: number
}

export function InventoryPage() {
  const { session } = useEmployeeSession()
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatch[]>([])
  const [expirySummary, setExpirySummary] = useState<ExpiryAlertSummary>({
    alerts: [],
    expiredCount: 0,
    criticalCount: 0,
    warningCount: 0,
    affectedProductsCount: 0,
  })
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantityDelta, setQuantityDelta] = useState('')
  const [note, setNote] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'weighted' | 'expiry' | 'unpriced'>('all')
  const [movementQuery, setMovementQuery] = useState('')
  const [movementFilter, setMovementFilter] = useState<'all' | 'sale' | 'adjustment' | 'return' | 'purchase'>('all')
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function syncProductForm(nextProducts: Product[], currentEditingId: string | null) {
    if (!currentEditingId) {
      return
    }

    const selectedProduct = nextProducts.find((product) => product.id === currentEditingId)

    if (!selectedProduct) {
      setEditingProductId(null)
      setProductForm(emptyProductForm)
      return
    }

    setProductForm(createProductForm(selectedProduct))
  }

  async function loadInventoryData() {
    setIsLoading(true)

    try {
      const [nextProducts, nextMovements, nextReceipts, nextBatches] = await Promise.all([
        fetchProducts(),
        fetchStockMovements(),
        fetchPurchaseReceipts(),
        fetchInventoryBatches(),
      ])
      setProducts(nextProducts)
      setMovements(nextMovements)
      setInventoryBatches(nextBatches.filter((batch) => batch.remainingQuantity > 0))
      setExpirySummary(buildExpiryAlertSummary(nextReceipts, nextProducts))
      setSelectedProductId((currentValue) => currentValue || nextProducts[0]?.id || '')
      syncProductForm(nextProducts, editingProductId)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات المخزون.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadInventoryData()
  }, [])

  function resetProductForm() {
    setEditingProductId(null)
    setProductForm(emptyProductForm)
  }

  function buildProductFormForFamily(name: string): ProductFormState {
    const matchedProfile = getFamilyProfileByName(name)

    if (!matchedProfile) {
      return {
        ...emptyProductForm,
        name,
      }
    }

    return {
      ...emptyProductForm,
      name,
      department: matchedProfile.department,
      measurementType: matchedProfile.measurementType,
      purchaseCostBasis: matchedProfile.wholesaleEnabled ? matchedProfile.purchaseCostBasis : 'retail',
      retailUnit: matchedProfile.retailUnit,
      wholesaleEnabled: matchedProfile.wholesaleEnabled,
      wholesaleUnit: matchedProfile.wholesaleUnit,
      wholesaleQuantity: matchedProfile.wholesaleQuantity,
      vatRate: matchedProfile.vatRate,
    }
  }

  function startNewVariantForFamily(name: string) {
    const normalizedFamilyName = name.trim()

    if (!normalizedFamilyName) {
      return
    }

    setEditingProductId(null)
    setProductForm(buildProductFormForFamily(normalizedFamilyName))
    setMessage(`تم تجهيز النموذج لإضافة صنف فرعي جديد تحت عائلة ${normalizedFamilyName}.`)
  }

  function startEditingProduct(product: Product) {
    setEditingProductId(product.id)
    setProductForm(createProductForm(product))
  }

  async function handleProductSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const wholesaleEnabled = productForm.wholesaleEnabled
    const wholesaleQuantity = wholesaleEnabled ? Number(productForm.wholesaleQuantity) : undefined
    let retailPurchasePrice = Number(productForm.retailPurchasePrice)
    let wholesalePurchasePrice = wholesaleEnabled && productForm.wholesalePurchasePrice !== '' ? Number(productForm.wholesalePurchasePrice) : undefined
    const retailSalePrice = Number(productForm.retailSalePrice)
    const wholesaleSalePrice = wholesaleEnabled ? Number(productForm.wholesaleSalePrice) : undefined
    const vatRate = Number(productForm.vatRate)
    const stockQty = Number(productForm.stockQty)
    const minStock = Number(productForm.minStock)

    if (productForm.name.trim().length < 3 || productForm.department.trim().length < 2) {
      setMessage('أكمل اسم المنتج الرئيسي والقسم بشكل صحيح.')
      return
    }

    if (!Number.isFinite(vatRate) || !Number.isFinite(stockQty) || !Number.isFinite(minStock) || !Number.isFinite(retailSalePrice)) {
      setMessage('تحقق من الأسعار والكميات المدخلة.')
      return
    }

    if (wholesaleEnabled && (!Number.isFinite(wholesaleQuantity) || (wholesaleQuantity ?? 0) <= 0)) {
      setMessage('أدخل عدد المفرد داخل وحدة الجملة بشكل صحيح.')
      return
    }

    if (productForm.purchaseCostBasis === 'wholesale') {
      if (!wholesaleEnabled) {
        setMessage('فعّل وحدة الجملة أولاً قبل اعتماد تكلفة الجملة.')
        return
      }

      if (!Number.isFinite(wholesalePurchasePrice) || (wholesalePurchasePrice ?? 0) < 0) {
        setMessage('أدخل تكلفة شراء الجملة بشكل صحيح.')
        return
      }

      retailPurchasePrice = roundMoney((wholesalePurchasePrice ?? 0) / (wholesaleQuantity ?? 1))
    } else {
      if (!Number.isFinite(retailPurchasePrice) || retailPurchasePrice < 0) {
        setMessage('أدخل تكلفة شراء المفرد بشكل صحيح.')
        return
      }

      if (wholesaleEnabled && (!Number.isFinite(wholesalePurchasePrice) || wholesalePurchasePrice === undefined)) {
        wholesalePurchasePrice = roundMoney(retailPurchasePrice * (wholesaleQuantity ?? 1))
      }
    }

    if (wholesaleEnabled && (!Number.isFinite(wholesaleSalePrice) || (wholesaleSalePrice ?? 0) < 0)) {
      setMessage('أدخل سعر بيع الجملة بشكل صحيح.')
      return
    }

    setIsSubmitting(true)

    try {
      const productFamilyName = productForm.name.trim()
      const variantLabel = productForm.variantLabel.trim() || undefined
      const payload = {
        name: buildProductDisplayName(productFamilyName, variantLabel),
        productFamilyName,
        variantLabel,
        barcode: productForm.barcode.trim(),
        wholesaleBarcode: wholesaleEnabled ? productForm.wholesaleBarcode.trim() || undefined : undefined,
        plu: productForm.plu.trim() || undefined,
        department: productForm.department.trim(),
        measurementType: productForm.measurementType,
        purchaseCostBasis: wholesaleEnabled ? productForm.purchaseCostBasis : 'retail',
        retailUnit: productForm.retailUnit,
        wholesaleUnit: wholesaleEnabled ? productForm.wholesaleUnit : undefined,
        wholesaleQuantity: wholesaleEnabled ? wholesaleQuantity : undefined,
        retailPurchasePrice,
        wholesalePurchasePrice: wholesaleEnabled ? wholesalePurchasePrice : undefined,
        retailSalePrice,
        wholesaleSalePrice: wholesaleEnabled ? wholesaleSalePrice : undefined,
        vatRate,
        stockQty,
        minStock,
      }

      if (editingProductId) {
        await updateProduct(editingProductId, payload)
        setMessage('تم تعديل الصنف بنجاح.')
      } else {
        await createProduct(payload)
        setMessage('تم إنشاء الصنف بنجاح.')
      }

      resetProductForm()
      await loadInventoryData()
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ بيانات الصنف.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteProduct(productId: string) {
    setIsSubmitting(true)

    try {
      await deleteProduct(productId)
      if (editingProductId === productId) {
        resetProductForm()
      }
      await loadInventoryData()
      setMessage('تم حذف الصنف بنجاح.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف الصنف.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAdjustmentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedQuantity = Number(quantityDelta)

    if (!selectedProductId) {
      setMessage('اختر صنفاً أولاً.')
      return
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
      setMessage('أدخل كمية تعديل صحيحة موجبة أو سالبة.')
      return
    }

    if (note.trim().length < 3) {
      setMessage('أدخل سبباً واضحاً للتعديل.')
      return
    }

    setIsSubmitting(true)

    try {
      await submitStockAdjustment({
        productId: selectedProductId,
        quantityDelta: parsedQuantity,
        note: note.trim(),
      })
      await loadInventoryData()
      setQuantityDelta('')
      setNote('')
      setMessage('تم تنفيذ تعديل المخزون بنجاح.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تنفيذ التعديل.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const lowStockProducts = products.filter((product) => product.stockQty <= product.minStock)
  const pendingSalePricingProducts = products.filter((product) => isPendingSalePricing(product))
  const inventoryValue = products.reduce((sum, product) => sum + product.retailSalePrice * product.stockQty, 0)
  const activeInventoryBatches = inventoryBatches.filter((batch) => batch.remainingQuantity > 0)
  const expiryAlertsByProduct = new Map<string, ExpiryAlertSummary['alerts']>()
  const batchesByProduct = new Map<string, InventoryBatch[]>()

  for (const alert of expirySummary.alerts) {
    const currentAlerts = expiryAlertsByProduct.get(alert.productId) ?? []
    currentAlerts.push(alert)
    expiryAlertsByProduct.set(alert.productId, currentAlerts)
  }

  for (const batch of activeInventoryBatches) {
    const currentBatches = batchesByProduct.get(batch.productId) ?? []
    currentBatches.push(batch)
    batchesByProduct.set(batch.productId, currentBatches)
  }

  const filteredProducts = products.filter((product) => {
    const normalizedQuery = productQuery.trim()
    const matchesQuery =
      normalizedQuery.length === 0 ||
      product.name.includes(normalizedQuery) ||
      product.productFamilyName.includes(normalizedQuery) ||
      product.variantLabel?.includes(normalizedQuery) ||
      product.barcode.includes(normalizedQuery) ||
      product.wholesaleBarcode?.includes(normalizedQuery) ||
      product.department.includes(normalizedQuery)

    const matchesStockFilter =
      stockFilter === 'all' ||
      (stockFilter === 'low' && product.stockQty <= product.minStock) ||
      (stockFilter === 'weighted' && Boolean(product.soldByWeight)) ||
      (stockFilter === 'expiry' && expiryAlertsByProduct.has(product.id)) ||
      (stockFilter === 'unpriced' && isPendingSalePricing(product))

    return matchesQuery && matchesStockFilter
  })
  const filteredMovements = movements.filter((movement) => {
    const normalizedQuery = movementQuery.trim()
    const matchesQuery =
      normalizedQuery.length === 0 ||
      movement.productName.includes(normalizedQuery) ||
      movement.note.includes(normalizedQuery)

    const matchesMovementFilter =
      movementFilter === 'all' || movement.movementType === movementFilter

    return matchesQuery && matchesMovementFilter
  })
  const filteredProductFamilies = Array.from(
    filteredProducts.reduce((families, product) => {
      const existingFamily = families.get(product.productFamilyName)

      if (existingFamily) {
        existingFamily.products.push(product)
        existingFamily.variantCount += product.variantLabel ? 1 : 0
        existingFamily.lowStockCount += product.stockQty <= product.minStock ? 1 : 0
        existingFamily.totalStockQty += product.stockQty
        existingFamily.totalInventoryValue += product.retailSalePrice * product.stockQty
        existingFamily.hasExpiryAlert = existingFamily.hasExpiryAlert || expiryAlertsByProduct.has(product.id)
        if (!existingFamily.departments.includes(product.department)) {
          existingFamily.departments.push(product.department)
        }
        return families
      }

      families.set(product.productFamilyName, {
        familyName: product.productFamilyName,
        departments: [product.department],
        products: [product],
        variantCount: product.variantLabel ? 1 : 0,
        lowStockCount: product.stockQty <= product.minStock ? 1 : 0,
        totalStockQty: product.stockQty,
        totalInventoryValue: product.retailSalePrice * product.stockQty,
        hasExpiryAlert: expiryAlertsByProduct.has(product.id),
      })

      return families
    }, new Map<string, ProductFamilyGroup>()),
  )
    .map(([, family]) => ({
      ...family,
      departments: family.departments.sort((left, right) => left.localeCompare(right, 'ar')),
      products: family.products.slice().sort((left, right) => {
        if (left.variantLabel && right.variantLabel) {
          return left.variantLabel.localeCompare(right.variantLabel, 'ar')
        }

        if (left.variantLabel) {
          return 1
        }

        if (right.variantLabel) {
          return -1
        }

        return left.name.localeCompare(right.name, 'ar')
      }),
    }))
    .sort((left, right) => left.familyName.localeCompare(right.familyName, 'ar'))
  const productFamilyProfiles = Array.from(
    products.reduce((profiles, product) => {
      const existingProfile = profiles.get(product.productFamilyName)

      if (existingProfile) {
        if (product.variantLabel && !existingProfile.variantSuggestions.includes(product.variantLabel)) {
          existingProfile.variantSuggestions.push(product.variantLabel)
        }

        existingProfile.skuCount += 1
        existingProfile.totalStockQty += product.stockQty

        return profiles
      }

      profiles.set(product.productFamilyName, {
        familyName: product.productFamilyName,
        variantSuggestions: product.variantLabel ? [product.variantLabel] : [],
        department: product.department,
        measurementType: product.measurementType,
        purchaseCostBasis: product.purchaseCostBasis,
        retailUnit: product.retailUnit,
        wholesaleEnabled: Boolean(product.wholesaleUnit && product.wholesaleQuantity),
        wholesaleUnit: product.wholesaleUnit ?? getWholesaleUnitOptions(product.measurementType)[0],
        wholesaleQuantity: product.wholesaleQuantity ? String(product.wholesaleQuantity) : '',
        vatRate: String(roundMoney(product.vatRate * 100)),
        skuCount: 1,
        totalStockQty: product.stockQty,
      })

      return profiles
    }, new Map<string, ProductFamilyProfile>()),
  )
    .map(([, profile]) => ({
      ...profile,
      variantSuggestions: profile.variantSuggestions.sort((left, right) => left.localeCompare(right, 'ar')),
    }))
    .sort((left, right) => left.familyName.localeCompare(right.familyName, 'ar'))
  const latestPurchaseMovementByProduct = new Map<string, StockMovement>()

  for (const movement of movements) {
    if (movement.movementType === 'purchase' && !latestPurchaseMovementByProduct.has(movement.productId)) {
      latestPurchaseMovementByProduct.set(movement.productId, movement)
    }
  }
  const purchasedProductsCount = latestPurchaseMovementByProduct.size

  function getFamilyProfileByName(productFamilyName: string) {
    const normalizedFamilyName = productFamilyName.trim()
    return productFamilyProfiles.find((profile) => profile.familyName === normalizedFamilyName) ?? null
  }

  function getVariantSuggestions(productFamilyName: string) {
    return getFamilyProfileByName(productFamilyName)?.variantSuggestions ?? []
  }

  function getFamilyProducts(productFamilyName: string) {
    const normalizedFamilyName = productFamilyName.trim()

    if (!normalizedFamilyName) {
      return []
    }

    return products
      .filter((product) => product.productFamilyName === normalizedFamilyName)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, 'ar'))
  }

  function getFamilySuggestionOptions() {
    return productFamilyProfiles.map((profile) => ({
      value: profile.familyName,
      description: `${profile.department} | ${profile.measurementType === 'weight' ? 'وزني' : profile.wholesaleEnabled ? 'مفرد + جملة' : 'مفرد'}`,
      meta: `${profile.skuCount} SKU | ${profile.variantSuggestions.length} أصناف فرعية | رصيد ${formatQuantity(profile.totalStockQty)}`,
      searchTerms: profile.variantSuggestions,
    }))
  }

  function getDepartmentSuggestionOptions() {
    return Array.from(
      products.reduce((departments, product) => {
        const departmentName = product.department.trim()

        if (!departmentName) {
          return departments
        }

        const existingDepartment = departments.get(departmentName)

        if (existingDepartment) {
          existingDepartment.productsCount += 1
          existingDepartment.families.add(product.productFamilyName)
          return departments
        }

        departments.set(departmentName, {
          name: departmentName,
          productsCount: 1,
          families: new Set([product.productFamilyName]),
        })

        return departments
      }, new Map<string, { name: string; productsCount: number; families: Set<string> }>()),
    )
      .map(([, department]) => department)
      .sort((left, right) => left.name.localeCompare(right.name, 'ar'))
      .map((department) => ({
        value: department.name,
        title: department.name,
        meta: `${department.productsCount} صنف | ${department.families.size} عائلة`,
      }))
  }

  function getVariantSuggestionOptions(productFamilyName: string) {
    return getFamilyProducts(productFamilyName)
      .filter((product) => Boolean(product.variantLabel?.trim()))
      .map((product) => ({
        value: product.variantLabel?.trim() ?? '',
        title: product.variantLabel?.trim() ?? '',
        description: `باركود: ${product.barcode}`,
        meta: `مخزون ${formatQuantity(product.stockQty)} ${product.retailUnit}`,
      }))
  }

  function handleProductFamilyNameChange(name: string) {
    const matchedProfile = getFamilyProfileByName(name)

    if (!matchedProfile) {
      setProductForm((current) => ({ ...current, name }))
      return
    }

    setProductForm((current) => ({
      ...current,
      name,
      department: matchedProfile.department,
      measurementType: matchedProfile.measurementType,
      purchaseCostBasis: matchedProfile.wholesaleEnabled ? matchedProfile.purchaseCostBasis : 'retail',
      retailUnit: matchedProfile.retailUnit,
      wholesaleEnabled: matchedProfile.wholesaleEnabled,
      wholesaleUnit: matchedProfile.wholesaleUnit,
      wholesaleQuantity: matchedProfile.wholesaleQuantity,
      vatRate: matchedProfile.vatRate,
    }))
  }

  function renderProductCard(product: Product) {
    const latestPurchaseMovement = latestPurchaseMovementByProduct.get(product.id)
    const productExpiryAlerts = expiryAlertsByProduct.get(product.id) ?? []
    const productBatches = (batchesByProduct.get(product.id) ?? []).slice().sort((left, right) => {
      if (left.expiryDate && right.expiryDate) {
        return left.expiryDate.localeCompare(right.expiryDate)
      }

      if (left.expiryDate) {
        return -1
      }

      if (right.expiryDate) {
        return 1
      }

      return left.createdAt.localeCompare(right.createdAt)
    })
    const nearestExpiryAlert = productExpiryAlerts[0]

    return (
      <article key={product.id} className="rounded-[26px] border border-stone-200/80 bg-stone-50/80 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl font-black text-stone-950">{product.name}</h3>
              <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">
                {product.department}
              </span>
              <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-black text-teal-800">
                {getPurchaseBasisLabel(product)}
              </span>
              {product.stockQty <= product.minStock ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                  تنبيه حد أدنى
                </span>
              ) : null}
              {nearestExpiryAlert ? (
                <span className={`rounded-full px-3 py-1 text-xs font-black ${getExpiryBadgeClasses(nearestExpiryAlert.severity)}`}>
                  {nearestExpiryAlert.severity === 'expired'
                    ? 'دفعة منتهية'
                    : nearestExpiryAlert.severity === 'critical'
                      ? 'دفعة تنتهي خلال 7 أيام'
                      : 'دفعة تنتهي خلال 30 يوماً'}
                </span>
              ) : null}
              {isPendingSalePricing(product) ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                  يحتاج تسعير بيع
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                  جاهز للبيع
                </span>
              )}
            </div>
            {product.variantLabel ? (
              <p className="mt-2 text-sm font-bold text-stone-700">
                المنتج الرئيسي: {product.productFamilyName}
                <span className="mx-2 text-stone-400">|</span>
                الصنف الفرعي: {product.variantLabel}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-stone-600">
              باركود المفرد: {product.barcode}
              {product.wholesaleBarcode ? (
                <>
                  <span className="mx-2 text-stone-400">|</span>
                  باركود الجملة: {product.wholesaleBarcode}
                </>
              ) : null}
              <span className="mx-2 text-stone-400">|</span>
              نوع الصنف: {product.measurementType === 'weight' ? 'وزني' : product.wholesaleUnit ? 'مفرد + جملة' : 'مفرد'}
              <span className="mx-2 text-stone-400">|</span>
              تكلفة المفرد: {formatMoney(product.retailPurchasePrice, 'IQD')}
              <span className="mx-2 text-stone-400">|</span>
              سعر مفرد: {formatMoney(product.retailSalePrice, 'IQD')}
              <span className="mx-2 text-stone-400">|</span>
              الحد الأدنى: {formatQuantity(product.minStock)} {product.retailUnit}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              وحدة المفرد: {product.retailUnit}
              {product.wholesaleUnit && product.wholesaleQuantity ? ` | وحدة الجملة: ${product.wholesaleUnit} = ${formatQuantity(product.wholesaleQuantity)} ${product.retailUnit}` : ''}
              {product.wholesaleSalePrice ? ` | سعر الجملة: ${formatMoney(product.wholesaleSalePrice, 'IQD')}` : ''}
              {product.wholesalePurchasePrice ? ` | تكلفة الجملة: ${formatMoney(product.wholesalePurchasePrice, 'IQD')}` : ''}
            </p>
            <div className="mt-3 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700 shadow-sm">
              <p className="font-black text-stone-900">بيانات الإدخال من المشتريات</p>
              <p className="mt-1">
                {getInventoryWorkflowHint(product)}
              </p>
              <p className="mt-1 text-stone-500">
                تكلفة المفرد الحالية {formatMoney(product.retailPurchasePrice, 'IQD')}
                {product.wholesalePurchasePrice ? `، وتكلفة الجملة ${formatMoney(product.wholesalePurchasePrice, 'IQD')}` : ''}
                {product.wholesaleBarcode ? '، مع حفظ باركود الجملة للمسح المباشر.' : '، مع حفظ باركود المفرد فقط لهذا الصنف.'}
              </p>
              {nearestExpiryAlert ? (
                <div className={`mt-3 grid gap-2 rounded-2xl border px-3 py-3 text-sm ${getExpiryCardClasses(nearestExpiryAlert.severity)} md:grid-cols-2`}>
                  <p>
                    <span className="font-black">أقرب انتهاء:</span>{' '}
                    {formatDate(nearestExpiryAlert.expiryDate)}
                  </p>
                  <p>
                    <span className="font-black">الحالة:</span>{' '}
                    {getExpiryLabel(nearestExpiryAlert.daysUntilExpiry)}
                  </p>
                  <p>
                    <span className="font-black">مرجع الدفعة:</span>{' '}
                    {nearestExpiryAlert.receiptNo}
                  </p>
                  <p>
                    <span className="font-black">التشغيلة:</span>{' '}
                    {nearestExpiryAlert.batchNo || 'غير مسجلة'}
                  </p>
                </div>
              ) : null}
              {productBatches.length ? (
                <div className="mt-3 rounded-2xl border border-stone-200 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-stone-900">الدفعات المتبقية</p>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      {productBatches.length} دفعة
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 xl:grid-cols-2">
                    {productBatches.slice(0, 4).map((batch) => (
                      <div key={batch.id} className="rounded-2xl border border-stone-200 bg-stone-50/90 px-3 py-3 text-sm text-stone-700">
                        <p className="font-black text-stone-900">
                          {batch.source === 'opening' ? 'رصيد افتتاحي' : batch.batchNo || 'دفعة شراء'}
                        </p>
                        <p className="mt-1">
                          المتبقي: {formatQuantity(batch.remainingQuantity)} {product.retailUnit}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          تاريخ الشراء: {batch.purchaseDate ? formatDate(batch.purchaseDate) : 'غير محدد'}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          الانتهاء: {batch.expiryDate ? formatDate(batch.expiryDate) : 'بدون تاريخ انتهاء'}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          المورد: {batch.supplierName || 'غير محدد'}
                        </p>
                      </div>
                    ))}
                  </div>
                  {productBatches.length > 4 ? (
                    <p className="mt-2 text-xs font-bold text-stone-500">
                      تم عرض أول 4 دفعات، وباقي الدفعات محفوظة في النظام.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {latestPurchaseMovement ? (
                <div className="mt-3 grid gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-sm text-stone-700 md:grid-cols-2">
                  <p>
                    <span className="font-black text-stone-900">آخر توريد:</span>{' '}
                    {formatDate(latestPurchaseMovement.createdAt)}
                  </p>
                  <p>
                    <span className="font-black text-stone-900">الكمية المستلمة:</span>{' '}
                    +{formatQuantity(latestPurchaseMovement.quantityDelta)} {product.retailUnit}
                  </p>
                  <p className="md:col-span-2">
                    <span className="font-black text-stone-900">مرجع التوريد:</span>{' '}
                    {latestPurchaseMovement.note}
                  </p>
                  <p>
                    <span className="font-black text-stone-900">الرصيد بعد التوريد:</span>{' '}
                    {formatQuantity(latestPurchaseMovement.balanceAfter)} {product.retailUnit}
                  </p>
                  <p>
                    <span className="font-black text-stone-900">أساس الكلفة:</span>{' '}
                    {product.purchaseCostBasis === 'wholesale' ? 'تم اعتماد الجملة ثم اشتقاق المفرد' : 'تم اعتماد المفرد مباشرة'}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-stone-500">
                  لم تُسجل لهذا الصنف حركة شراء بعد، وقد يكون رصيده افتتاحياً أو أُضيف يدوياً من شاشة المخزون.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-48 rounded-2xl bg-white px-4 py-4 text-left">
              <p className="text-xs text-stone-500">الرصيد الحالي</p>
              <p className="mt-1 font-display text-2xl font-black text-teal-700">
                {formatQuantity(product.stockQty)} {product.retailUnit}
              </p>
            </div>
            <button
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
              onClick={() => startEditingProduct(product)}
              type="button"
            >
              تعديل
            </button>
            <button
              className="rounded-full border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 transition hover:border-rose-500 hover:text-rose-800 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
              disabled={isSubmitting}
              onClick={() => void handleDeleteProduct(product.id)}
              type="button"
            >
              حذف
            </button>
          </div>
        </div>
      </article>
    )
  }

  function handleExportProducts() {
    exportRowsToCsv({
      fileName: `super-m2-products-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        'name',
        'product_family_name',
        'variant_label',
        'barcode',
        'wholesale_barcode',
        'plu',
        'department',
        'measurement_type',
        'retail_unit',
        'wholesale_unit',
        'wholesale_quantity',
        'retail_purchase_price_iqd',
        'wholesale_purchase_price_iqd',
        'retail_sale_price_iqd',
        'wholesale_sale_price_iqd',
        'vat_rate',
        'stock_qty',
        'min_stock',
        'last_purchase_at',
        'last_purchase_note',
        'last_purchase_qty',
        'last_purchase_balance_after',
      ],
      rows: filteredProducts.map((product) => {
        const latestPurchaseMovement = latestPurchaseMovementByProduct.get(product.id)

        return [
          product.name,
          product.productFamilyName,
          product.variantLabel ?? '',
          product.barcode,
          product.wholesaleBarcode ?? '',
          product.plu ?? '',
          product.department,
          product.measurementType,
          product.retailUnit,
          product.wholesaleUnit ?? '',
          product.wholesaleQuantity ?? '',
          product.retailPurchasePrice,
          product.wholesalePurchasePrice ?? '',
          product.retailSalePrice,
          product.wholesaleSalePrice ?? '',
          product.vatRate,
          product.stockQty,
          product.minStock,
          latestPurchaseMovement?.createdAt ?? '',
          latestPurchaseMovement?.note ?? '',
          latestPurchaseMovement?.quantityDelta ?? '',
          latestPurchaseMovement?.balanceAfter ?? '',
        ]
      }),
    })
  }

  function handleExportMovements() {
    exportRowsToCsv({
      fileName: `super-m2-stock-movements-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        'created_at',
        'product_name',
        'movement_type',
        'quantity_delta',
        'balance_after',
        'note',
      ],
      rows: filteredMovements.map((movement) => [
        movement.createdAt,
        movement.productName,
        movement.movementType,
        movement.quantityDelta,
        movement.balanceAfter,
        movement.note,
      ]),
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">INVENTORY HUB</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">لوحة المخزون</h1>
              <p className="mt-2 text-sm text-stone-600">
                متابعة الأرصدة الحالية، التنبيهات الحرجة، وسجل الحركات مع إمكانية التعديل اليدوي.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
                onClick={handleExportProducts}
                type="button"
              >
                تصدير الأصناف CSV
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
                onClick={handleExportMovements}
                type="button"
              >
                تصدير الحركات CSV
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadInventoryData()}
                type="button"
              >
                تحديث البيانات
              </button>
              {session?.employee.role === 'admin' ? (
                <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/pos">
                  العودة إلى الكاشير
                </Link>
              ) : null}
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-rose-500 hover:text-rose-700" to="/batches">
                الدفعات والصلاحيات
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">PRODUCTS</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{products.length}</p>
            <p className="mt-2 text-sm text-stone-600">أصناف متاحة حالياً في الكتالوج</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-sky-700">FAMILIES</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{filteredProductFamilies.length}</p>
            <p className="mt-2 text-sm text-stone-600">عائلات منتجات ظاهرة حسب الفلتر الحالي</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">LOW STOCK</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{lowStockProducts.length}</p>
            <p className="mt-2 text-sm text-stone-600">أصناف عند أو تحت حد إعادة الطلب</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] md:col-span-3">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">ESTIMATED VALUE</p>
            <p className="mt-3 font-display text-4xl font-black">{formatMoney(inventoryValue, 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-300">قيمة تقديرية حسب سعر البيع الحالي</p>
          </article>
        </section>

        <section className="mt-4 rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,#fff8ea_0%,#f7edda_100%)] px-5 py-4 text-stone-800 shadow-[0_18px_50px_rgba(120,89,26,0.10)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">PURCHASE IMPORT FLOW</p>
              <p className="mt-2 text-sm font-bold text-stone-700">
                الأصناف التي تدخل من المشتريات تظهر هنا بباركود المفرد والجملة والكلفة ووحدات التعبئة، وهذه الشاشة تصبح مكان مراجعة وتسعير البيع.
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3 text-left shadow-sm">
              <p className="text-xs font-black tracking-[0.18em] text-stone-500">PENDING SALE PRICING</p>
              <p className="mt-1 font-display text-2xl font-black text-amber-700">{pendingSalePricingProducts.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3 text-left shadow-sm">
              <p className="text-xs font-black tracking-[0.18em] text-stone-500">PURCHASED PRODUCTS</p>
              <p className="mt-1 font-display text-2xl font-black text-emerald-700">{purchasedProductsCount}</p>
            </div>
          </div>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">STOCK</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">الأرصدة الحالية</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                placeholder="ابحث بالاسم أو الباركود أو القسم"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${stockFilter === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                  onClick={() => setStockFilter('all')}
                  type="button"
                >
                  كل الأصناف
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${stockFilter === 'low' ? 'bg-amber-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-amber-500 hover:text-amber-700'}`}
                  onClick={() => setStockFilter('low')}
                  type="button"
                >
                  منخفضة المخزون
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${stockFilter === 'weighted' ? 'bg-teal-600 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                  onClick={() => setStockFilter('weighted')}
                  type="button"
                >
                  أصناف وزنية
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${stockFilter === 'expiry' ? 'bg-rose-600 text-white' : 'border border-stone-300 text-stone-700 hover:border-rose-500 hover:text-rose-700'}`}
                  onClick={() => setStockFilter('expiry')}
                  type="button"
                >
                  قرب الانتهاء
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${stockFilter === 'unpriced' ? 'bg-orange-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-orange-500 hover:text-orange-700'}`}
                  onClick={() => setStockFilter('unpriced')}
                  type="button"
                >
                  غير مسعر
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-rose-200 bg-[linear-gradient(180deg,#fff7f7_0%,#fff1f2_100%)] p-4 shadow-[0_18px_50px_rgba(159,18,57,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-rose-700">EXPIRY CONTROL</p>
                  <p className="mt-2 text-sm font-bold text-stone-700">
                    تنبيه الصلاحية يعتمد على دفعات الشراء المسجلة ذات الرصيد المتبقي حالياً، ليس صرف دفعات تلقائياً بعد.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-rose-200 bg-white/85 px-4 py-3 text-left">
                    <p className="text-xs font-black tracking-[0.18em] text-rose-700">EXPIRED</p>
                    <p className="mt-1 font-display text-2xl font-black text-rose-900">{expirySummary.expiredCount}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-white/85 px-4 py-3 text-left">
                    <p className="text-xs font-black tracking-[0.18em] text-amber-700">WITHIN 7 DAYS</p>
                    <p className="mt-1 font-display text-2xl font-black text-amber-900">{expirySummary.criticalCount}</p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-white/85 px-4 py-3 text-left">
                    <p className="text-xs font-black tracking-[0.18em] text-sky-700">WITHIN 30 DAYS</p>
                    <p className="mt-1 font-display text-2xl font-black text-sky-900">{expirySummary.warningCount}</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white/85 px-4 py-3 text-left">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-500">AFFECTED PRODUCTS</p>
                    <p className="mt-1 font-display text-2xl font-black text-stone-900">{expirySummary.affectedProductsCount}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-white/85 px-4 py-3 text-left sm:col-span-4 xl:col-span-1">
                    <p className="text-xs font-black tracking-[0.18em] text-emerald-700">ACTIVE BATCHES</p>
                    <p className="mt-1 font-display text-2xl font-black text-emerald-900">{activeInventoryBatches.length}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {expirySummary.alerts.length ? (
                  expirySummary.alerts.slice(0, 8).map((alert) => (
                    <article key={alert.key} className={`rounded-2xl border px-4 py-4 ${getExpiryCardClasses(alert.severity)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{alert.productName}</p>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${getExpiryBadgeClasses(alert.severity)}`}>
                              {alert.severity === 'expired' ? 'منتهي' : alert.severity === 'critical' ? 'حرج' : 'متابعة'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm">
                            الانتهاء: {formatDate(alert.expiryDate)}
                            <span className="mx-2 text-stone-400">|</span>
                            {getExpiryLabel(alert.daysUntilExpiry)}
                          </p>
                          <p className="mt-1 text-xs opacity-80">
                            {alert.batchNo ? `التشغيلة: ${alert.batchNo} | ` : ''}
                            السند: {alert.receiptNo}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="font-display text-xl font-black">{formatQuantity(alert.remainingStockQty)} {alert.unitLabel}</p>
                          <p className="text-xs font-bold opacity-75">رصيد الصنف الحالي</p>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 px-5 py-8 text-center text-stone-500 xl:col-span-2">
                    لا توجد دفعات تحتاج متابعة صلاحية حالياً.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {isLoading ? (
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                  جارٍ تحميل المخزون...
                </div>
              ) : filteredProductFamilies.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-stone-500">
                  لا توجد أصناف تطابق الفلتر الحالي.
                </div>
              ) : (
                filteredProductFamilies.map((family) => (
                  <section key={family.familyName} className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fffdf8_0%,#f7f1e5_100%)] p-4 shadow-[0_18px_50px_rgba(120,89,26,0.08)]">
                    <div className="flex flex-col gap-4 rounded-[24px] border border-white/80 bg-white/75 px-4 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-2xl font-black text-stone-950">{family.familyName}</h3>
                          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-black text-white">
                            {family.products.length} SKU
                          </span>
                          {family.variantCount > 0 ? (
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800">
                              {family.variantCount} أصناف فرعية
                            </span>
                          ) : null}
                          {family.lowStockCount > 0 ? (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                              {family.lowStockCount} منخفضة المخزون
                            </span>
                          ) : null}
                          {family.hasExpiryAlert ? (
                            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">
                              توجد دفعات تحتاج متابعة
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-bold text-stone-600">
                          الأقسام: {family.departments.join('، ')}
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 lg:min-w-[360px]">
                        <button
                          className="rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-sm font-black text-teal-700 transition hover:border-teal-500 hover:bg-teal-500/15"
                          onClick={() => startNewVariantForFamily(family.familyName)}
                          type="button"
                        >
                          إضافة صنف فرعي جديد لهذه العائلة
                        </button>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-stone-50 px-4 py-3 text-left">
                            <p className="text-xs font-black tracking-[0.18em] text-stone-500">TOTAL STOCK</p>
                            <p className="mt-1 font-display text-2xl font-black text-teal-700">{formatQuantity(family.totalStockQty)}</p>
                          </div>
                          <div className="rounded-2xl bg-stone-50 px-4 py-3 text-left">
                            <p className="text-xs font-black tracking-[0.18em] text-stone-500">FAMILY VALUE</p>
                            <p className="mt-1 font-display text-2xl font-black text-stone-950">{formatMoney(family.totalInventoryValue, 'IQD')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      {family.products.map((product) => renderProductCard(product))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">PRODUCT FORM</p>
                  <h2 className="mt-2 font-display text-3xl font-black">
                    {editingProductId ? 'تعديل الصنف' : 'إضافة صنف جديد'}
                  </h2>
                </div>
                {editingProductId ? (
                  <button
                    className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white transition hover:border-white/40"
                    onClick={resetProductForm}
                    type="button"
                  >
                    إلغاء التعديل
                  </button>
                ) : null}
              </div>

              <form className="mt-5 grid gap-4" onSubmit={handleProductSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(() => {
                    const familyProfile = getFamilyProfileByName(productForm.name)
                    const variantSuggestions = getVariantSuggestions(productForm.name)

                    return (
                      <>
                        <label className="text-sm font-bold text-stone-200">
                          اسم المنتج الرئيسي
                          <SuggestionInput
                            emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                            inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                            optionClassName="w-full px-4 py-3 text-right text-sm font-bold text-stone-100 transition hover:bg-teal-500/20 hover:text-teal-100"
                            panelClassName="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                            placeholder="ابدأ بكتابة اسم مثل جل أو شاي"
                            suggestions={getFamilySuggestionOptions()}
                            value={productForm.name}
                            onChange={handleProductFamilyNameChange}
                          />
                          {familyProfile ? <span className="mt-2 block text-xs font-black text-teal-200">تم العثور على عائلة محفوظة وسيتم إعادة استخدام القسم والوحدات والضريبة الخاصة بها.</span> : <span className="mt-2 block text-xs font-bold text-stone-400">إذا كان المنتج الرئيسي مدخلاً سابقاً فسيظهر لك ضمن الاقتراحات أثناء الكتابة.</span>}
                        </label>
                        <label className="text-sm font-bold text-stone-200">
                          الصنف الفرعي / النكهة / اللون
                          <SuggestionInput
                            emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                            inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                            optionClassName="w-full px-4 py-3 text-right text-sm font-bold text-stone-100 transition hover:bg-teal-500/20 hover:text-teal-100"
                            panelClassName="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                            placeholder="مثال: ياسمين أو ورد أو أزرق"
                            suggestions={getVariantSuggestionOptions(productForm.name)}
                            value={productForm.variantLabel}
                            onChange={(nextValue) => setProductForm((current) => ({ ...current, variantLabel: nextValue }))}
                          />
                          {variantSuggestions.length ? <span className="mt-2 block text-xs font-black text-teal-200">الأصناف الفرعية السابقة لهذه العائلة: {variantSuggestions.join('، ')}</span> : <span className="mt-2 block text-xs font-bold text-stone-400">عند اختيار عائلة موجودة ستظهر هنا اقتراحات النكهات أو الألوان أو المقاسات السابقة لها.</span>}
                        </label>
                      </>
                    )
                  })()}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm font-bold text-stone-200">
                  اسم الـ SKU الناتج: {buildProductDisplayName(productForm.name || 'المنتج الرئيسي', productForm.variantLabel || undefined)}
                </div>

                <FamilyVariantsPanel
                  actionLabel={getFamilyProfileByName(productForm.name) ? 'تهيئة صنف فرعي جديد' : undefined}
                  activeVariantLabel={productForm.variantLabel}
                  familyName={productForm.name}
                  helperText="هذه اللوحة تعرض كل ما هو محفوظ تحت العائلة نفسها حتى لا يتكرر إدخال نفس Variant أو يختلف اسمه عن السابق."
                  onAction={getFamilyProfileByName(productForm.name) ? () => startNewVariantForFamily(productForm.name) : undefined}
                  products={getFamilyProducts(productForm.name)}
                  title="الأصناف الحالية لهذه العائلة"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-200">
                    القسم
                    <SuggestionInput
                      emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                      inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      optionClassName="w-full border-b border-white/5 px-4 py-3 text-right text-sm font-bold text-stone-100 transition last:border-b-0 hover:bg-teal-500/20 hover:text-teal-100"
                      panelClassName="absolute right-0 top-full z-20 mt-2 min-w-[280px] max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                      placeholder="اختر قسماً موجوداً أو اكتب قسماً جديداً"
                      suggestions={getDepartmentSuggestionOptions()}
                      value={productForm.department}
                      onChange={(nextValue) => setProductForm((current) => ({ ...current, department: nextValue }))}
                    />
                    <span className="mt-2 block text-xs font-bold text-stone-400">ستظهر هنا الأقسام المستخدمة سابقاً لتوحيد الإدخال وتقليل اختلاف المسميات.</span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-200">
                    باركود المفرد
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      value={productForm.barcode}
                      onChange={(event) => setProductForm((current) => ({ ...current, barcode: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    باركود الجملة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400 disabled:opacity-50"
                      disabled={!productForm.wholesaleEnabled}
                      placeholder="اختياري عند تفعيل الجملة"
                      value={productForm.wholesaleBarcode}
                      onChange={(event) => setProductForm((current) => ({ ...current, wholesaleBarcode: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-200">
                    PLU اختياري
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      value={productForm.plu}
                      onChange={(event) => setProductForm((current) => ({ ...current, plu: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm font-bold text-stone-200">
                    نوع الصنف
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                      value={productForm.measurementType}
                      onChange={(event) => {
                        const nextMeasurementType = event.target.value as ProductFormState['measurementType']
                        setProductForm((current) => ({
                          ...current,
                          measurementType: nextMeasurementType,
                          retailUnit: getRetailUnitOptions(nextMeasurementType)[0],
                          wholesaleUnit: getWholesaleUnitOptions(nextMeasurementType)[0],
                        }))
                      }}
                    >
                      <option value="unit">مفرد / تعبئة</option>
                      <option value="weight">وزني</option>
                    </select>
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    وحدة المفرد
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                      value={productForm.retailUnit}
                      onChange={(event) => setProductForm((current) => ({ ...current, retailUnit: event.target.value }))}
                    >
                      {getRetailUnitOptions(productForm.measurementType).map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm font-bold text-stone-200 sm:mt-7">
                    <input
                      checked={productForm.wholesaleEnabled}
                      className="h-4 w-4 rounded border-white/20"
                      type="checkbox"
                      onChange={(event) => setProductForm((current) => ({ ...current, wholesaleEnabled: event.target.checked, purchaseCostBasis: event.target.checked ? current.purchaseCostBasis : 'retail' }))}
                    />
                    تفعيل وحدة جملة وسعر جملة
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    أساس تكلفة الشراء
                    <select
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400 disabled:opacity-50"
                      disabled={!productForm.wholesaleEnabled}
                      value={productForm.purchaseCostBasis}
                      onChange={(event) => setProductForm((current) => ({ ...current, purchaseCostBasis: event.target.value as ProductFormState['purchaseCostBasis'] }))}
                    >
                      <option value="retail">المفرد</option>
                      <option value="wholesale">الجملة</option>
                    </select>
                  </label>
                </div>

                {productForm.wholesaleEnabled ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="text-sm font-bold text-stone-200">
                      وحدة الجملة
                      <select
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                        value={productForm.wholesaleUnit}
                        onChange={(event) => setProductForm((current) => ({ ...current, wholesaleUnit: event.target.value }))}
                      >
                        {getWholesaleUnitOptions(productForm.measurementType).map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-bold text-stone-200">
                      المحتوى داخل الجملة
                      <input
                        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                        placeholder={productForm.measurementType === 'weight' ? 'مثال: 50' : 'مثال: 24'}
                        step="0.125"
                        type="number"
                        value={productForm.wholesaleQuantity}
                        onChange={(event) => setProductForm((current) => ({ ...current, wholesaleQuantity: event.target.value }))}
                      />
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm font-bold text-stone-200 sm:mt-7">
                      {productForm.wholesaleUnit} = {productForm.wholesaleQuantity || '0'} {productForm.retailUnit}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm font-bold text-stone-200">
                    تكلفة شراء المفرد
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400 disabled:bg-black/10"
                      disabled={productForm.purchaseCostBasis === 'wholesale' && productForm.wholesaleEnabled}
                      step="250"
                      type="number"
                      value={productForm.retailPurchasePrice}
                      onChange={(event) => setProductForm((current) => ({ ...current, retailPurchasePrice: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    تكلفة شراء الجملة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400 disabled:bg-black/10"
                      disabled={!productForm.wholesaleEnabled}
                      step="250"
                      type="number"
                      value={productForm.wholesalePurchasePrice}
                      onChange={(event) => setProductForm((current) => ({ ...current, wholesalePurchasePrice: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    سعر بيع المفرد
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      step="250"
                      type="number"
                      value={productForm.retailSalePrice}
                      onChange={(event) => setProductForm((current) => ({ ...current, retailSalePrice: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    سعر بيع الجملة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400 disabled:bg-black/10"
                      disabled={!productForm.wholesaleEnabled}
                      step="250"
                      type="number"
                      value={productForm.wholesaleSalePrice}
                      onChange={(event) => setProductForm((current) => ({ ...current, wholesaleSalePrice: event.target.value }))}
                    />
                  </label>
                  <label className="text-sm font-bold text-stone-200 lg:col-span-4">
                    نسبة الضريبة
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      step="0.01"
                      type="number"
                      value={productForm.vatRate}
                      onChange={(event) => setProductForm((current) => ({ ...current, vatRate: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm font-bold text-stone-200">
                    الرصيد الافتتاحي
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      step="0.125"
                      type="number"
                      value={productForm.stockQty}
                      onChange={(event) => setProductForm((current) => ({ ...current, stockQty: event.target.value }))}
                    />
                    <span className="mt-2 block text-xs font-medium text-stone-400">الكمية التي يبدأ بها الصنف عند إنشائه لأول مرة.</span>
                  </label>
                  <label className="text-sm font-bold text-stone-200">
                    الحد الأدنى
                    <input
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                      step="0.125"
                      type="number"
                      value={productForm.minStock}
                      onChange={(event) => setProductForm((current) => ({ ...current, minStock: event.target.value }))}
                    />
                    <span className="mt-2 block text-xs font-medium text-stone-400">عند الوصول إليه أو النزول تحته يظهر تنبيه إعادة الطلب.</span>
                  </label>
                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm font-bold text-stone-200">
                    وحدة التخزين المعتمدة حالياً: {productForm.retailUnit}
                  </div>
                </div>

                <button
                  className="rounded-2xl bg-emerald-500 px-4 py-3 text-base font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? 'جارٍ حفظ الصنف...' : editingProductId ? 'تحديث الصنف' : 'إنشاء الصنف'}
                </button>
              </form>
            </section>

            <section className="rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">ADJUSTMENT</p>
              <h2 className="mt-2 font-display text-3xl font-black">تعديل رصيد يدوي</h2>

              <form className="mt-5 grid gap-4" onSubmit={handleAdjustmentSubmit}>
                <label className="text-sm font-bold text-stone-200">
                  الصنف
                  <select
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                    value={selectedProductId}
                    onChange={(event) => setSelectedProductId(event.target.value)}
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-bold text-stone-200">
                  كمية التعديل
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                    placeholder="مثال: 5 أو -2"
                    step="0.125"
                    type="number"
                    value={quantityDelta}
                    onChange={(event) => setQuantityDelta(event.target.value)}
                  />
                </label>

                <label className="text-sm font-bold text-stone-200">
                  السبب
                  <input
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400"
                    placeholder="مثال: جرد افتتاحي أو تلف أو إضافة مخزنية"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>

                <button
                  className="rounded-2xl bg-amber-400 px-4 py-3 text-base font-black text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
                  disabled={isSubmitting || isLoading || products.length === 0}
                  type="submit"
                >
                  {isSubmitting ? 'جارٍ تنفيذ التعديل...' : 'تثبيت التعديل'}
                </button>
              </form>
            </section>

            <section className="rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6">
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">MOVEMENTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">آخر الحركات</h2>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
                <input
                  className="h-12 rounded-2xl border border-stone-300 bg-white px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                  placeholder="ابحث باسم الصنف أو سبب الحركة"
                  value={movementQuery}
                  onChange={(event) => setMovementQuery(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${movementFilter === 'all' ? 'bg-stone-950 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                    onClick={() => setMovementFilter('all')}
                    type="button"
                  >
                    كل الحركات
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${movementFilter === 'sale' ? 'bg-rose-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-rose-500 hover:text-rose-700'}`}
                    onClick={() => setMovementFilter('sale')}
                    type="button"
                  >
                    بيع
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${movementFilter === 'adjustment' ? 'bg-teal-600 text-white' : 'border border-stone-300 text-stone-700 hover:border-teal-500 hover:text-teal-700'}`}
                    onClick={() => setMovementFilter('adjustment')}
                    type="button"
                  >
                    تعديل
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${movementFilter === 'return' ? 'bg-amber-500 text-white' : 'border border-stone-300 text-stone-700 hover:border-amber-500 hover:text-amber-700'}`}
                    onClick={() => setMovementFilter('return')}
                    type="button"
                  >
                    مرتجع
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-black transition ${movementFilter === 'purchase' ? 'bg-emerald-600 text-white' : 'border border-stone-300 text-stone-700 hover:border-emerald-500 hover:text-emerald-700'}`}
                    onClick={() => setMovementFilter('purchase')}
                    type="button"
                  >
                    شراء
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {filteredMovements.length === 0 ? (
                  <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
                    لا توجد حركات تطابق عوامل التصفية الحالية.
                  </div>
                ) : (
                  filteredMovements.slice(0, 12).map((movement) => (
                    <article key={movement.id} className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-stone-950">{movement.productName}</p>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${movement.movementType === 'sale' ? 'bg-rose-100 text-rose-800' : movement.movementType === 'return' ? 'bg-amber-100 text-amber-800' : movement.movementType === 'purchase' ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-100 text-teal-800'}`}>
                              {getMovementTypeLabel(movement.movementType)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-stone-600">{movement.note}</p>
                          <p className="mt-1 text-xs text-stone-500">{formatDate(movement.createdAt)}</p>
                        </div>
                        <div className="text-left">
                          <p className={`font-display text-xl font-black ${movement.quantityDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {movement.quantityDelta > 0 ? '+' : ''}{formatQuantity(movement.quantityDelta)}
                          </p>
                          <p className="text-xs font-bold text-stone-500">الرصيد: {formatQuantity(movement.balanceAfter)}</p>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
