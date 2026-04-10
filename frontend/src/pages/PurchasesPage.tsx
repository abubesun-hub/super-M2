import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { SuggestionInput } from '../components/SuggestionInput'
import { useEmployeeSession } from '../lib/auth'
import { IQD_PER_USD, formatDualMoney, formatMoney, type CurrencyCode } from '../lib/currency'
import { exportRowsToCsv } from '../lib/export'
import { fetchFundAccounts } from '../lib/funds-api'
import { buildProductDisplayName, type Product } from '../lib/pos'
import { fetchProducts } from '../lib/products-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'
import {
  createSupplier,
  deletePurchaseReceipt,
  deleteSupplier,
  fetchPurchaseReceipts,
  fetchSupplierPayments,
  fetchSuppliers,
  submitPurchaseReceipt,
  submitSupplierPayment,
  updatePurchaseReceipt,
  updateSupplier,
  type StoredPurchaseReceipt,
  type Supplier,
  type SupplierPayment,
  type PurchaseReceiptProductDraftPayload,
} from '../lib/purchases-api'

type ReceiptLineMode = 'existing' | 'new'

const unitRetailUnits = ['قطعة', 'عبوة', 'علبة', 'ربطة']
const unitWholesaleUnits = ['شدة', 'كارتون', 'كيس', 'ربطة كبيرة']
const weightRetailUnits = ['كغم', 'غرام']
const weightWholesaleUnits = ['كيس', 'شوال', 'تنكة']

type ProductDraftState = {
  name: string
  variantLabel: string
  barcode: string
  wholesaleBarcode: string
  plu: string
  department: string
  measurementType: 'unit' | 'weight'
  retailUnit: string
  wholesaleUnit: string
  wholesaleQuantity: string
  vatRate: string
}

type ReceiptLineState = {
  lookupBarcode: string
  mode: ReceiptLineMode
  productId: string
  entryUnit: 'retail' | 'wholesale'
  quantity: string
  unitCost: string
  batchNo: string
  expiryDate: string
  draft: ProductDraftState
}

type ProductFamilyProfile = {
  familyName: string
  variantSuggestions: string[]
  department: string
  measurementType: 'unit' | 'weight'
  retailUnit: string
  wholesaleUnit: string
  wholesaleQuantity: string
  vatRate: string
  skuCount: number
}

function emptyDraft(): ProductDraftState {
  return {
    name: '',
    variantLabel: '',
    barcode: '',
    wholesaleBarcode: '',
    plu: '',
    department: '',
    measurementType: 'unit',
    retailUnit: 'عبوة',
    wholesaleUnit: 'كارتون',
    wholesaleQuantity: '',
    vatRate: '15',
  }
}

function supportsWholesalePurchase(product: Product | null | undefined) {
  return Boolean(product?.wholesaleUnit && product.wholesaleQuantity && product.wholesaleQuantity > 0)
}

function getPurchaseUnitLabel(product: Product, entryUnit: 'retail' | 'wholesale') {
  return entryUnit === 'wholesale' && product.wholesaleUnit ? product.wholesaleUnit : product.retailUnit
}

function emptyLine(product?: Product | null): ReceiptLineState {
  return {
    lookupBarcode: product?.barcode ?? '',
    mode: product ? 'existing' : 'new',
    productId: product?.id ?? '',
    entryUnit: supportsWholesalePurchase(product) ? 'wholesale' : 'retail',
    quantity: '1',
    unitCost: '',
    batchNo: '',
    expiryDate: '',
    draft: emptyDraft(),
  }
}

function supportsDraftWholesale(draft: ProductDraftState) {
  return Boolean(draft.wholesaleUnit.trim() && Number(draft.wholesaleQuantity) > 0)
}

function hasDraftWholesaleUnit(draft: ProductDraftState) {
  return Boolean(draft.wholesaleUnit.trim())
}

function getRetailUnitOptions(measurementType: ProductDraftState['measurementType']) {
  return measurementType === 'weight' ? weightRetailUnits : unitRetailUnits
}

function getWholesaleUnitOptions(measurementType: ProductDraftState['measurementType']) {
  return measurementType === 'weight' ? weightWholesaleUnits : unitWholesaleUnits
}

function getDefaultRetailUnit(measurementType: ProductDraftState['measurementType']) {
  return measurementType === 'weight' ? 'كغم' : 'عبوة'
}

function getDefaultWholesaleUnit(measurementType: ProductDraftState['measurementType']) {
  return measurementType === 'weight' ? 'كيس' : 'كارتون'
}

function getDraftUnitLabel(draft: ProductDraftState, entryUnit: 'retail' | 'wholesale') {
  return entryUnit === 'wholesale' && hasDraftWholesaleUnit(draft) ? draft.wholesaleUnit.trim() : draft.retailUnit.trim() || getDefaultRetailUnit(draft.measurementType)
}

function findProductByAnyBarcode(products: Product[], barcode: string) {
  const normalizedBarcode = barcode.trim()

  if (!normalizedBarcode) {
    return null
  }

  const product = products.find((entry) => entry.barcode === normalizedBarcode || entry.wholesaleBarcode === normalizedBarcode)

  if (!product) {
    return null
  }

  return {
    product,
    entryUnit: product.wholesaleBarcode === normalizedBarcode && supportsWholesalePurchase(product) ? 'wholesale' as const : 'retail' as const,
  }
}

function normalizeDraftPayload(draft: ProductDraftState): PurchaseReceiptProductDraftPayload {
  const vatRatePercent = Number(draft.vatRate)
  const productFamilyName = draft.name.trim()
  const variantLabel = draft.variantLabel.trim() || undefined

  return {
    name: buildProductDisplayName(productFamilyName, variantLabel),
    productFamilyName,
    variantLabel,
    barcode: draft.barcode.trim(),
    wholesaleBarcode: draft.wholesaleBarcode.trim() || undefined,
    plu: draft.plu.trim() || undefined,
    department: draft.department.trim(),
    measurementType: draft.measurementType,
    retailUnit: draft.retailUnit.trim(),
    wholesaleUnit: draft.wholesaleUnit.trim() || undefined,
    wholesaleQuantity: supportsDraftWholesale(draft) ? Number(draft.wholesaleQuantity) : undefined,
    vatRate: Number.isFinite(vatRatePercent) ? roundMoney(vatRatePercent / 100) : 0,
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10)
}

function getStartOfWeek(value: Date) {
  const date = new Date(value)
  const day = date.getDay()
  const diff = (day + 1) % 7
  date.setDate(date.getDate() - diff)
  return date
}

function getStartOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function getLedgerInvoiceGroupLabel(invoiceNo?: string) {
  return invoiceNo?.trim() || 'بدون رقم قائمة مورد'
}

export function PurchasesPage() {
  const { session } = useEmployeeSession()
  const [products, setProducts] = useState<Product[]>([])
  const [receipts, setReceipts] = useState<StoredPurchaseReceipt[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [finalCashBalanceIqd, setFinalCashBalanceIqd] = useState(0)
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [supplierDraftName, setSupplierDraftName] = useState('')
  const [supplierDraftPhone, setSupplierDraftPhone] = useState('')
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([])
  const [paymentCurrencyCode, setPaymentCurrencyCode] = useState<CurrencyCode>('IQD')
  const [paymentExchangeRate, setPaymentExchangeRate] = useState(String(IQD_PER_USD))
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(getTodayDateInputValue())
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)
  const [ledgerDateFrom, setLedgerDateFrom] = useState('')
  const [ledgerDateTo, setLedgerDateTo] = useState('')
  const [ledgerInvoiceQuery, setLedgerInvoiceQuery] = useState('')
  const [notes, setNotes] = useState('')
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('IQD')
  const [exchangeRate, setExchangeRate] = useState(String(IQD_PER_USD))
  const [lines, setLines] = useState<ReceiptLineState[]>([emptyLine()])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingSupplier, setIsSavingSupplier] = useState(false)
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false)
  const productFamilyProfiles = Array.from(
    products.reduce((profiles, product) => {
      const existingProfile = profiles.get(product.productFamilyName)

      if (existingProfile) {
        if (product.variantLabel && !existingProfile.variantSuggestions.includes(product.variantLabel)) {
          existingProfile.variantSuggestions.push(product.variantLabel)
        }

        existingProfile.skuCount += 1

        return profiles
      }

      profiles.set(product.productFamilyName, {
        familyName: product.productFamilyName,
        variantSuggestions: product.variantLabel ? [product.variantLabel] : [],
        department: product.department,
        measurementType: product.measurementType,
        retailUnit: product.retailUnit,
        wholesaleUnit: product.wholesaleUnit ?? getDefaultWholesaleUnit(product.measurementType),
        wholesaleQuantity: product.wholesaleQuantity ? String(product.wholesaleQuantity) : '',
        vatRate: String(roundMoney(product.vatRate * 100)),
        skuCount: 1,
      })

      return profiles
    }, new Map<string, ProductFamilyProfile>()),
  )
    .map(([, profile]) => ({
      ...profile,
      variantSuggestions: profile.variantSuggestions.sort((left, right) => left.localeCompare(right, 'ar')),
    }))
    .sort((left, right) => left.familyName.localeCompare(right.familyName, 'ar'))

  async function loadPurchasesData() {
    setIsLoading(true)

    try {
      const [nextProducts, nextReceipts, nextSuppliers, nextFundAccounts] = await Promise.all([
        fetchProducts(),
        fetchPurchaseReceipts(),
        fetchSuppliers(),
        fetchFundAccounts(),
      ])
      setProducts(nextProducts)
      setReceipts(nextReceipts)
      setSuppliers(nextSuppliers)
      setFinalCashBalanceIqd(roundMoney(nextFundAccounts.reduce((sum, account) => {
        if (!account.isActive || (account.code !== 'revenue' && account.code !== 'capital')) {
          return sum
        }

        return sum + account.currentBalanceIqd
      }, 0)))
      setLines((current) => current.map((line, index) => {
        if (line.mode === 'new') {
          return line
        }

        const nextProduct = nextProducts.find((product) => product.id === line.productId)
          ?? nextProducts[index]
          ?? nextProducts[0]

        return {
          ...line,
          lookupBarcode: line.lookupBarcode || nextProduct?.barcode || '',
          productId: nextProduct?.id ?? '',
          entryUnit: line.entryUnit === 'wholesale' && !supportsWholesalePurchase(nextProduct) ? 'retail' : line.entryUnit,
        }
      }))
      setSelectedSupplierId((current) => current && nextSuppliers.some((supplier) => supplier.id === current) ? current : '')
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات المشتريات.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPurchasesData()
  }, [])

  useEffect(() => {
    async function loadSelectedSupplierPayments() {
      if (!selectedSupplierId) {
        setSupplierPayments([])
        return
      }

      setIsLoadingPayments(true)

      try {
        const nextPayments = await fetchSupplierPayments(selectedSupplierId)
        setSupplierPayments(nextPayments)
      } catch (error) {
        setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل دفعات المورد.'))
      } finally {
        setIsLoadingPayments(false)
      }
    }

    void loadSelectedSupplierPayments()
  }, [selectedSupplierId])

  useEffect(() => {
    if (selectedReceiptId && !receipts.some((receipt) => receipt.id === selectedReceiptId)) {
      setSelectedReceiptId(null)
    }
  }, [receipts, selectedReceiptId])

  function updateLine(index: number, patch: Partial<ReceiptLineState>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  function updateLineDraft(index: number, patch: Partial<ProductDraftState>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, draft: { ...line.draft, ...patch } } : line))
  }

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
      description: `${profile.department} | ${profile.measurementType === 'weight' ? 'وزني' : profile.wholesaleQuantity ? 'مفرد + جملة' : 'مفرد'}`,
      meta: `${profile.skuCount} SKU | ${profile.variantSuggestions.length} أصناف فرعية`,
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

  function handleDraftFamilyNameChange(index: number, name: string) {
    const matchedProfile = getFamilyProfileByName(name)

    if (!matchedProfile) {
      updateLineDraft(index, { name })
      return
    }

    updateLineDraft(index, {
      name,
      department: matchedProfile.department,
      measurementType: matchedProfile.measurementType,
      retailUnit: matchedProfile.retailUnit,
      wholesaleUnit: matchedProfile.wholesaleUnit,
      wholesaleQuantity: matchedProfile.wholesaleQuantity,
      vatRate: matchedProfile.vatRate,
    })
  }

  function resolveLineBarcode(index: number, rawBarcode: string) {
    const barcode = rawBarcode.trim()
    const matched = findProductByAnyBarcode(products, barcode)

    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) {
        return line
      }

      if (!barcode) {
        return {
          ...line,
          lookupBarcode: '',
        }
      }

      if (matched) {
        return {
          ...line,
          lookupBarcode: barcode,
          mode: 'existing',
          productId: matched.product.id,
          entryUnit: matched.entryUnit,
        }
      }

      return {
        ...line,
        lookupBarcode: barcode,
        mode: 'new',
        productId: '',
        entryUnit: 'retail',
        draft: {
          ...line.draft,
          barcode,
        },
      }
    }))
  }

  function addLine() {
    setLines((current) => [...current, emptyLine(products[0])])
  }

  function removeLine(index: number) {
    setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index))
  }

  function resetSupplierForm() {
    setEditingSupplierId(null)
    setSupplierDraftName('')
    setSupplierDraftPhone('')
  }

  function resetPaymentForm() {
    setPaymentCurrencyCode('IQD')
    setPaymentExchangeRate(String(IQD_PER_USD))
    setPaymentAmount('')
    setPaymentNotes('')
  }

  const parsedExchangeRate = Number(exchangeRate) || IQD_PER_USD
  const normalizedLines = lines.map((line) => ({
    ...line,
    quantityNumber: Number(line.quantity),
    unitCostNumber: Number(line.unitCost),
    batchNoNormalized: line.batchNo.trim(),
    expiryDateNormalized: line.expiryDate.trim(),
    product: line.mode === 'existing' ? products.find((product) => product.id === line.productId) ?? null : null,
    draftPayload: line.mode === 'new' ? normalizeDraftPayload(line.draft) : null,
    retailUnitLabel: line.mode === 'existing'
      ? (products.find((product) => product.id === line.productId)?.retailUnit ?? 'الوحدة المفردة')
      : (line.draft.retailUnit.trim() || getDefaultRetailUnit(line.draft.measurementType)),
    packQuantity: line.mode === 'existing'
      ? (products.find((product) => product.id === line.productId)?.wholesaleQuantity ?? 1)
      : (Number(line.draft.wholesaleQuantity) > 0 ? Number(line.draft.wholesaleQuantity) : 1),
    usesWholesaleCost: line.mode === 'existing'
      ? Boolean(line.entryUnit === 'wholesale' && supportsWholesalePurchase(products.find((product) => product.id === line.productId) ?? null))
      : Boolean(line.entryUnit === 'wholesale' && supportsDraftWholesale(line.draft)),
  }))
  const normalizedLinesWithCosts = normalizedLines.map((line) => {
    const unitCostIqd = Number.isFinite(line.unitCostNumber)
      ? roundMoney(currencyCode === 'USD' ? line.unitCostNumber * parsedExchangeRate : line.unitCostNumber)
      : null
    const retailUnitCostIqd = unitCostIqd !== null
      ? roundMoney(unitCostIqd / (line.usesWholesaleCost ? line.packQuantity : 1))
      : null

    return {
      ...line,
      unitCostIqd,
      retailUnitCostIqd,
    }
  })
  const totalCost = roundMoney(normalizedLinesWithCosts.reduce((sum, line) => sum + (Number.isFinite(line.quantityNumber) ? line.quantityNumber : 0) * (Number.isFinite(line.unitCostNumber) ? line.unitCostNumber : 0), 0))
  const totalCostIqd = roundMoney(currencyCode === 'USD' ? totalCost * parsedExchangeRate : totalCost)
  const totalCostDisplay = formatDualMoney(totalCostIqd, 'IQD', parsedExchangeRate)
  const todaysReceipts = receipts.filter((receipt) => new Date(receipt.createdAt).toDateString() === new Date().toDateString())
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null
  const selectedSupplierReceipts = selectedSupplierId
    ? receipts.filter((receipt) => receipt.supplierId === selectedSupplierId)
    : []
  const selectedSupplierLedger = selectedSupplierId
    ? [
        ...selectedSupplierReceipts.map((receipt) => ({
          id: receipt.id,
          type: 'receipt' as const,
          sortDate: `${receipt.purchaseDate}T00:00:00`,
          tieBreakerDate: receipt.createdAt,
          amountIqd: receipt.totalCostIqd,
          receipt,
        })),
        ...supplierPayments.map((payment) => ({
          id: payment.id,
          type: 'payment' as const,
          sortDate: payment.createdAt,
          tieBreakerDate: payment.createdAt,
          amountIqd: payment.amountIqd,
          payment,
        })),
      ].sort((left, right) => {
        const primary = new Date(left.sortDate).getTime() - new Date(right.sortDate).getTime()

        if (primary !== 0) {
          return primary
        }

        const secondary = new Date(left.tieBreakerDate).getTime() - new Date(right.tieBreakerDate).getTime()

        if (secondary !== 0) {
          return secondary
        }

        if (left.type === right.type) {
          return 0
        }

        return left.type === 'receipt' ? -1 : 1
      })
    : []
  const selectedSupplierLedgerWithBalance = selectedSupplierLedger.reduce<Array<
    (typeof selectedSupplierLedger)[number] & {
      deltaIqd: number
      runningBalanceIqd: number
    }
  >>((entries, entry) => {
    const previousBalance = entries.length > 0 ? entries[entries.length - 1].runningBalanceIqd : 0
    const deltaIqd = entry.type === 'receipt' ? entry.amountIqd : -entry.amountIqd

    entries.push({
      ...entry,
      deltaIqd,
      runningBalanceIqd: roundMoney(previousBalance + deltaIqd),
    })

    return entries
  }, [])
  const normalizedLedgerInvoiceQuery = ledgerInvoiceQuery.trim().toLowerCase()
  const filteredSupplierLedger = selectedSupplierLedgerWithBalance.filter((entry) => {
    const entryDate = entry.type === 'receipt'
      ? entry.receipt.purchaseDate
      : entry.payment.createdAt.slice(0, 10)

    if (ledgerDateFrom && entryDate < ledgerDateFrom) {
      return false
    }

    if (ledgerDateTo && entryDate > ledgerDateTo) {
      return false
    }

    if (!normalizedLedgerInvoiceQuery) {
      return true
    }

    return entry.type === 'receipt' && Boolean(entry.receipt.supplierInvoiceNo?.toLowerCase().includes(normalizedLedgerInvoiceQuery))
  })
  const filteredSupplierReceiptsTotalIqd = roundMoney(filteredSupplierLedger.reduce((sum, entry) => sum + (entry.type === 'receipt' ? entry.amountIqd : 0), 0))
  const filteredSupplierPaymentsTotalIqd = roundMoney(filteredSupplierLedger.reduce((sum, entry) => sum + (entry.type === 'payment' ? entry.amountIqd : 0), 0))
  const filteredSupplierLedgerGroups = filteredSupplierLedger.reduce<Array<{
    key: string
    title: string
    type: 'invoice' | 'payment'
    entries: typeof filteredSupplierLedger
    totalDebitIqd: number
    totalCreditIqd: number
  }>>((groups, entry, index) => {
    const invoiceLabel = entry.type === 'receipt' ? getLedgerInvoiceGroupLabel(entry.receipt.supplierInvoiceNo) : ''
    const previousGroup = groups[groups.length - 1]
    const canAppendToPreviousInvoiceGroup = entry.type === 'receipt'
      && previousGroup?.type === 'invoice'
      && previousGroup.title === invoiceLabel

    if (canAppendToPreviousInvoiceGroup) {
      previousGroup.entries.push(entry)
      previousGroup.totalDebitIqd = roundMoney(previousGroup.totalDebitIqd + entry.amountIqd)
      return groups
    }

    groups.push({
      key: entry.type === 'receipt' ? `invoice-${invoiceLabel}-${index}` : `payment-${entry.id}`,
      title: entry.type === 'receipt' ? invoiceLabel : `دفعة مورد ${entry.payment.paymentNo}`,
      type: entry.type === 'receipt' ? 'invoice' : 'payment',
      entries: [entry],
      totalDebitIqd: entry.type === 'receipt' ? entry.amountIqd : 0,
      totalCreditIqd: entry.type === 'payment' ? entry.amountIqd : 0,
    })

    return groups
  }, [])
  const sortedSuppliers = [...suppliers].sort((left, right) => right.currentBalance - left.currentBalance)
  const todaysSupplierPayments = supplierPayments.filter((payment) => new Date(payment.createdAt).toDateString() === new Date().toDateString())
  const selectedReceipt = selectedReceiptId
    ? receipts.find((receipt) => receipt.id === selectedReceiptId) ?? null
    : null
  const parsedPaymentExchangeRate = Number(paymentExchangeRate) || IQD_PER_USD
  const paymentAmountNumber = Number(paymentAmount)
  const paymentAmountIqd = Number.isFinite(paymentAmountNumber)
    ? roundMoney(paymentCurrencyCode === 'USD' ? paymentAmountNumber * parsedPaymentExchangeRate : paymentAmountNumber)
    : 0
  const isEditingReceipt = editingReceiptId !== null

  function resetPurchaseForm() {
    setEditingReceiptId(null)
    setSelectedSupplierId('')
    setPurchaseDate(getTodayDateInputValue())
    setSupplierInvoiceNo('')
    setNotes('')
    setCurrencyCode('IQD')
    setExchangeRate(String(IQD_PER_USD))
    setLines([emptyLine(products[0])])
  }

  function loadReceiptIntoForm(receipt: StoredPurchaseReceipt) {
    setEditingReceiptId(receipt.id)
    setSelectedReceiptId(receipt.id)
    setSelectedSupplierId(receipt.supplierId ?? '')
    setPurchaseDate(receipt.purchaseDate)
    setSupplierInvoiceNo(receipt.supplierInvoiceNo ?? '')
    setNotes(receipt.notes ?? '')
    setCurrencyCode(receipt.currencyCode)
    setExchangeRate(String(receipt.exchangeRate))
    setLines(
      receipt.items.length > 0
        ? receipt.items.map((item) => {
            const product = products.find((entry) => entry.id === item.productId) ?? null

            return {
              lookupBarcode: item.entryUnit === 'wholesale'
                ? (product?.wholesaleBarcode ?? product?.barcode ?? '')
                : (product?.barcode ?? ''),
              mode: 'existing' as const,
              productId: item.productId,
              entryUnit: item.entryUnit,
              quantity: String(item.quantity),
              unitCost: String(item.unitCost),
              batchNo: item.batchNo ?? '',
              expiryDate: item.expiryDate ?? '',
              draft: emptyDraft(),
            }
          })
        : [emptyLine(products[0])],
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (normalizedLinesWithCosts.length === 0) {
      setMessage('أضف صنفاً واحداً على الأقل في سند الشراء.')
      return
    }

    if (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0) {
      setMessage('سعر الصرف المدخل غير صالح.')
      return
    }

    for (const line of normalizedLinesWithCosts) {
      if (!Number.isFinite(line.quantityNumber) || line.quantityNumber <= 0 || !Number.isFinite(line.unitCostNumber) || line.unitCostNumber < 0) {
        setMessage('تحقق من كميات وتكاليف الأصناف في سند الشراء.')
        return
      }

      if (line.mode === 'existing') {
        if (!line.product) {
          setMessage('اختر صنفاً صالحاً لكل سطر من سطور الشراء.')
          return
        }

        if (line.entryUnit === 'wholesale' && !supportsWholesalePurchase(line.product)) {
          setMessage(`الصنف ${line.product.name} لا يملك تعبئة جملة مهيأة.`)
          return
        }

        continue
      }

      if (line.expiryDateNormalized && !/^\d{4}-\d{2}-\d{2}$/.test(line.expiryDateNormalized)) {
        setMessage('تحقق من تواريخ النفاذ في سطور الشراء.')
        return
      }

      const draft = line.draftPayload
      const draftDisplayName = line.draftPayload ? getDraftDisplayName(line.draft) : 'الصنف الجديد'

      if (!draft || draft.name.length < 3 || draft.barcode.trim().length < 3 || draft.department.trim().length < 2 || !draft.retailUnit) {
        setMessage('اسم المنتج الرئيسي والباركود يجب أن يكون كل منهما 3 أحرف أو أرقام على الأقل، مع إدخال القسم ووحدة المفرد.')
        return
      }

      if (draft.wholesaleBarcode && draft.wholesaleBarcode.trim().length < 3) {
        setMessage(`باركود الجملة للصنف ${draftDisplayName} يجب أن يكون 3 أحرف أو أرقام على الأقل.`)
        return
      }

      if (!Number.isFinite(draft.vatRate) || draft.vatRate < 0) {
        setMessage(`نسبة الضريبة غير صالحة للصنف ${draftDisplayName}.`)
        return
      }

      const hasWholesale = Boolean(draft.wholesaleUnit && draft.wholesaleQuantity && draft.wholesaleQuantity > 0)
      const hasAnyWholesaleField = Boolean(draft.wholesaleUnit || draft.wholesaleQuantity || draft.wholesaleBarcode)

      if (hasAnyWholesaleField && !hasWholesale) {
        setMessage(`أكمل تعبئة الجملة بالكامل للصنف ${draftDisplayName}: اسم وحدة الجملة وعدد المفردات داخلها.`)
        return
      }

      if (hasWholesale && !draft.wholesaleBarcode) {
        setMessage(`أدخل باركود الجملة للصنف ${draftDisplayName}.`)
        return
      }

      if (draft.wholesaleBarcode && draft.wholesaleBarcode === draft.barcode) {
        setMessage(`يجب أن يختلف باركود الجملة عن باركود المفرد للصنف ${draftDisplayName}.`)
        return
      }

      if (line.entryUnit === 'wholesale' && !hasWholesale) {
        setMessage(`لا يمكن شراء ${draftDisplayName} بالجملة قبل تحديد وحدة الجملة وعددها وباركودها.`)
        return
      }
    }

    setIsSubmitting(true)

    try {
      const payload = {
        supplierId: selectedSupplierId || undefined,
        purchaseDate: purchaseDate || undefined,
        supplierInvoiceNo: supplierInvoiceNo.trim() || undefined,
        currencyCode,
        exchangeRate: parsedExchangeRate,
        notes: notes.trim() || undefined,
        items: normalizedLinesWithCosts.map((line) => ({
          entryUnit: line.entryUnit,
          quantity: line.quantityNumber,
          unitCost: line.unitCostNumber,
          batchNo: line.batchNoNormalized || undefined,
          expiryDate: line.expiryDateNormalized || undefined,
          ...(line.mode === 'existing'
            ? { productId: line.productId }
            : { productDraft: line.draftPayload ?? undefined }),
        })),
      }
      const savedReceipt = editingReceiptId
        ? await updatePurchaseReceipt(editingReceiptId, payload)
        : await submitPurchaseReceipt(payload)

      resetPurchaseForm()
      setSelectedReceiptId(savedReceipt.id)
      await loadPurchasesData()
      setMessage(editingReceiptId ? 'تم تعديل سند الشراء وتحديث المخزون بنجاح.' : 'تم حفظ سند الاستلام وتحديث المخزون بنجاح.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, editingReceiptId ? 'تعذر تعديل سند الشراء.' : 'تعذر حفظ سند الشراء.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleEditReceipt(receipt: StoredPurchaseReceipt) {
    loadReceiptIntoForm(receipt)
    setMessage(`تم تحميل السند ${receipt.receiptNo} للتعديل.`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDeleteReceipt(receipt: StoredPurchaseReceipt) {
    const confirmed = window.confirm(`سيتم حذف السند ${receipt.receiptNo} وعكس أثره على المخزون إذا كانت كمياته لم تُستهلك بعد. هل تريد المتابعة؟`)

    if (!confirmed) {
      return
    }

    setIsSubmitting(true)

    try {
      await deletePurchaseReceipt(receipt.id)

      if (selectedReceiptId === receipt.id) {
        setSelectedReceiptId(null)
      }

      if (editingReceiptId === receipt.id) {
        resetPurchaseForm()
      }

      await loadPurchasesData()
      setMessage('تم حذف سند الشراء وعكس أثره على المخزون بنجاح.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف سند الشراء.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSupplierSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (supplierDraftName.trim().length < 2) {
      setMessage('اسم المورد يجب أن يتكون من حرفين على الأقل.')
      return
    }

    setIsSavingSupplier(true)

    try {
      const payload = {
        name: supplierDraftName.trim(),
        phone: supplierDraftPhone.trim() || undefined,
      }

      const savedSupplier = editingSupplierId
        ? await updateSupplier(editingSupplierId, payload)
        : await createSupplier(payload)

      await loadPurchasesData()
      setSelectedSupplierId(savedSupplier.id)
      resetSupplierForm()
      setMessage(editingSupplierId ? 'تم تعديل بيانات المورد.' : 'تمت إضافة المورد الجديد.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حفظ المورد.'))
    } finally {
      setIsSavingSupplier(false)
    }
  }

  async function handleSupplierPaymentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedSupplier) {
      setMessage('اختر مورداً أولاً لتسجيل دفعة عليه.')
      return
    }

    if (!Number.isFinite(paymentAmountNumber) || paymentAmountNumber <= 0) {
      setMessage('قيمة الدفعة غير صالحة.')
      return
    }

    if (!Number.isFinite(parsedPaymentExchangeRate) || parsedPaymentExchangeRate <= 0) {
      setMessage('سعر الصرف الخاص بالدفعة غير صالح.')
      return
    }

    if (paymentAmountIqd > finalCashBalanceIqd + 0.01) {
      setMessage('رصيد الصندوق لا يكفي لدفع هذا المبلغ.')
      return
    }

    setIsSubmittingPayment(true)

    try {
      await submitSupplierPayment(selectedSupplier.id, {
        currencyCode: paymentCurrencyCode,
        exchangeRate: parsedPaymentExchangeRate,
        amount: paymentAmountNumber,
        notes: paymentNotes.trim() || undefined,
      })

      await loadPurchasesData()
      const nextPayments = await fetchSupplierPayments(selectedSupplier.id)
      setSupplierPayments(nextPayments)
      resetPaymentForm()
      setMessage('تم تسجيل دفعة المورد وتحديث الرصيد.')
    } catch (error) {
      const nextMessage = getUserFacingErrorMessage(error, 'تعذر تسجيل دفعة المورد.')
      setMessage(nextMessage.includes('الرصيد النقدي النهائي') || nextMessage.includes('رصيد الصندوق لا يكفي') ? 'رصيد الصندوق لا يكفي لدفع هذا المبلغ.' : nextMessage)
    } finally {
      setIsSubmittingPayment(false)
    }
  }

  function handleEditSupplier(supplier: Supplier) {
    setEditingSupplierId(supplier.id)
    setSupplierDraftName(supplier.name)
    setSupplierDraftPhone(supplier.phone ?? '')
  }

  async function handleDeleteSupplier(supplier: Supplier) {
    setIsSavingSupplier(true)

    try {
      await deleteSupplier(supplier.id)
      if (selectedSupplierId === supplier.id) {
        setSelectedSupplierId('')
      }
      if (editingSupplierId === supplier.id) {
        resetSupplierForm()
      }
      await loadPurchasesData()
      setMessage('تم حذف المورد.')
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر حذف المورد.'))
    } finally {
      setIsSavingSupplier(false)
    }
  }

  function exportReceiptsCsv() {
    exportRowsToCsv({
      fileName: `super-m2-purchases-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['receipt_no', 'purchase_date', 'created_at', 'supplier_name', 'supplier_invoice_no', 'currency_code', 'total_cost', 'total_cost_iqd', 'notes'],
      rows: receipts.map((receipt) => [receipt.receiptNo, receipt.purchaseDate, receipt.createdAt, receipt.supplierName ?? '', receipt.supplierInvoiceNo ?? '', receipt.currencyCode, receipt.totalCost, receipt.totalCostIqd, receipt.notes ?? '']),
    })
  }

  function exportSelectedSupplierLedgerCsv() {
    if (!selectedSupplier) {
      setMessage('اختر مورداً أولاً لتصدير كشف الحساب الخاص به.')
      return
    }

    exportRowsToCsv({
      fileName: `supplier-ledger-${selectedSupplier.name}-${new Date().toISOString().slice(0, 10)}.csv`,
      headers: ['entry_type', 'reference_no', 'entry_date', 'system_date', 'supplier_name', 'supplier_invoice_no', 'debit_iqd', 'credit_iqd', 'delta_iqd', 'running_balance_iqd', 'notes'],
      rows: filteredSupplierLedgerGroups.flatMap((group) => {
        const groupHeader = [
          group.type === 'invoice' ? 'group_header' : 'payment_group_header',
          group.title,
          '',
          '',
          selectedSupplier.name,
          group.type === 'invoice' ? group.title : '',
          '',
          '',
          '',
          '',
          `عدد الحركات: ${group.entries.length}`,
        ]

        const entryRows = group.entries.map((entry) => [
          entry.type === 'receipt' ? 'purchase_receipt' : 'supplier_payment',
          entry.type === 'receipt' ? entry.receipt.receiptNo : entry.payment.paymentNo,
          entry.type === 'receipt' ? entry.receipt.purchaseDate : entry.payment.createdAt.slice(0, 10),
          entry.type === 'receipt' ? entry.receipt.createdAt : entry.payment.createdAt,
          selectedSupplier.name,
          entry.type === 'receipt' ? entry.receipt.supplierInvoiceNo ?? '' : '',
          entry.type === 'receipt' ? entry.amountIqd : '',
          entry.type === 'payment' ? entry.amountIqd : '',
          entry.deltaIqd,
          entry.runningBalanceIqd,
          entry.type === 'receipt' ? entry.receipt.notes ?? '' : entry.payment.notes ?? '',
        ])

        const groupSummary = [
          'group_summary',
          group.title,
          '',
          '',
          selectedSupplier.name,
          group.type === 'invoice' ? group.title : '',
          group.totalDebitIqd,
          group.totalCreditIqd,
          roundMoney(group.totalDebitIqd - group.totalCreditIqd),
          group.entries[group.entries.length - 1].runningBalanceIqd,
          'إجمالي المجموعة',
        ]

        return [groupHeader, ...entryRows, groupSummary]
      }),
    })
  }

  function resetLedgerFilters() {
    setLedgerDateFrom('')
    setLedgerDateTo('')
    setLedgerInvoiceQuery('')
  }

  function setQuickLedgerRange(range: 'today' | 'week' | 'month') {
    const today = new Date()
    const todayValue = toDateInputValue(today)

    if (range === 'today') {
      setLedgerDateFrom(todayValue)
      setLedgerDateTo(todayValue)
      return
    }

    if (range === 'week') {
      setLedgerDateFrom(toDateInputValue(getStartOfWeek(today)))
      setLedgerDateTo(todayValue)
      return
    }

    setLedgerDateFrom(toDateInputValue(getStartOfMonth(today)))
    setLedgerDateTo(todayValue)
  }

  function printSelectedSupplierLedger() {
    if (!selectedSupplier) {
      setMessage('اختر مورداً أولاً لطباعة كشف الحساب.')
      return
    }

    if (filteredSupplierLedger.length === 0) {
      setMessage('لا توجد حركات مطابقة للفلاتر الحالية لطباعة كشف الحساب.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=780')

    if (!printWindow) {
      setMessage('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة للمتصفح.')
      return
    }

    let rowNumber = 0
    const ledgerRows = filteredSupplierLedgerGroups.map((group) => {
      const groupRows = group.entries.map((entry) => {
        rowNumber += 1

        return `
          <tr>
            <td>${rowNumber}</td>
            <td>${entry.type === 'receipt' ? 'سند شراء' : 'دفعة مورد'}</td>
            <td>${escapeHtml(entry.type === 'receipt' ? entry.receipt.receiptNo : entry.payment.paymentNo)}</td>
            <td>${escapeHtml(entry.type === 'receipt' ? formatDateOnly(entry.receipt.purchaseDate) : formatDate(entry.payment.createdAt))}</td>
            <td>${escapeHtml(entry.type === 'receipt' ? entry.receipt.supplierInvoiceNo ?? '-' : '-')}</td>
            <td>${entry.type === 'receipt' ? escapeHtml(formatMoney(entry.amountIqd, 'IQD')) : '-'}</td>
            <td>${entry.type === 'payment' ? escapeHtml(formatMoney(entry.amountIqd, 'IQD')) : '-'}</td>
            <td>${escapeHtml(formatMoney(entry.runningBalanceIqd, 'IQD'))}</td>
            <td>${escapeHtml(entry.type === 'receipt' ? entry.receipt.notes ?? '' : entry.payment.notes ?? '')}</td>
          </tr>
        `
      }).join('')

      return `
        <tr class="group-row">
          <td colspan="9">
            <div class="group-header">
              <span class="group-badge ${group.type === 'invoice' ? 'invoice' : 'payment'}">${group.type === 'invoice' ? 'مجموعة قائمة مورد' : 'مجموعة دفعة'}</span>
              <span class="group-title">${escapeHtml(group.title)}</span>
              <span class="group-meta">عدد الحركات: ${group.entries.length}</span>
            </div>
          </td>
        </tr>
        ${groupRows}
        <tr class="group-summary">
          <td colspan="5">إجمالي المجموعة</td>
          <td>${escapeHtml(formatMoney(group.totalDebitIqd, 'IQD'))}</td>
          <td>${escapeHtml(formatMoney(group.totalCreditIqd, 'IQD'))}</td>
          <td>${escapeHtml(formatMoney(group.entries[group.entries.length - 1].runningBalanceIqd, 'IQD'))}</td>
          <td>-</td>
        </tr>
      `
    }).join('')

    const filterSummary = [
      ledgerDateFrom ? `من: ${ledgerDateFrom}` : '',
      ledgerDateTo ? `إلى: ${ledgerDateTo}` : '',
      ledgerInvoiceQuery.trim() ? `قائمة المورد: ${ledgerInvoiceQuery.trim()}` : '',
    ].filter(Boolean).join(' | ')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>${escapeHtml(`كشف حساب ${selectedSupplier.name}`)}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #1c1917; }
            h1, h2, p { margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
            .title { font-size: 28px; font-weight: 700; }
            .meta { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 10px 16px; margin: 18px 0 24px; }
            .meta div { padding: 10px 12px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; }
            .label { font-size: 12px; color: #57534e; font-weight: 700; margin-bottom: 6px; }
            .value { font-size: 15px; font-weight: 700; }
            .filters { margin-bottom: 18px; padding: 12px 14px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #d6d3d1; padding: 10px; text-align: right; font-size: 13px; vertical-align: top; }
            th { background: #f5f5f4; }
            .group-row td { background: #fff7ed; padding: 0; }
            .group-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; }
            .group-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 800; }
            .group-badge.invoice { background: #fef3c7; color: #92400e; }
            .group-badge.payment { background: #d1fae5; color: #065f46; }
            .group-title { font-size: 14px; font-weight: 800; color: #1c1917; }
            .group-meta { font-size: 12px; color: #57534e; font-weight: 700; }
            .group-summary td { background: #fafaf9; font-weight: 800; }
            @media print { body { margin: 0; padding: 18px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="title">كشف حساب المورد</p>
              <p style="margin-top: 8px; color: #57534e;">${escapeHtml(selectedSupplier.name)}</p>
              <p style="margin-top: 4px; color: #57534e;">تاريخ الطباعة: ${escapeHtml(formatDate(new Date().toISOString()))}</p>
            </div>
            <div style="text-align:left;">
              <p style="font-size: 13px; color: #57534e; font-weight: 700;">الرصيد الحالي</p>
              <p style="margin-top: 8px; font-size: 24px; font-weight: 800;">${escapeHtml(formatMoney(selectedSupplier.currentBalance, 'IQD'))}</p>
            </div>
          </div>

          <div class="meta">
            <div><div class="label">المشتريات المعروضة</div><div class="value">${escapeHtml(formatMoney(filteredSupplierReceiptsTotalIqd, 'IQD'))}</div></div>
            <div><div class="label">الدفعات المعروضة</div><div class="value">${escapeHtml(formatMoney(filteredSupplierPaymentsTotalIqd, 'IQD'))}</div></div>
            <div><div class="label">عدد الحركات</div><div class="value">${filteredSupplierLedger.length}</div></div>
            <div><div class="label">عدد المجموعات</div><div class="value">${filteredSupplierLedgerGroups.length}</div></div>
          </div>

          <div class="filters">${escapeHtml(filterSummary || 'بدون فلاتر إضافية.')}</div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>نوع الحركة</th>
                <th>المرجع</th>
                <th>التاريخ</th>
                <th>قائمة المورد</th>
                <th>مدين</th>
                <th>دائن</th>
                <th>الرصيد بعد الحركة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>${ledgerRows}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function printReceipt(receipt: StoredPurchaseReceipt) {
    const printWindow = window.open('', '_blank', 'width=960,height=720')

    if (!printWindow) {
      setMessage('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة للمتصفح.')
      return
    }

    const itemsMarkup = receipt.items.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.entryUnitLabel)}</td>
        <td>${item.quantity}</td>
        <td>${item.baseQuantity}</td>
        <td>${escapeHtml(item.batchNo ?? '-')}</td>
        <td>${escapeHtml(item.expiryDate ? formatDateOnly(item.expiryDate) : '-')}</td>
        <td>${escapeHtml(formatMoney(item.unitCostIqd, 'IQD'))}</td>
        <td>${escapeHtml(formatMoney(item.lineTotalIqd, 'IQD'))}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>${escapeHtml(receipt.receiptNo)}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #1c1917; }
            h1, h2, p { margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
            .title { font-size: 28px; font-weight: 700; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 10px 18px; margin: 18px 0 24px; }
            .meta div { padding: 10px 12px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; }
            .label { font-size: 12px; color: #57534e; font-weight: 700; margin-bottom: 6px; }
            .value { font-size: 15px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #d6d3d1; padding: 10px; text-align: right; font-size: 14px; }
            th { background: #f5f5f4; }
            .summary { margin-top: 20px; display: flex; justify-content: space-between; gap: 24px; }
            .summary-box { flex: 1; padding: 14px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; }
            .notes { margin-top: 18px; padding: 14px; border: 1px solid #d6d3d1; border-radius: 12px; background: #fafaf9; }
            @media print { body { margin: 0; padding: 18px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="title">سند شراء ${escapeHtml(receipt.receiptNo)}</p>
              <p style="margin-top: 8px; color: #57534e;">تاريخ الشراء: ${escapeHtml(formatDateOnly(receipt.purchaseDate))}</p>
              <p style="margin-top: 4px; color: #57534e;">تاريخ الإدخال: ${escapeHtml(formatDate(receipt.createdAt))}</p>
            </div>
            <div style="text-align:left;">
              <p style="font-size: 13px; color: #57534e; font-weight: 700;">الإجمالي</p>
              <p style="margin-top: 8px; font-size: 24px; font-weight: 800;">${escapeHtml(formatMoney(receipt.totalCostIqd, 'IQD'))}</p>
            </div>
          </div>

          <div class="meta">
            <div><div class="label">المورد</div><div class="value">${escapeHtml(receipt.supplierName ?? 'مورد غير محدد')}</div></div>
            <div><div class="label">رقم قائمة المورد</div><div class="value">${escapeHtml(receipt.supplierInvoiceNo ?? '-')}</div></div>
            <div><div class="label">العملة الأصلية</div><div class="value">${escapeHtml(receipt.currencyCode === 'USD' ? formatMoney(receipt.totalCost, 'USD') : formatMoney(receipt.totalCost, 'IQD'))}</div></div>
            <div><div class="label">سعر الصرف</div><div class="value">${escapeHtml(receipt.exchangeRate.toString())}</div></div>
          </div>

          <h2 style="font-size: 20px; font-weight: 800;">تفاصيل الأصناف</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الصنف</th>
                <th>وحدة الإدخال</th>
                <th>الكمية المدخلة</th>
                <th>الكمية الأساسية</th>
                <th>رقم التشغيلة</th>
                <th>تاريخ النفاذ</th>
                <th>تكلفة الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>${itemsMarkup}</tbody>
          </table>

          <div class="summary">
            <div class="summary-box"><div class="label">عدد البنود</div><div class="value">${receipt.items.length}</div></div>
            <div class="summary-box"><div class="label">الإجمالي بالدينار</div><div class="value">${escapeHtml(formatMoney(receipt.totalCostIqd, 'IQD'))}</div></div>
          </div>

          <div class="notes"><div class="label">ملاحظات</div><div class="value">${escapeHtml(receipt.notes ?? 'لا توجد ملاحظات.')}</div></div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <main className="min-h-screen scroll-smooth bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[30px] border border-white/75 bg-white/80 px-5 py-4 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">PURCHASES HUB</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">استلام المشتريات</h1>
              <p className="mt-2 text-sm text-stone-600">إدخال سندات الشراء، رفع الأرصدة، وتحديث تكلفة الصنف الأخيرة مباشرة.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-black text-teal-800 transition hover:border-teal-400 hover:bg-teal-100" href="#purchase-form-section">نموذج الشراء</a>
                <a className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-400 hover:text-teal-700" href="#suppliers-section">الموردون</a>
                <a className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-black text-stone-700 transition hover:border-amber-400 hover:text-amber-700" href="#receipts-section">السندات</a>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" onClick={exportReceiptsCsv} type="button">تصدير السندات CSV</button>
              <button className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500" onClick={() => void loadPurchasesData()} type="button">تحديث البيانات</button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/inventory">المخزون</Link>
              {session?.employee.role === 'admin' ? <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/dashboard">اللوحة</Link> : null}
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-emerald-700">RECEIPTS TODAY</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{todaysReceipts.length}</p>
            <p className="mt-2 text-sm text-stone-600">عدد سندات استلام اليوم</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <p className="text-sm font-black tracking-[0.2em] text-amber-700">TODAY COST</p>
            <p className="mt-3 font-display text-4xl font-black text-stone-950">{formatMoney(todaysReceipts.reduce((sum, receipt) => sum + receipt.totalCostIqd, 0), 'IQD')}</p>
            <p className="mt-2 text-sm text-stone-600">إجمالي تكلفة الاستلامات اليوم</p>
          </article>
          <article className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">CURRENT RECEIPT</p>
            <p className="mt-3 font-display text-4xl font-black">{totalCostDisplay.primary}</p>
            <p className="mt-2 text-sm font-bold text-stone-300">{totalCostDisplay.secondary}</p>
            <p className="mt-2 text-sm text-stone-300">{selectedSupplier ? `السند مرتبط بالمورد ${selectedSupplier.name}` : 'إجمالي السند الجاري إدخاله'}</p>
          </article>
        </section>

        <FeedbackMessage message={message} onClear={() => setMessage(null)} />

        <section className="mt-6 space-y-6">
          <section className="scroll-mt-8 rounded-[32px] border border-stone-200/80 bg-[linear-gradient(180deg,#101826_0%,#172436_100%)] p-5 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)] sm:p-6" id="purchase-form-section">
            <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">PURCHASE FORM</p>
            <h2 className="mt-2 font-display text-3xl font-black">{isEditingReceipt ? 'تعديل سند شراء' : 'سند استلام شراء جديد'}</h2>
            <p className="mt-2 text-sm text-stone-300">{isEditingReceipt ? 'أنت الآن في وضع تعديل سند سابق. سيُعاد احتساب المخزون بعد الحفظ.' : 'أدخل سند شراء جديد ليتم رفع الرصيد وتحديث آخر كلفة للصنف مباشرة.'}</p>

            <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-stone-200">المورد<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}><option value="">بدون ربط بمورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                <label className="text-sm font-bold text-stone-200">العملة<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value as CurrencyCode)}><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm font-bold text-stone-200">تاريخ الشراء<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none focus:border-teal-400" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
                <label className="text-sm font-bold text-stone-200">رقم قائمة المورد<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-left text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400" dir="ltr" placeholder="INV-001" value={supplierInvoiceNo} onChange={(event) => setSupplierInvoiceNo(event.target.value)} /></label>
                <label className="text-sm font-bold text-stone-200">سعر الصرف<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400" step="1" type="number" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} /></label>
                <label className="text-sm font-bold text-stone-200">ملاحظات<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-right text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              </div>

              <div className="space-y-3">
                {lines.map((line, index) => {
                  const normalizedLine = normalizedLinesWithCosts[index]
                  const retailUnitCostDisplay = normalizedLine?.retailUnitCostIqd !== null && normalizedLine?.retailUnitCostIqd !== undefined
                    ? formatDualMoney(normalizedLine.retailUnitCostIqd, currencyCode, parsedExchangeRate)
                    : null

                  return (
                  <div key={`${index}-${line.mode}-${line.productId || line.draft.barcode || 'draft'}`} className="rounded-[24px] border border-white/10 bg-black/20 p-3 sm:p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(190px,0.85fr)_auto] lg:items-end">
                      <label className="text-sm font-bold text-stone-200">الباركود الحاسم<select className="sr-only"><option>barcode</option></select><input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-left text-base text-white outline-none focus:border-teal-400" dir="ltr" placeholder="اسحب أو أدخل الباركود أولاً" value={line.lookupBarcode} onBlur={(event) => resolveLineBarcode(index, event.target.value)} onChange={(event) => updateLine(index, { lookupBarcode: event.target.value })} onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          resolveLineBarcode(index, line.lookupBarcode)
                        }
                      }} /></label>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold text-stone-200">
                        <p className="text-xs font-black tracking-[0.18em] text-teal-200/80">حالة السطر</p>
                        <p className="mt-2 text-base text-white">{line.mode === 'existing' ? 'تم العثور على صنف موجود' : 'الباركود غير موجود وسيُنشئ صنفاً جديداً'}</p>
                      </div>
                      <button className="h-12 rounded-2xl border border-white/20 px-4 text-sm font-black text-white transition hover:border-white/40" onClick={() => resolveLineBarcode(index, line.lookupBarcode)} type="button">فحص الباركود</button>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-stone-200">نوع السطر</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <button
                            className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${line.mode === 'existing' ? 'border-teal-300 bg-teal-500/15 text-white' : 'border-white/10 bg-black/20 text-stone-300 hover:border-white/25 hover:text-white'}`}
                            onClick={() => {
                              updateLine(index, {
                                mode: 'existing',
                                productId: line.productId || products[0]?.id || '',
                                entryUnit: supportsWholesalePurchase(products.find((product) => product.id === (line.productId || products[0]?.id))) ? line.entryUnit : 'retail',
                                lookupBarcode: line.productId
                                  ? (products.find((product) => product.id === line.productId)?.barcode ?? line.lookupBarcode)
                                  : (products[0]?.barcode ?? line.lookupBarcode),
                              })
                            }}
                            type="button"
                          >
                            صنف موجود
                          </button>
                          <button
                            className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${line.mode === 'new' ? 'border-amber-300 bg-amber-500/15 text-white' : 'border-white/10 bg-black/20 text-stone-300 hover:border-white/25 hover:text-white'}`}
                            onClick={() => {
                              updateLine(index, {
                                mode: 'new',
                                productId: '',
                                entryUnit: 'retail',
                              })
                            }}
                            type="button"
                          >
                            صنف جديد مع الشراء
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-12 2xl:items-end">

                        {line.mode === 'existing' ? (
                          <label className="text-sm font-bold text-stone-200 md:col-span-2 xl:col-span-3 2xl:col-span-4">الصنف<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={line.productId} onChange={(event) => {
                            const nextProduct = products.find((product) => product.id === event.target.value) ?? null
                            updateLine(index, {
                              productId: event.target.value,
                              lookupBarcode: nextProduct?.barcode ?? line.lookupBarcode,
                              entryUnit: supportsWholesalePurchase(nextProduct) ? line.entryUnit : 'retail',
                            })
                          }}><option value="">اختر صنفاً</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                        ) : (
                          <div className="grid gap-3 md:col-span-2 xl:col-span-3 2xl:col-span-4">
                            {(() => {
                              const familyProfile = getFamilyProfileByName(line.draft.name)
                              const variantSuggestions = getVariantSuggestions(line.draft.name)

                              return (
                                <>
                                  <label className="text-sm font-bold text-stone-200">
                                    اسم المنتج الرئيسي
                                    <SuggestionInput
                                      emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                                      inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                                      optionClassName="w-full px-4 py-3 text-right text-sm font-bold text-stone-100 transition hover:bg-teal-500/20 hover:text-teal-100"
                                      panelClassName="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                                      placeholder="ابدأ بكتابة اسم مثل جل أو شاي"
                                      suggestions={getFamilySuggestionOptions()}
                                      value={line.draft.name}
                                      onChange={(nextValue) => handleDraftFamilyNameChange(index, nextValue)}
                                    />
                                    {familyProfile ? <span className="mt-2 block text-xs font-black text-teal-200">تم العثور على عائلة محفوظة سابقاً وسيتم إعادة استخدام القسم والوحدات والضريبة الخاصة بها.</span> : <span className="mt-2 block text-xs font-bold text-stone-400">إذا كان هذا المنتج الرئيسي مُدخلاً سابقاً فسيظهر لك ضمن الاقتراحات أثناء الكتابة.</span>}
                                  </label>
                                  <label className="text-sm font-bold text-stone-200">
                                    الصنف الفرعي / النكهة / اللون
                                    <SuggestionInput
                                      emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                                      inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                                      optionClassName="w-full px-4 py-3 text-right text-sm font-bold text-stone-100 transition hover:bg-teal-500/20 hover:text-teal-100"
                                      panelClassName="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                                      placeholder="مثال: ياسمين أو ورد"
                                      suggestions={getVariantSuggestionOptions(line.draft.name)}
                                      value={line.draft.variantLabel}
                                      onChange={(nextValue) => updateLineDraft(index, { variantLabel: nextValue })}
                                    />
                                    {variantSuggestions.length ? <span className="mt-2 block text-xs font-black text-teal-200">أصناف فرعية محفوظة لهذه العائلة: {variantSuggestions.join('، ')}</span> : <span className="mt-2 block text-xs font-bold text-stone-400">عند اختيار عائلة موجودة ستظهر لك الأصناف الفرعية السابقة لهذه العائلة.</span>}
                                  </label>
                                </>
                              )
                            })()}
                            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-stone-200">
                              اسم الـ SKU الناتج: {getDraftDisplayName(line.draft)}
                            </div>
                          </div>
                        )}

                        {line.mode === 'new' ? <label className="text-sm font-bold text-stone-200 2xl:col-span-2">القسم<SuggestionInput
                          emptyStateClassName="px-4 py-3 text-right text-xs font-bold text-stone-400"
                          inputClassName="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400"
                          optionClassName="w-full border-b border-white/5 px-4 py-3 text-right text-sm font-bold text-stone-100 transition last:border-b-0 hover:bg-teal-500/20 hover:text-teal-100"
                          panelClassName="absolute right-0 top-full z-20 mt-2 min-w-[280px] max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur"
                          placeholder="اختر قسماً موجوداً أو اكتب قسماً جديداً"
                          suggestions={getDepartmentSuggestionOptions()}
                          value={line.draft.department}
                          onChange={(nextValue) => updateLineDraft(index, { department: nextValue })}
                        />
                        <span className="mt-2 block text-xs font-bold text-stone-400">ستظهر هنا الأقسام المستخدمة سابقاً لتوحيد الإدخال وتقليل اختلاف المسميات.</span></label> : null}

                        {line.mode === 'new' ? <label className="text-sm font-bold text-stone-200 2xl:col-span-2">نوع الصنف<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={line.draft.measurementType} onChange={(event) => {
                          const nextMeasurementType = event.target.value as 'unit' | 'weight'
                          updateLineDraft(index, {
                            measurementType: nextMeasurementType,
                            retailUnit: getDefaultRetailUnit(nextMeasurementType),
                            wholesaleUnit: getDefaultWholesaleUnit(nextMeasurementType),
                          })
                        }}><option value="unit">عددي</option><option value="weight">وزني</option></select></label> : null}

                        <label className="text-sm font-bold text-stone-200 2xl:col-span-2">وحدة الإدخال<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={line.entryUnit} onChange={(event) => updateLine(index, { entryUnit: event.target.value as 'retail' | 'wholesale' })}>{line.mode === 'existing'
                          ? (() => {
                              const product = products.find((entry) => entry.id === line.productId)
                              return <>
                                <option value="retail">{product ? getPurchaseUnitLabel(product, 'retail') : 'المفرد'}</option>
                                {product && supportsWholesalePurchase(product) ? <option value="wholesale">{getPurchaseUnitLabel(product, 'wholesale')}</option> : null}
                              </>
                            })()
                            : <>
                              <option value="retail">{getDraftUnitLabel(line.draft, 'retail') || 'المفرد'}</option>
                              {hasDraftWholesaleUnit(line.draft) ? <option value="wholesale">{getDraftUnitLabel(line.draft, 'wholesale')}</option> : null}
                            </>}</select></label>
                        <label className="text-sm font-bold text-stone-200 2xl:col-span-2">الكمية<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" step={line.entryUnit === 'wholesale' || (line.mode === 'existing' ? (products.find((entry) => entry.id === line.productId)?.measurementType !== 'weight') : line.draft.measurementType !== 'weight') ? '1' : '0.125'} type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
                        <label className="text-sm font-bold text-stone-200 2xl:col-span-2">رقم التشغيلة<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-left text-base text-white outline-none placeholder:text-stone-400 focus:border-teal-400" dir="ltr" placeholder="LOT-001" value={line.batchNo} onChange={(event) => updateLine(index, { batchNo: event.target.value })} /></label>
                        <label className="text-sm font-bold text-stone-200 2xl:col-span-2">تاريخ النفاذ<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" type="date" value={line.expiryDate} onChange={(event) => updateLine(index, { expiryDate: event.target.value })} /></label>
                        <label className="text-sm font-bold text-stone-200 md:col-span-2 2xl:col-span-2">{line.mode === 'existing'
                          ? (() => {
                              const product = products.find((entry) => entry.id === line.productId)
                              return product ? `تكلفة ${getPurchaseUnitLabel(product, line.entryUnit)}` : 'تكلفة الوحدة'
                            })()
                          : `تكلفة ${getDraftUnitLabel(line.draft, line.entryUnit)}`}<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" step="0.01" type="number" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} />{line.mode === 'new' && retailUnitCostDisplay && line.entryUnit === 'wholesale' ? <span className="mt-2 block text-xs font-black text-teal-200">{`سعر ${normalizedLine.retailUnitLabel} الحقيقي: ${retailUnitCostDisplay.primary}`}</span> : null}{line.mode === 'new' && retailUnitCostDisplay && line.entryUnit === 'wholesale' ? <span className="mt-1 block text-[11px] font-bold text-stone-400">{retailUnitCostDisplay.secondary}</span> : null}</label>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button className="min-w-32 rounded-2xl border border-rose-300 px-4 py-3 text-sm font-black text-rose-200 transition hover:border-rose-200 hover:text-white disabled:opacity-40" disabled={lines.length === 1} onClick={() => removeLine(index)} type="button">حذف السطر</button>
                    </div>

                    {line.mode === 'new' ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <label className="text-sm font-bold text-stone-200">باركود المفرد<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-left text-base text-white outline-none focus:border-teal-400" dir="ltr" value={line.draft.barcode} onChange={(event) => {
                            updateLine(index, { lookupBarcode: event.target.value })
                            updateLineDraft(index, { barcode: event.target.value })
                          }} /></label>
                          <label className="text-sm font-bold text-stone-200">باركود الجملة<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-left text-base text-white outline-none focus:border-teal-400" dir="ltr" value={line.draft.wholesaleBarcode} onChange={(event) => updateLineDraft(index, { wholesaleBarcode: event.target.value })} /></label>
                          <label className="text-sm font-bold text-stone-200">رمز PLU<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-left text-base text-white outline-none focus:border-teal-400" dir="ltr" value={line.draft.plu} onChange={(event) => updateLineDraft(index, { plu: event.target.value })} /></label>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <label className="text-sm font-bold text-stone-200">وحدة المفرد<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={line.draft.retailUnit} onChange={(event) => updateLineDraft(index, { retailUnit: event.target.value })}>{getRetailUnitOptions(line.draft.measurementType).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                          <label className="text-sm font-bold text-stone-200">وحدة الجملة<select className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" value={line.draft.wholesaleUnit} onChange={(event) => updateLineDraft(index, { wholesaleUnit: event.target.value })}>{getWholesaleUnitOptions(line.draft.measurementType).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                          <label className="text-sm font-bold text-stone-200">عدد المفردات داخل وحدة الجملة<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" step="1" type="number" value={line.draft.wholesaleQuantity} onChange={(event) => updateLineDraft(index, { wholesaleQuantity: event.target.value })} /></label>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-bold text-stone-200">
                            {supportsDraftWholesale(line.draft)
                              ? <>
                                  <p>{`${line.draft.wholesaleUnit || 'وحدة الجملة'} تحتوي ${line.draft.wholesaleQuantity || '0'} ${line.draft.retailUnit || 'وحدة مفرد'}.`}</p>
                                  {retailUnitCostDisplay ? <p className="mt-3 text-sm font-black text-teal-200">{`الكلفة الحقيقية لـ ${normalizedLine.retailUnitLabel} الواحدة: ${retailUnitCostDisplay.primary}`}</p> : null}
                                  {retailUnitCostDisplay ? <p className="mt-1 text-xs font-bold text-stone-400">{retailUnitCostDisplay.secondary}</p> : null}
                                </>
                              : 'إذا كان الشراء كارتوناً أو شدة، فأدخل وحدة الجملة وعدد المفردات داخلها ليتم احتساب كلفة المفرد تلقائياً.'}
                          </div>
                          <label className="text-sm font-bold text-stone-200">الضريبة %<input className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-right text-base text-white outline-none focus:border-teal-400" step="0.1" type="number" value={line.draft.vatRate} onChange={(event) => updateLineDraft(index, { vatRate: event.target.value })} /><span className="mt-2 block text-xs font-bold text-stone-400">مثال: 15 تعني ضريبة 15%.</span></label>
                        </div>
                      </div>
                    ) : null}

                    {line.mode === 'existing' ? (() => {
                      const product = products.find((entry) => entry.id === line.productId)
                      if (!product) {
                        return null
                      }

                      return (
                        <p className="mt-3 text-xs font-bold text-stone-300">
                          {supportsWholesalePurchase(product)
                            ? `كل ${product.wholesaleUnit} تحتوي ${product.wholesaleQuantity} ${product.retailUnit}. المخزون سيُزاد دائماً بوحدة ${product.retailUnit}.`
                            : `هذا الصنف يعتمد على ${product.retailUnit} كوحدة شراء أساسية.`}
                        </p>
                      )
                    })() : (
                      <p className="mt-3 text-xs font-bold text-stone-300">
                        {supportsDraftWholesale(line.draft)
                          ? `كل ${line.draft.wholesaleUnit} تحتوي ${line.draft.wholesaleQuantity} ${line.draft.retailUnit || 'وحدة مفرد'}. سيتم حفظ ${getDraftDisplayName(line.draft)} كـ SKU مستقل تحت المنتج الرئيسي المدخل.`
                          : `يمكنك إدخال SKU جديد من هذا السند مباشرة. أدخل اسم المنتج الرئيسي ثم الصنف الفرعي مثل النكهة أو اللون، وإذا أضفت تعبئة جملة فأدخل وحدة الجملة وعدد المفردات وباركود الجملة.`}
                      </p>
                    )}
                  </div>
                )})}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-2xl border border-white/20 px-4 py-3 text-base font-black text-white transition hover:border-white/40" onClick={addLine} type="button">إضافة سطر جديد</button>
                {isEditingReceipt ? <button className="rounded-2xl border border-amber-300 px-4 py-3 text-base font-black text-amber-100 transition hover:border-amber-200 hover:text-white" onClick={resetPurchaseForm} type="button">إلغاء التعديل</button> : null}
                <button className="rounded-2xl bg-emerald-500 px-4 py-3 text-base font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300" disabled={isSubmitting || isLoading} type="submit">{isSubmitting ? (isEditingReceipt ? 'جارٍ تعديل السند...' : 'جارٍ حفظ السند...') : (isEditingReceipt ? 'حفظ التعديلات' : 'تثبيت سند الشراء')}</button>
              </div>
            </form>
          </section>

            <section className="scroll-mt-8 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6" id="suppliers-section">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black tracking-[0.2em] text-teal-700">SUPPLIERS</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-stone-950">إدارة الموردين</h2>
                </div>
                <div className="rounded-2xl bg-stone-100 px-4 py-3 text-left">
                  <p className="text-xs font-black tracking-[0.18em] text-stone-500">ACTIVE</p>
                  <p className="mt-1 font-display text-2xl font-black text-stone-950">{suppliers.length}</p>
                </div>
              </div>

              <form className="mt-5 grid gap-3" onSubmit={handleSupplierSubmit}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold text-stone-700">اسم المورد<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500" value={supplierDraftName} onChange={(event) => setSupplierDraftName(event.target.value)} /></label>
                  <label className="text-sm font-bold text-stone-700">الهاتف<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-right text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500" value={supplierDraftPhone} onChange={(event) => setSupplierDraftPhone(event.target.value)} /></label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-teal-300" disabled={isSavingSupplier} type="submit">{isSavingSupplier ? 'جارٍ الحفظ...' : editingSupplierId ? 'حفظ التعديل' : 'إضافة مورد'}</button>
                  <button className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-black text-stone-700 transition hover:border-stone-500 disabled:opacity-50" disabled={isSavingSupplier || (!editingSupplierId && !supplierDraftName && !supplierDraftPhone)} onClick={resetSupplierForm} type="button">إلغاء</button>
                </div>
              </form>

              <div className="mt-5 space-y-3">
                {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-6 text-center text-stone-500">جارٍ تحميل الموردين...</div> : suppliers.length === 0 ? <div className="rounded-2xl bg-stone-50 px-4 py-6 text-center text-stone-500">لا يوجد موردون بعد. أضف أول مورد لربطه بسندات الشراء.</div> : sortedSuppliers.map((supplier) => (
                  <article key={supplier.id} className={`rounded-2xl border px-4 py-4 transition ${selectedSupplierId === supplier.id ? 'border-teal-500 bg-teal-50/80' : 'border-stone-200 bg-stone-50/80'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <button className="text-right font-display text-xl font-black text-stone-950 transition hover:text-teal-700" onClick={() => setSelectedSupplierId(supplier.id)} type="button">{supplier.name}</button>
                        <p className="mt-1 text-sm text-stone-600">{supplier.phone || 'بدون رقم هاتف'} </p>
                        <p className="mt-2 text-sm font-bold text-stone-500">الرصيد الحالي: {formatMoney(supplier.currentBalance, 'IQD')}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button className="text-sm font-black text-teal-700 transition hover:text-teal-900" onClick={() => handleEditSupplier(supplier)} type="button">تعديل</button>
                        <button className="text-sm font-black text-rose-700 transition hover:text-rose-900" disabled={isSavingSupplier} onClick={() => void handleDeleteSupplier(supplier)} type="button">حذف</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {selectedSupplier ? (
                <section className="mt-6 rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#fffaf1_0%,#f8f2e7_100%)] p-5 xl:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-sm font-black tracking-[0.2em] text-amber-700">SUPPLIER SETTLEMENT</p>
                      <h3 className="mt-2 font-display text-2xl font-black text-stone-950">تسوية رصيد {selectedSupplier.name}</h3>
                      <p className="mt-2 text-sm text-stone-600">سجل دفعة على المورد لتخفيض الرصيد المستحق وعرض آخر التسويات.</p>
                    </div>
                    <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[320px]">
                      <div className="rounded-2xl border border-stone-200/70 bg-white/90 px-4 py-3 text-right shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">CURRENT BALANCE</p>
                        <p className="mt-1 font-display text-2xl font-black text-rose-700">{formatMoney(selectedSupplier.currentBalance, 'IQD')}</p>
                      </div>
                      <div className="rounded-2xl border border-stone-200/70 bg-white/90 px-4 py-3 text-right shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">PAYMENTS TODAY</p>
                        <p className="mt-1 font-display text-2xl font-black text-emerald-700">{formatMoney(todaysSupplierPayments.reduce((sum, payment) => sum + payment.amountIqd, 0), 'IQD')}</p>
                      </div>
                    </div>
                  </div>

                  <form className="mt-5 grid gap-4" onSubmit={handleSupplierPaymentSubmit}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-bold text-stone-700">العملة<select className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" value={paymentCurrencyCode} onChange={(event) => setPaymentCurrencyCode(event.target.value as CurrencyCode)}><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
                      <label className="text-sm font-bold text-stone-700">سعر الصرف<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" step="1" type="number" value={paymentExchangeRate} onChange={(event) => setPaymentExchangeRate(event.target.value)} /></label>
                      <label className="text-sm font-bold text-stone-700">قيمة الدفعة<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" step="0.01" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
                      <label className="text-sm font-bold text-stone-700">ما يعادلها بالدينار<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-stone-100 px-4 text-right text-base font-black text-stone-900 outline-none" readOnly value={paymentAmountIqd ? formatMoney(paymentAmountIqd, 'IQD') : ''} /></label>
                    </div>

                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">سيتم تسديد دفعة المورد تلقائياً من FINAL CASH بحسب الرصيد النقدي النهائي المتاح.</div>

                    <label className="text-sm font-bold text-stone-700">ملاحظات الدفعة<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /></label>

                    <div className="flex flex-wrap items-center gap-3">
                      <button className="rounded-2xl bg-amber-600 px-4 py-3 text-sm font-black text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300" disabled={isSubmittingPayment} type="submit">{isSubmittingPayment ? 'جارٍ تسجيل الدفعة...' : 'تسجيل دفعة للمورد'}</button>
                      <button className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-black text-stone-700 transition hover:border-stone-500 disabled:opacity-50" disabled={isSubmittingPayment && !paymentAmount} onClick={resetPaymentForm} type="button">تفريغ الحقول</button>
                    </div>
                  </form>

                  <div className="mt-5 space-y-3">
                    <h4 className="text-sm font-black tracking-[0.2em] text-stone-500">آخر الدفعات</h4>
                    {isLoadingPayments ? <div className="rounded-2xl bg-white/90 px-4 py-6 text-center text-stone-500">جارٍ تحميل دفعات المورد...</div> : supplierPayments.length === 0 ? <div className="rounded-2xl bg-white/90 px-4 py-6 text-center text-stone-500">لا توجد دفعات مسجلة لهذا المورد حتى الآن.</div> : supplierPayments.slice(0, 6).map((payment) => (
                      <article key={payment.id} className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-lg font-black text-stone-950">{payment.paymentNo}</p>
                            <p className="mt-1 text-sm text-stone-600">{formatDate(payment.createdAt)}{payment.sourceFundAccountName ? ` | من ${payment.sourceFundAccountName}` : ''}{payment.notes ? ` | ${payment.notes}` : ''}</p>
                          </div>
                          <div className="text-left">
                            <p className="font-display text-xl font-black text-emerald-700">{formatMoney(payment.amountIqd, 'IQD')}</p>
                            <p className="text-xs font-bold text-stone-500">{payment.currencyCode === 'USD' ? formatMoney(payment.amount, 'USD') : 'مدفوعة بالدينار'}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-black tracking-[0.2em] text-stone-500">كشف حساب المورد</h4>
                      <span className="text-xs font-bold text-stone-500">{filteredSupplierLedger.length} حركة ضمن {filteredSupplierLedgerGroups.length} مجموعة معروضة من أصل {selectedSupplierLedgerWithBalance.length}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_auto] 2xl:items-end">
                      <label className="text-sm font-bold text-stone-700">من تاريخ<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" type="date" value={ledgerDateFrom} onChange={(event) => setLedgerDateFrom(event.target.value)} /></label>
                      <label className="text-sm font-bold text-stone-700">إلى تاريخ<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-right text-base text-stone-900 outline-none focus:border-amber-500" type="date" value={ledgerDateTo} onChange={(event) => setLedgerDateTo(event.target.value)} /></label>
                      <label className="text-sm font-bold text-stone-700">رقم قائمة المورد<input className="mt-2 h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-left text-base text-stone-900 outline-none focus:border-amber-500" dir="ltr" placeholder="INV-001" value={ledgerInvoiceQuery} onChange={(event) => setLedgerInvoiceQuery(event.target.value)} /></label>
                      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 2xl:col-span-1">
                        <button className="rounded-2xl bg-amber-700 px-4 py-3 text-sm font-black text-white transition hover:bg-amber-600" onClick={printSelectedSupplierLedger} type="button">طباعة الكشف</button>
                        <button className="rounded-2xl bg-stone-900 px-4 py-3 text-sm font-black text-white transition hover:bg-stone-700" onClick={exportSelectedSupplierLedgerCsv} type="button">تصدير CSV</button>
                        <button className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-black text-stone-700 transition hover:border-stone-500" onClick={resetLedgerFilters} type="button">تصفير الفلاتر</button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:border-amber-500 hover:bg-amber-100" onClick={() => setQuickLedgerRange('today')} type="button">اليوم</button>
                      <button className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:border-amber-500 hover:bg-amber-100" onClick={() => setQuickLedgerRange('week')} type="button">هذا الأسبوع</button>
                      <button className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 transition hover:border-amber-500 hover:bg-amber-100" onClick={() => setQuickLedgerRange('month')} type="button">هذا الشهر</button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                      <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">المشتريات المعروضة</p>
                        <p className="mt-2 font-display text-2xl font-black text-stone-950">{formatMoney(filteredSupplierReceiptsTotalIqd, 'IQD')}</p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">الدفعات المعروضة</p>
                        <p className="mt-2 font-display text-2xl font-black text-emerald-700">{formatMoney(filteredSupplierPaymentsTotalIqd, 'IQD')}</p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">الرصيد المفتوح</p>
                        <p className={`mt-2 font-display text-2xl font-black ${selectedSupplier.currentBalance > 0 ? 'text-rose-700' : selectedSupplier.currentBalance < 0 ? 'text-emerald-700' : 'text-stone-950'}`}>{formatMoney(selectedSupplier.currentBalance, 'IQD')}</p>
                      </div>
                      <div className="rounded-2xl border border-stone-200 bg-white/90 px-4 py-4 shadow-sm">
                        <p className="text-xs font-black tracking-[0.18em] text-stone-500">عدد الحركات المعروضة</p>
                        <p className="mt-2 font-display text-2xl font-black text-stone-950">{filteredSupplierLedger.length}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h5 className="text-sm font-black tracking-[0.18em] text-stone-500">الحركات المحاسبية</h5>
                      {filteredSupplierLedger.length === 0 ? <div className="rounded-2xl bg-white/90 px-4 py-6 text-center text-stone-500">لا توجد حركات مطابقة للفلاتر الحالية.</div> : filteredSupplierLedgerGroups.map((group) => (
                        <section key={group.key} className="overflow-hidden rounded-[26px] border border-stone-200 bg-white/70 p-4 shadow-sm xl:p-5">
                          <div className="border-b border-stone-200/80 pb-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-3 py-1 text-xs font-black ${group.type === 'invoice' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                  {group.type === 'invoice' ? 'مجموعة قائمة مورد' : 'مجموعة دفعة'}
                                </span>
                                <h6 className="font-display text-lg font-black text-stone-950">{group.title}</h6>
                              </div>
                              <p className="mt-2 text-sm text-stone-500">
                                {group.type === 'invoice'
                                  ? `${group.entries.length} سند/حركة شراء ضمن نفس قائمة المورد.`
                                  : 'دفعة مورد مستقلة غير مرتبطة بقائمة شراء مباشرة.'}
                              </p>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                                <p className="text-xs font-black tracking-[0.16em] text-amber-800">مدين</p>
                                <p className="mt-2 font-display text-xl font-black text-amber-700">{formatMoney(group.totalDebitIqd, 'IQD')}</p>
                              </div>
                              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                                <p className="text-xs font-black tracking-[0.16em] text-emerald-800">دائن</p>
                                <p className="mt-2 font-display text-xl font-black text-emerald-700">{formatMoney(group.totalCreditIqd, 'IQD')}</p>
                              </div>
                              <div className="rounded-2xl bg-stone-50 px-4 py-3">
                                <p className="text-xs font-black tracking-[0.16em] text-stone-500">الرصيد بعد آخر حركة</p>
                                <p className={`mt-2 font-display text-xl font-black ${group.entries[group.entries.length - 1].runningBalanceIqd > 0 ? 'text-rose-700' : group.entries[group.entries.length - 1].runningBalanceIqd < 0 ? 'text-emerald-700' : 'text-stone-950'}`}>{formatMoney(group.entries[group.entries.length - 1].runningBalanceIqd, 'IQD')}</p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 space-y-3">
                            {group.entries.map((entry) => (
                              <article key={`${entry.type}-${entry.id}`} className={`rounded-2xl border bg-white/90 px-4 py-4 shadow-sm transition ${entry.type === 'receipt' ? 'cursor-pointer hover:border-amber-300' : ''} ${entry.type === 'receipt' && selectedReceiptId === entry.receipt.id ? 'border-amber-400' : 'border-stone-200'}`} onClick={entry.type === 'receipt' ? () => setSelectedReceiptId(entry.receipt.id) : undefined}>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`rounded-full px-3 py-1 text-xs font-black ${entry.type === 'receipt' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                        {entry.type === 'receipt' ? 'سند شراء' : 'دفعة مورد'}
                                      </span>
                                      <p className="font-display text-lg font-black text-stone-950">{entry.type === 'receipt' ? entry.receipt.receiptNo : entry.payment.paymentNo}</p>
                                    </div>

                                    {entry.type === 'receipt' ? (
                                      <>
                                        <p className="mt-2 text-sm text-stone-600">{`تاريخ الشراء: ${formatDateOnly(entry.receipt.purchaseDate)}`}</p>
                                        <p className="mt-1 text-sm text-stone-500">{`أُدخل في النظام: ${formatDate(entry.receipt.createdAt)}`}</p>
                                        <p className="mt-2 text-sm text-stone-500">عدد البنود: {entry.receipt.items.length}{entry.receipt.supplierInvoiceNo ? ` | قائمة المورد: ${entry.receipt.supplierInvoiceNo}` : ''}{entry.receipt.notes ? ` | ${entry.receipt.notes}` : ''}</p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="mt-2 text-sm text-stone-600">{`تاريخ الدفعة: ${formatDate(entry.payment.createdAt)}`}</p>
                                        <p className="mt-2 text-sm text-stone-500">{entry.payment.notes ? entry.payment.notes : 'دفعة مسجلة بدون ملاحظات.'}</p>
                                      </>
                                    )}
                                </div>

                                <div className="mt-4 grid gap-3 text-left sm:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-2xl bg-stone-50 px-4 py-3">
                                      <p className="text-xs font-black tracking-[0.16em] text-stone-500">الحركة</p>
                                      <p className={`mt-2 font-display text-xl font-black ${entry.deltaIqd >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                        {entry.deltaIqd >= 0 ? `+${formatMoney(entry.deltaIqd, 'IQD')}` : `-${formatMoney(Math.abs(entry.deltaIqd), 'IQD')}`}
                                      </p>
                                      <p className="text-xs font-bold text-stone-500">
                                        {entry.type === 'receipt'
                                          ? (entry.receipt.currencyCode === 'USD' ? formatMoney(entry.receipt.totalCost, 'USD') : 'مشتريات بالدينار')
                                          : (entry.payment.currencyCode === 'USD' ? formatMoney(entry.payment.amount, 'USD') : 'دفعة بالدينار')}
                                      </p>
                                    </div>
                                    <div className="rounded-2xl bg-amber-50 px-4 py-3">
                                      <p className="text-xs font-black tracking-[0.16em] text-amber-800">مدين</p>
                                      <p className="mt-2 font-display text-xl font-black text-amber-700">{entry.type === 'receipt' ? formatMoney(entry.amountIqd, 'IQD') : '0 د.ع'}</p>
                                    </div>
                                    <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                                      <p className="text-xs font-black tracking-[0.16em] text-emerald-800">دائن</p>
                                      <p className="mt-2 font-display text-xl font-black text-emerald-700">{entry.type === 'payment' ? formatMoney(entry.amountIqd, 'IQD') : '0 د.ع'}</p>
                                    </div>
                                    <div className="rounded-2xl bg-stone-50 px-4 py-3">
                                      <p className="text-xs font-black tracking-[0.16em] text-stone-500">الرصيد بعد الحركة</p>
                                      <p className={`mt-2 font-display text-xl font-black ${entry.runningBalanceIqd > 0 ? 'text-rose-700' : entry.runningBalanceIqd < 0 ? 'text-emerald-700' : 'text-stone-950'}`}>{formatMoney(entry.runningBalanceIqd, 'IQD')}</p>
                                    </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </section>

            <section className="scroll-mt-8 rounded-[32px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:p-6" id="receipts-section">
              <p className="text-sm font-black tracking-[0.2em] text-amber-700">RECEIPTS</p>
              <h2 className="mt-2 font-display text-3xl font-black text-stone-950">آخر سندات الشراء</h2>

              <div className="mt-5 space-y-3">
                {isLoading ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">جارٍ تحميل السندات...</div> : receipts.length === 0 ? <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد سندات شراء حتى الآن.</div> : receipts.slice(0, 8).map((receipt) => (
                  <article key={receipt.id} className={`cursor-pointer rounded-2xl border bg-stone-50/80 px-4 py-4 transition hover:border-teal-400 ${selectedReceiptId === receipt.id ? 'border-teal-500' : 'border-stone-200'}`} onClick={() => setSelectedReceiptId(receipt.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl font-black text-stone-950">{receipt.receiptNo}</p>
                        <p className="mt-1 text-sm text-stone-600">{receipt.supplierName || 'مورد غير محدد'} | {`تاريخ الشراء: ${receipt.purchaseDate}`}</p>
                        <p className="mt-2 text-sm text-stone-500">عدد البنود: {receipt.items.length}{receipt.supplierInvoiceNo ? ` | قائمة المورد: ${receipt.supplierInvoiceNo}` : ''}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-display text-xl font-black text-emerald-700">{formatMoney(receipt.totalCostIqd, 'IQD')}</p>
                        <p className="text-xs font-bold text-stone-500">{receipt.currencyCode === 'USD' ? formatMoney(receipt.totalCost, 'USD') : 'مدخل بالدينار'}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {selectedReceipt ? (
                <section className="mt-6 rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,#f9fafb_0%,#f3f4f6_100%)] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-black tracking-[0.2em] text-teal-700">RECEIPT DETAIL</p>
                      <h3 className="mt-2 font-display text-2xl font-black text-stone-950">تفاصيل السند {selectedReceipt.receiptNo}</h3>
                      <p className="mt-2 text-sm text-stone-600">اضغط على أي سند لعرض تفاصيله الكاملة ثم اطبعه مباشرة.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <button className="rounded-2xl border border-amber-300 px-4 py-3 text-sm font-black text-amber-700 transition hover:border-amber-400 hover:bg-amber-50" disabled={isSubmitting} onClick={() => handleEditReceipt(selectedReceipt)} type="button">تعديل السند</button>
                        <button className="rounded-2xl border border-rose-300 px-4 py-3 text-sm font-black text-rose-700 transition hover:border-rose-400 hover:bg-rose-50" disabled={isSubmitting} onClick={() => void handleDeleteReceipt(selectedReceipt)} type="button">حذف السند</button>
                      <button className="rounded-2xl bg-teal-700 px-4 py-3 text-sm font-black text-white transition hover:bg-teal-600" onClick={() => printReceipt(selectedReceipt)} type="button">طباعة السند</button>
                      <button className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-black text-stone-700 transition hover:border-stone-500" onClick={() => setSelectedReceiptId(null)} type="button">إغلاق التفاصيل</button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-black tracking-[0.18em] text-stone-500">المورد</p><p className="mt-2 text-base font-black text-stone-950">{selectedReceipt.supplierName || 'مورد غير محدد'}</p></div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-black tracking-[0.18em] text-stone-500">تاريخ الشراء</p><p className="mt-2 text-base font-black text-stone-950">{formatDateOnly(selectedReceipt.purchaseDate)}</p></div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-black tracking-[0.18em] text-stone-500">رقم قائمة المورد</p><p className="mt-2 text-base font-black text-stone-950">{selectedReceipt.supplierInvoiceNo || 'غير مسجل'}</p></div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm"><p className="text-xs font-black tracking-[0.18em] text-stone-500">الإجمالي</p><p className="mt-2 text-base font-black text-emerald-700">{formatMoney(selectedReceipt.totalCostIqd, 'IQD')}</p><p className="mt-1 text-xs font-bold text-stone-500">{selectedReceipt.currencyCode === 'USD' ? formatMoney(selectedReceipt.totalCost, 'USD') : 'مدخل بالدينار'}</p></div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <div className="border-b border-stone-200 px-4 py-4">
                      <h4 className="text-sm font-black tracking-[0.18em] text-stone-500">أصناف السند</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-stone-700">
                        <thead className="bg-stone-50 text-stone-500">
                          <tr>
                            <th className="px-4 py-3 text-right font-black">الصنف</th>
                            <th className="px-4 py-3 text-right font-black">وحدة الإدخال</th>
                            <th className="px-4 py-3 text-right font-black">الكمية المدخلة</th>
                            <th className="px-4 py-3 text-right font-black">الكمية الأساسية</th>
                            <th className="px-4 py-3 text-right font-black">رقم التشغيلة</th>
                            <th className="px-4 py-3 text-right font-black">تاريخ النفاذ</th>
                            <th className="px-4 py-3 text-right font-black">تكلفة الوحدة</th>
                            <th className="px-4 py-3 text-right font-black">إجمالي السطر</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedReceipt.items.map((item, index) => (
                            <tr key={`${selectedReceipt.id}-${item.productId}-${item.name}-${item.batchNo ?? index}`} className="border-t border-stone-100">
                              <td className="px-4 py-3 font-bold text-stone-900">{item.name}</td>
                              <td className="px-4 py-3">{item.entryUnitLabel}</td>
                              <td className="px-4 py-3">{item.quantity}</td>
                              <td className="px-4 py-3">{item.baseQuantity}</td>
                              <td className="px-4 py-3">{item.batchNo || 'غير مسجل'}</td>
                              <td className="px-4 py-3">{item.expiryDate ? formatDateOnly(item.expiryDate) : 'غير مسجل'}</td>
                              <td className="px-4 py-3">{formatMoney(item.unitCostIqd, 'IQD')}</td>
                              <td className="px-4 py-3 font-black text-emerald-700">{formatMoney(item.lineTotalIqd, 'IQD')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-xs font-black tracking-[0.18em] text-stone-500">ملاحظات السند</p>
                    <p className="mt-2 text-sm font-bold text-stone-700">{selectedReceipt.notes || 'لا توجد ملاحظات مضافة على هذا السند.'}</p>
                    <p className="mt-3 text-xs font-bold text-stone-500">أُدخل في النظام: {formatDate(selectedReceipt.createdAt)}</p>
                  </div>
                </section>
              ) : null}
          </section>
        </section>
      </div>
    </main>
  )
}

function getDraftDisplayName(draft: ProductDraftState) {
  return buildProductDisplayName(draft.name.trim() || 'منتج رئيسي', draft.variantLabel.trim() || undefined)
}