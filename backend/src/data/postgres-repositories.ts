import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { CustomerPaymentInput } from '../modules/customers/schemas.js'
import type { CreatePurchaseReceiptInput } from '../modules/purchases/schemas.js'
import type { Customer, CustomerPayment } from '../modules/customers/store.js'
import type { StoredPurchaseReceipt } from '../modules/purchases/store.js'
import type { CatalogProduct, ProductUpsertInput, StockMovement } from '../modules/products/store.js'
import type { CreateSaleInvoiceInput, CreateSaleReturnInput } from '../modules/sales/schemas.js'
import type { StoredSaleInvoice, StoredSaleInvoiceItem, StoredSaleReturn } from '../modules/sales/store.js'
import type { Supplier, SupplierPayment } from '../modules/suppliers/store.js'
import type { SupplierPaymentInput } from '../modules/suppliers/schemas.js'
import type { DataAccess } from './contracts.js'

type Queryable = Pool | PoolClient

type ProductRow = {
  id: string
  name: string
  barcode: string
  wholesale_barcode: string | null
  plu: string | null
  department: string
  measurement_type: 'unit' | 'weight' | null
  purchase_cost_basis: 'retail' | 'wholesale' | null
  retail_unit: string | null
  wholesale_unit: string | null
  wholesale_quantity: string | number | null
  retail_purchase_price: string | number | null
  wholesale_purchase_price: string | number | null
  retail_sale_price: string | number | null
  wholesale_sale_price: string | number | null
  purchase_price: string | number
  unit_price: string | number
  vat_rate: string | number
  stock_qty: string | number
  min_stock: string | number
  sold_by_weight: boolean
  unit_label: string
}

type MovementRow = {
  id: string
  product_id: string
  product_name: string
  movement_type: 'sale' | 'adjustment' | 'return' | 'purchase'
  quantity_delta: string | number
  balance_after: string | number
  note: string
  created_at: Date | string
}

type InvoiceRow = {
  id: string
  invoice_no: string
  payment_status: 'paid' | 'partial' | 'credit'
  payment_type: 'cash' | 'credit' | 'partial'
  customer_id: string | null
  customer_name: string | null
  currency_code: 'IQD' | 'USD'
  exchange_rate: string | number
  subtotal: string | number
  vat_amount: string | number
  total_amount: string | number
  amount_paid_iqd: string | number
  remaining_amount_iqd: string | number
  notes: string | null
  created_at: Date | string
}

type InvoiceItemRow = {
  id: string
  invoice_id: string
  product_id: string
  name: string
  barcode: string
  quantity: string | number
  base_quantity: string | number
  unit_cost: string | number
  unit_price: string | number
  vat_rate: string | number
  line_cost: string | number
  line_total: string | number
  sale_unit: 'retail' | 'wholesale'
  unit_label: string
  source: 'barcode' | 'scale' | 'manual'
}

type InvoicePaymentRow = {
  id: string
  invoice_id: string
  payment_method: 'cash'
  currency_code: 'IQD' | 'USD'
  amount_received: string | number
  amount_received_iqd: string | number
  exchange_rate: string | number
}

type SaleReturnRow = {
  id: string
  invoice_id: string
  reason: string
  created_at: Date | string
}

type SaleReturnItemRow = {
  id: string
  sale_return_id: string
  invoice_item_id: string | null
  product_id: string
  quantity: string | number
}

type PurchaseReceiptRow = {
  id: string
  receipt_no: string
  supplier_id: string | null
  supplier_name: string | null
  purchase_date: Date | string | null
  supplier_invoice_no: string | null
  currency_code: 'IQD' | 'USD'
  exchange_rate: string | number
  total_cost: string | number
  total_cost_iqd: string | number
  notes: string | null
  created_at: Date | string
}

type PurchaseReceiptItemRow = {
  id: string
  receipt_id: string
  product_id: string
  name: string
  quantity: string | number
  base_quantity: string | number
  entry_unit: 'retail' | 'wholesale'
  entry_unit_label: string
  batch_no: string | null
  expiry_date: Date | string | null
  unit_cost: string | number
  unit_cost_iqd: string | number
  line_total: string | number
  line_total_iqd: string | number
}

type SupplierRow = {
  id: string
  name: string
  phone: string | null
  current_balance: string | number
  is_active: boolean
  created_at: Date | string
}

type SupplierPaymentRow = {
  id: string
  payment_no: string
  supplier_id: string
  supplier_name: string
  currency_code: 'IQD' | 'USD'
  exchange_rate: string | number
  amount: string | number
  amount_iqd: string | number
  notes: string | null
  created_at: Date | string
}

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  current_balance: string | number
  is_active: boolean
  created_at: Date | string
}

type CustomerPaymentRow = {
  id: string
  payment_no: string
  customer_id: string
  customer_name: string
  currency_code: 'IQD' | 'USD'
  exchange_rate: string | number
  amount: string | number
  amount_iqd: string | number
  notes: string | null
  created_at: Date | string
}

function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}

function asNumber(value: string | number) {
  return typeof value === 'number' ? value : Number(value)
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function buildPurchasedProductInput(
  draft: NonNullable<CreatePurchaseReceiptInput['items'][number]['productDraft']>,
  entryUnit: CreatePurchaseReceiptInput['items'][number]['entryUnit'],
  unitCostIqd: number,
): ProductUpsertInput {
  const hasWholesale = Boolean(draft.wholesaleUnit && draft.wholesaleQuantity && draft.wholesaleQuantity > 0)
  const wholesaleQuantity = draft.wholesaleQuantity ?? 1
  const usesWholesaleCost = entryUnit === 'wholesale' && hasWholesale
  const retailPurchasePrice = usesWholesaleCost
    ? roundMoney(unitCostIqd / wholesaleQuantity)
    : roundMoney(unitCostIqd)

  return {
    name: draft.name,
    barcode: draft.barcode,
    wholesaleBarcode: hasWholesale ? draft.wholesaleBarcode || undefined : undefined,
    plu: draft.plu || undefined,
    department: draft.department,
    measurementType: draft.measurementType,
    purchaseCostBasis: usesWholesaleCost ? 'wholesale' : 'retail',
    retailUnit: draft.retailUnit,
    wholesaleUnit: hasWholesale ? draft.wholesaleUnit || undefined : undefined,
    wholesaleQuantity: hasWholesale ? draft.wholesaleQuantity : undefined,
    retailPurchasePrice,
    wholesalePurchasePrice: hasWholesale ? (usesWholesaleCost ? roundMoney(unitCostIqd) : roundMoney(retailPurchasePrice * wholesaleQuantity)) : undefined,
    retailSalePrice: 0,
    wholesaleSalePrice: undefined,
    vatRate: draft.vatRate,
    stockQty: 0,
    minStock: 0,
  }
}

function mapProductRow(row: ProductRow): CatalogProduct {
  const retailPurchasePrice = row.retail_purchase_price !== null ? asNumber(row.retail_purchase_price) : asNumber(row.purchase_price)
  const retailSalePrice = row.retail_sale_price !== null ? asNumber(row.retail_sale_price) : asNumber(row.unit_price)

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    wholesaleBarcode: row.wholesale_barcode ?? undefined,
    plu: row.plu ?? undefined,
    department: row.department,
    measurementType: row.measurement_type ?? (row.sold_by_weight ? 'weight' : 'unit'),
    purchaseCostBasis: row.purchase_cost_basis ?? 'retail',
    retailUnit: row.retail_unit ?? row.unit_label,
    wholesaleUnit: row.wholesale_unit ?? undefined,
    wholesaleQuantity: row.wholesale_quantity !== null ? asNumber(row.wholesale_quantity) : undefined,
    retailPurchasePrice,
    wholesalePurchasePrice: row.wholesale_purchase_price !== null ? asNumber(row.wholesale_purchase_price) : undefined,
    retailSalePrice,
    wholesaleSalePrice: row.wholesale_sale_price !== null ? asNumber(row.wholesale_sale_price) : undefined,
    purchasePrice: retailPurchasePrice,
    unitPrice: retailSalePrice,
    vatRate: asNumber(row.vat_rate),
    stockQty: asNumber(row.stock_qty),
    minStock: asNumber(row.min_stock),
    soldByWeight: (row.measurement_type ?? (row.sold_by_weight ? 'weight' : 'unit')) === 'weight',
    unitLabel: row.retail_unit ?? row.unit_label,
  }
}

function mapMovementRow(row: MovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    movementType: row.movement_type,
    quantityDelta: asNumber(row.quantity_delta),
    balanceAfter: asNumber(row.balance_after),
    note: row.note,
    createdAt: toIsoString(row.created_at),
  }
}

async function loadInvoices(database: Queryable, invoiceIds?: string[]): Promise<StoredSaleInvoice[]> {
  const invoicesResult = invoiceIds && invoiceIds.length > 0
    ? await database.query<InvoiceRow>(
        `
          select id, invoice_no, payment_status, payment_type, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes, created_at
          from app_sale_invoices
          where id = any($1::text[])
          order by created_at desc
        `,
        [invoiceIds],
      )
    : await database.query<InvoiceRow>(
        `
          select id, invoice_no, payment_status, payment_type, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes, created_at
          from app_sale_invoices
          order by created_at desc
        `,
      )

  if (invoicesResult.rows.length === 0) {
    return []
  }

  const ids = invoicesResult.rows.map((row) => row.id)
  const itemsResult = await database.query<InvoiceItemRow>(
    `
      select id, invoice_id, product_id, name, barcode, quantity, base_quantity, unit_cost, unit_price, vat_rate, line_cost, line_total, sale_unit, unit_label, source
      from app_sale_invoice_items
      where invoice_id = any($1::text[])
      order by invoice_id asc, id asc
    `,
    [ids],
  )
  const paymentsResult = await database.query<InvoicePaymentRow>(
    `
      select id, invoice_id, payment_method, currency_code, amount_received, amount_received_iqd, exchange_rate
      from app_sale_invoice_payments
      where invoice_id = any($1::text[])
      order by invoice_id asc, id asc
    `,
    [ids],
  )
  const returnsResult = await database.query<SaleReturnRow>(
    `
      select id, invoice_id, reason, created_at
      from app_sale_returns
      where invoice_id = any($1::text[])
      order by created_at desc
    `,
    [ids],
  )
  const returnIds = returnsResult.rows.map((row) => row.id)
  const returnItemsResult = returnIds.length > 0
    ? await database.query<SaleReturnItemRow>(
        `
          select id, sale_return_id, invoice_item_id, product_id, quantity
          from app_sale_return_items
          where sale_return_id = any($1::text[])
          order by sale_return_id asc, id asc
        `,
        [returnIds],
      )
    : { rows: [] as SaleReturnItemRow[] }

  const itemsByInvoice = new Map<string, InvoiceItemRow[]>()
  for (const row of itemsResult.rows) {
    const current = itemsByInvoice.get(row.invoice_id) ?? []
    current.push(row)
    itemsByInvoice.set(row.invoice_id, current)
  }

  const paymentsByInvoice = new Map<string, InvoicePaymentRow[]>()
  for (const row of paymentsResult.rows) {
    const current = paymentsByInvoice.get(row.invoice_id) ?? []
    current.push(row)
    paymentsByInvoice.set(row.invoice_id, current)
  }

  const returnItemsByReturn = new Map<string, SaleReturnItemRow[]>()
  for (const row of returnItemsResult.rows) {
    const current = returnItemsByReturn.get(row.sale_return_id) ?? []
    current.push(row)
    returnItemsByReturn.set(row.sale_return_id, current)
  }

  const returnsByInvoice = new Map<string, StoredSaleReturn[]>()
  for (const row of returnsResult.rows) {
    const current = returnsByInvoice.get(row.invoice_id) ?? []
    current.push({
      id: row.id,
      reason: row.reason,
      createdAt: toIsoString(row.created_at),
      items: (returnItemsByReturn.get(row.id) ?? []).map((item) => ({
        invoiceItemId: item.invoice_item_id ?? undefined,
        productId: item.product_id,
        quantity: asNumber(item.quantity),
      })),
    })
    returnsByInvoice.set(row.invoice_id, current)
  }

  return invoicesResult.rows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoice_no,
    paymentStatus: row.payment_status,
    paymentType: row.payment_type,
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name ?? undefined,
    currencyCode: row.currency_code,
    exchangeRate: asNumber(row.exchange_rate),
    subtotal: asNumber(row.subtotal),
    vatAmount: asNumber(row.vat_amount),
    totalAmount: asNumber(row.total_amount),
    amountPaidIqd: asNumber(row.amount_paid_iqd),
    remainingAmountIqd: asNumber(row.remaining_amount_iqd),
    notes: row.notes ?? undefined,
    createdAt: toIsoString(row.created_at),
    items: (itemsByInvoice.get(row.id) ?? []).map((item): StoredSaleInvoiceItem => {
      const lineCost = asNumber(item.line_cost)
      const lineTotal = asNumber(item.line_total)

      return {
        id: item.id,
        productId: item.product_id,
        name: item.name,
        barcode: item.barcode,
        quantity: asNumber(item.quantity),
        baseQuantity: asNumber(item.base_quantity),
        unitCost: asNumber(item.unit_cost),
        unitPrice: asNumber(item.unit_price),
        vatRate: asNumber(item.vat_rate),
        lineCost,
        lineTotal,
        lineProfit: roundMoney(lineTotal - lineCost),
        saleUnit: item.sale_unit,
        unitLabel: item.unit_label,
        source: item.source,
      }
    }),
    payments: (paymentsByInvoice.get(row.id) ?? []).map((payment) => ({
      paymentMethod: payment.payment_method,
      currencyCode: payment.currency_code,
      amountReceived: asNumber(payment.amount_received),
      amountReceivedIqd: asNumber(payment.amount_received_iqd),
      exchangeRate: asNumber(payment.exchange_rate),
    })),
    returns: returnsByInvoice.get(row.id) ?? [],
  }))
}

async function getLockedProduct(database: Queryable, productId: string) {
  const result = await database.query<ProductRow>(
    `
      select id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
      from app_products
      where id = $1
      for update
    `,
    [productId],
  )

  return result.rows[0] ?? null
}

async function insertPurchasedProduct(
  client: PoolClient,
  draft: NonNullable<CreatePurchaseReceiptInput['items'][number]['productDraft']>,
  entryUnit: CreatePurchaseReceiptInput['items'][number]['entryUnit'],
  unitCostIqd: number,
) {
  const productId = createId('prod')
  const input = buildPurchasedProductInput(draft, entryUnit, unitCostIqd)

  const result = await client.query<ProductRow>(
    `
      insert into app_products (
        id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      returning id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
    `,
    [
      productId,
      input.name,
      input.barcode,
      input.wholesaleBarcode ?? null,
      input.plu ?? null,
      input.department,
      input.measurementType,
      input.purchaseCostBasis,
      input.retailUnit,
      input.wholesaleUnit ?? null,
      input.wholesaleQuantity !== undefined ? roundQuantity(input.wholesaleQuantity) : null,
      input.retailPurchasePrice,
      input.wholesalePurchasePrice ?? null,
      input.retailSalePrice,
      input.wholesaleSalePrice ?? null,
      input.retailPurchasePrice,
      input.retailSalePrice,
      input.vatRate,
      0,
      0,
      input.measurementType === 'weight',
      input.retailUnit,
    ],
  )

  return result.rows[0]
}

async function loadPurchaseReceipts(database: Queryable, receiptIds?: string[]): Promise<StoredPurchaseReceipt[]> {
  const receiptsResult = receiptIds && receiptIds.length > 0
    ? await database.query<PurchaseReceiptRow>(
        `
          select id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes, created_at
          from app_purchase_receipts
          where id = any($1::text[])
          order by created_at desc
        `,
        [receiptIds],
      )
    : await database.query<PurchaseReceiptRow>(
        `
          select id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes, created_at
          from app_purchase_receipts
          order by created_at desc
        `,
      )

  if (receiptsResult.rows.length === 0) {
    return []
  }

  const ids = receiptsResult.rows.map((row) => row.id)
  const itemsResult = await database.query<PurchaseReceiptItemRow>(
    `
      select id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
      from app_purchase_receipt_items
      where receipt_id = any($1::text[])
      order by receipt_id asc, id asc
    `,
    [ids],
  )

  const itemsByReceipt = new Map<string, PurchaseReceiptItemRow[]>()
  for (const row of itemsResult.rows) {
    const current = itemsByReceipt.get(row.receipt_id) ?? []
    current.push(row)
    itemsByReceipt.set(row.receipt_id, current)
  }

  return receiptsResult.rows.map((row) => ({
    id: row.id,
    receiptNo: row.receipt_no,
    supplierId: row.supplier_id ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    purchaseDate: row.purchase_date ? toIsoString(row.purchase_date).slice(0, 10) : toIsoString(row.created_at).slice(0, 10),
    supplierInvoiceNo: row.supplier_invoice_no ?? undefined,
    currencyCode: row.currency_code,
    exchangeRate: asNumber(row.exchange_rate),
    totalCost: asNumber(row.total_cost),
    totalCostIqd: asNumber(row.total_cost_iqd),
    notes: row.notes ?? undefined,
    createdAt: toIsoString(row.created_at),
    items: (itemsByReceipt.get(row.id) ?? []).map((item) => ({
      productId: item.product_id,
      name: item.name,
      quantity: asNumber(item.quantity),
      baseQuantity: asNumber(item.base_quantity),
      entryUnit: item.entry_unit,
      entryUnitLabel: item.entry_unit_label,
      batchNo: item.batch_no ?? undefined,
      expiryDate: item.expiry_date ? toIsoString(item.expiry_date).slice(0, 10) : undefined,
      unitCost: asNumber(item.unit_cost),
      unitCostIqd: asNumber(item.unit_cost_iqd),
      lineTotal: asNumber(item.line_total),
      lineTotalIqd: asNumber(item.line_total_iqd),
    })),
  }))
}

function mapSupplierRow(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    currentBalance: asNumber(row.current_balance),
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
  }
}

function mapSupplierPaymentRow(row: SupplierPaymentRow): SupplierPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    currencyCode: row.currency_code,
    exchangeRate: asNumber(row.exchange_rate),
    amount: asNumber(row.amount),
    amountIqd: asNumber(row.amount_iqd),
    notes: row.notes ?? undefined,
    createdAt: toIsoString(row.created_at),
  }
}

function mapCustomerRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    currentBalance: asNumber(row.current_balance),
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
  }
}

function mapCustomerPaymentRow(row: CustomerPaymentRow): CustomerPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    customerId: row.customer_id,
    customerName: row.customer_name,
    currencyCode: row.currency_code,
    exchangeRate: asNumber(row.exchange_rate),
    amount: asNumber(row.amount),
    amountIqd: asNumber(row.amount_iqd),
    notes: row.notes ?? undefined,
    createdAt: toIsoString(row.created_at),
  }
}

async function getLockedSupplier(database: Queryable, supplierId: string) {
  const result = await database.query<SupplierRow>(
    `
      select id, name, phone, current_balance, is_active, created_at
      from app_suppliers
      where id = $1
      for update
    `,
    [supplierId],
  )

  return result.rows[0] ?? null
}

async function getLockedCustomer(database: Queryable, customerId: string) {
  const result = await database.query<CustomerRow>(
    `
      select id, name, phone, address, notes, current_balance, is_active, created_at
      from app_customers
      where id = $1
      for update
    `,
    [customerId],
  )

  return result.rows[0] ?? null
}

async function loadSupplierPayments(database: Queryable, supplierId: string): Promise<SupplierPayment[]> {
  const result = await database.query<SupplierPaymentRow>(
    `
      select id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd, notes, created_at
      from app_supplier_payments
      where supplier_id = $1
      order by created_at desc, payment_no desc
    `,
    [supplierId],
  )

  return result.rows.map(mapSupplierPaymentRow)
}

async function loadCustomerPayments(database: Queryable, customerId: string): Promise<CustomerPayment[]> {
  const result = await database.query<CustomerPaymentRow>(
    `
      select id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd, notes, created_at
      from app_customer_payments
      where customer_id = $1
      order by created_at desc, payment_no desc
    `,
    [customerId],
  )

  return result.rows.map(mapCustomerPaymentRow)
}

async function insertStockMovement(
  database: Queryable,
  input: Omit<StockMovement, 'createdAt'>,
) {
  await database.query(
    `
      insert into app_stock_movements (
        id, product_id, product_name, movement_type, quantity_delta, balance_after, note
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.id,
      input.productId,
      input.productName,
      input.movementType,
      input.quantityDelta,
      input.balanceAfter,
      input.note,
    ],
  )
}

function mapPostgresError(error: unknown, fallbackMessage: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  ) {
    const detail = 'detail' in error ? String((error as { detail?: string }).detail ?? '') : ''

    if (detail.includes('(barcode)')) {
      return new Error('الباركود مستخدم مسبقاً لصنف آخر.')
    }

    if (detail.includes('(wholesale_barcode)')) {
      return new Error('باركود الجملة مستخدم مسبقاً لصنف آخر.')
    }

    if (detail.includes('(plu)')) {
      return new Error('رمز PLU مستخدم مسبقاً لصنف آخر.')
    }
  }

  return error instanceof Error ? error : new Error(fallbackMessage)
}

async function generateInvoiceNo(client: PoolClient) {
  const today = new Date().toISOString().slice(0, 10)
  const sequenceResult = await client.query<{ value: number }>(
    `
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('invoice', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `,
    [today],
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0')

  return `POS-${year}${month}${day}-${serial}`
}

async function generatePurchaseReceiptNo(client: PoolClient) {
  const today = new Date().toISOString().slice(0, 10)
  const sequenceResult = await client.query<{ value: number }>(
    `
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('purchase', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `,
    [today],
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0')

  return `PUR-${year}${month}${day}-${serial}`
}

async function generateSupplierPaymentNo(client: PoolClient) {
  const today = new Date().toISOString().slice(0, 10)
  const sequenceResult = await client.query<{ value: number }>(
    `
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('supplier-payment', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `,
    [today],
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0')

  return `SUPPAY-${year}${month}${day}-${serial}`
}

async function generateCustomerPaymentNo(client: PoolClient) {
  const today = new Date().toISOString().slice(0, 10)
  const sequenceResult = await client.query<{ value: number }>(
    `
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('customer-payment', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `,
    [today],
  )

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0')

  return `CUSTPAY-${year}${month}${day}-${serial}`
}

export function createPostgresDataAccess(pool: Pool): DataAccess {
  return {
    products: {
      async listProducts() {
        const result = await pool.query<ProductRow>(
          `
            select id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            from app_products
            order by name asc
          `,
        )

        return result.rows.map(mapProductRow)
      },
      async listMovements() {
        const result = await pool.query<MovementRow>(
          `
            select id, product_id, product_name, movement_type, quantity_delta, balance_after, note, created_at
            from app_stock_movements
            order by created_at desc
            limit 500
          `,
        )

        return result.rows.map(mapMovementRow)
      },
      async adjustStock(input) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const product = await getLockedProduct(client, input.productId)

          if (!product) {
            throw new Error('الصنف المطلوب غير موجود.')
          }

          const nextBalance = roundQuantity(asNumber(product.stock_qty) + input.quantityDelta)

          if (nextBalance < 0) {
            throw new Error(`لا يمكن أن يصبح رصيد ${product.name} أقل من الصفر.`)
          }

          await client.query(
            'update app_products set stock_qty = $1, updated_at = now() where id = $2',
            [nextBalance, input.productId],
          )
          await insertStockMovement(client, {
            id: createId('movement'),
            productId: product.id,
            productName: product.name,
            movementType: 'adjustment',
            quantityDelta: roundQuantity(input.quantityDelta),
            balanceAfter: nextBalance,
            note: input.note,
          })
          await client.query('commit')

          return {
            ...mapProductRow(product),
            stockQty: nextBalance,
          }
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر تنفيذ تعديل المخزون.')
        } finally {
          client.release()
        }
      },
      async createProduct(input: ProductUpsertInput) {
        const productId = createId('prod')

        try {
          const result = await pool.query<ProductRow>(
            `
              insert into app_products (
                id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
              returning id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            `,
            [
              productId,
              input.name,
              input.barcode,
              input.wholesaleBarcode ?? null,
              input.plu ?? null,
              input.department,
              input.measurementType,
              input.purchaseCostBasis,
              input.retailUnit,
              input.wholesaleUnit ?? null,
              input.wholesaleQuantity !== undefined ? roundQuantity(input.wholesaleQuantity) : null,
              input.retailPurchasePrice,
              input.wholesalePurchasePrice ?? null,
              input.retailSalePrice,
              input.wholesaleSalePrice ?? null,
              input.retailPurchasePrice,
              input.retailSalePrice,
              input.vatRate,
              roundQuantity(input.stockQty),
              roundQuantity(input.minStock),
              input.measurementType === 'weight',
              input.retailUnit,
            ],
          )

          const product = mapProductRow(result.rows[0])

          if (product.stockQty > 0) {
            await insertStockMovement(pool, {
              id: createId('movement'),
              productId: product.id,
              productName: product.name,
              movementType: 'adjustment',
              quantityDelta: product.stockQty,
              balanceAfter: product.stockQty,
              note: 'رصيد افتتاحي عند إنشاء الصنف',
            })
          }

          return product
        } catch (error) {
          throw mapPostgresError(error, 'تعذر إنشاء الصنف.')
        }
      },
      async updateProduct(productId: string, input: ProductUpsertInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const current = await getLockedProduct(client, productId)

          if (!current) {
            throw new Error('الصنف المطلوب غير موجود.')
          }

          const nextStockQty = roundQuantity(input.stockQty)
          const stockDelta = roundQuantity(nextStockQty - asNumber(current.stock_qty))
          const result = await client.query<ProductRow>(
            `
              update app_products
              set
                name = $2,
                barcode = $3,
                wholesale_barcode = $4,
                plu = $5,
                department = $6,
                measurement_type = $7,
                purchase_cost_basis = $8,
                retail_unit = $9,
                wholesale_unit = $10,
                wholesale_quantity = $11,
                retail_purchase_price = $12,
                wholesale_purchase_price = $13,
                retail_sale_price = $14,
                wholesale_sale_price = $15,
                purchase_price = $12,
                unit_price = $14,
                vat_rate = $16,
                stock_qty = $17,
                min_stock = $18,
                sold_by_weight = $19,
                unit_label = $9,
                updated_at = now()
              where id = $1
              returning id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            `,
            [
              productId,
              input.name,
              input.barcode,
              input.wholesaleBarcode ?? null,
              input.plu ?? null,
              input.department,
              input.measurementType,
              input.purchaseCostBasis,
              input.retailUnit,
              input.wholesaleUnit ?? null,
              input.wholesaleQuantity !== undefined ? roundQuantity(input.wholesaleQuantity) : null,
              input.retailPurchasePrice,
              input.wholesalePurchasePrice ?? null,
              input.retailSalePrice,
              input.wholesaleSalePrice ?? null,
              input.vatRate,
              nextStockQty,
              roundQuantity(input.minStock),
              input.measurementType === 'weight',
            ],
          )

          if (stockDelta !== 0) {
            await insertStockMovement(client, {
              id: createId('movement'),
              productId,
              productName: input.name,
              movementType: 'adjustment',
              quantityDelta: stockDelta,
              balanceAfter: nextStockQty,
              note: 'تعديل بيانات الصنف وتحديث الرصيد',
            })
          }

          await client.query('commit')
          return mapProductRow(result.rows[0])
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw mapPostgresError(error, 'تعذر تعديل الصنف.')
        } finally {
          client.release()
        }
      },
      async deleteProduct(productId: string) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const current = await getLockedProduct(client, productId)

          if (!current) {
            throw new Error('الصنف المطلوب غير موجود.')
          }

          if (asNumber(current.stock_qty) > 0) {
            throw new Error('لا يمكن حذف صنف لا يزال لديه رصيد مخزني. صفّر الرصيد أولاً.')
          }

          await client.query('delete from app_products where id = $1', [productId])
          await client.query('commit')

          return mapProductRow(current)
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر حذف الصنف.')
        } finally {
          client.release()
        }
      },
    },
    purchases: {
      async listReceipts() {
        return loadPurchaseReceipts(pool)
      },
      async createReceipt(input: CreatePurchaseReceiptInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const receiptId = createId('purchase')
          const receiptNo = await generatePurchaseReceiptNo(client)
          const normalizedItems: StoredPurchaseReceipt['items'] = []
          const supplier = input.supplierId ? await getLockedSupplier(client, input.supplierId) : null
          const purchaseDateLabel = input.purchaseDate || new Date().toISOString().slice(0, 10)
          const supplierInvoiceLabel = input.supplierInvoiceNo?.trim()

          if (input.supplierId && !supplier) {
            throw new Error('المورد المحدد غير موجود.')
          }

          for (const item of input.items) {
            const draft = item.productDraft ?? null
            let product = item.productId ? await getLockedProduct(client, item.productId) : null

            if (!product && draft) {
              product = await insertPurchasedProduct(client, draft, item.entryUnit, input.currencyCode === 'USD'
                ? roundMoney(item.unitCost * input.exchangeRate)
                : roundMoney(item.unitCost))
            }

            if (!product) {
              throw new Error('أحد الأصناف المختارة غير موجود في الكتالوج.')
            }

            const wholesaleQuantity = asNumber(product.wholesale_quantity ?? 1)
            const isWholesaleEntry = item.entryUnit === 'wholesale' && Boolean(product.wholesale_unit) && wholesaleQuantity > 0
            const baseQuantity = roundQuantity(item.quantity * (isWholesaleEntry ? wholesaleQuantity : 1))
            const unitCostIqd = input.currencyCode === 'USD'
              ? roundMoney(item.unitCost * input.exchangeRate)
              : roundMoney(item.unitCost)
            const retailUnitCostIqd = roundMoney(unitCostIqd / (isWholesaleEntry ? wholesaleQuantity : 1))
            const wholesaleUnitCostIqd = product.wholesale_unit && wholesaleQuantity > 0
              ? (isWholesaleEntry ? roundMoney(unitCostIqd) : roundMoney(retailUnitCostIqd * wholesaleQuantity))
              : undefined
            const nextStock = roundQuantity(asNumber(product.stock_qty) + baseQuantity)
            const supplierLabel = supplier?.name ?? input.supplierName
            const movementNote = [
              supplierLabel ? `استلام شراء من ${supplierLabel}` : 'استلام شراء',
              `بتاريخ ${purchaseDateLabel}`,
              supplierInvoiceLabel ? `قائمة ${supplierInvoiceLabel}` : null,
            ].filter(Boolean).join(' | ')

            await client.query(
              `
                update app_products
                set stock_qty = $1,
                    purchase_price = $2,
                    retail_purchase_price = $2,
                    wholesale_purchase_price = case when $3::numeric is null then wholesale_purchase_price else $3 end,
                    updated_at = now()
                where id = $4
              `,
              [nextStock, retailUnitCostIqd, wholesaleUnitCostIqd ?? null, product.id],
            )
            await insertStockMovement(client, {
              id: createId('movement'),
              productId: product.id,
              productName: product.name,
              movementType: 'purchase',
              quantityDelta: baseQuantity,
              balanceAfter: nextStock,
              note: movementNote,
            })

            normalizedItems.push({
              productId: product.id,
              name: product.name,
              quantity: item.quantity,
              baseQuantity,
              entryUnit: item.entryUnit,
              entryUnitLabel: isWholesaleEntry ? product.wholesale_unit ?? product.retail_unit ?? product.unit_label : product.retail_unit ?? product.unit_label,
              unitCost: roundMoney(item.unitCost),
              unitCostIqd,
              lineTotal: roundMoney(item.quantity * item.unitCost),
              lineTotalIqd: roundMoney(item.quantity * unitCostIqd),
              batchNo: item.batchNo?.trim() || undefined,
              expiryDate: item.expiryDate?.trim() || undefined,
            })
          }

          const totalCost = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0))
          const totalCostIqd = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotalIqd, 0))

          if (supplier) {
            await client.query(
              'update app_suppliers set current_balance = $1 where id = $2',
              [roundMoney(asNumber(supplier.current_balance) + totalCostIqd), supplier.id],
            )
          }

          await client.query(
            `
              insert into app_purchase_receipts (
                id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `,
            [
              receiptId,
              receiptNo,
              supplier?.id ?? input.supplierId ?? null,
              (supplier?.name ?? input.supplierName) || null,
              purchaseDateLabel,
              supplierInvoiceLabel || null,
              input.currencyCode,
              input.exchangeRate,
              totalCost,
              totalCostIqd,
              input.notes || null,
            ],
          )

          for (const item of normalizedItems) {
            await client.query(
              `
                insert into app_purchase_receipt_items (
                  id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
                )
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              `,
              [
                createId('purchase-item'),
                receiptId,
                item.productId,
                item.name,
                item.quantity,
                item.baseQuantity,
                item.entryUnit,
                item.entryUnitLabel,
                item.batchNo ?? null,
                item.expiryDate ?? null,
                item.unitCost,
                item.unitCostIqd,
                item.lineTotal,
                item.lineTotalIqd,
              ],
            )
          }

          await client.query('commit')
          const [receipt] = await loadPurchaseReceipts(pool, [receiptId])

          if (!receipt) {
            throw new Error('تعذر تحميل سند الاستلام بعد الحفظ.')
          }

          return receipt
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw mapPostgresError(error, 'تعذر حفظ سند الشراء.')
        } finally {
          client.release()
        }
      },
    },
    customers: {
      async listCustomers() {
        const result = await pool.query<CustomerRow>(
          `
            select id, name, phone, address, notes, current_balance, is_active, created_at
            from app_customers
            order by name asc
          `,
        )

        return result.rows.map(mapCustomerRow)
      },
      async listPayments(customerId) {
        const customer = await pool.query<{ id: string }>('select id from app_customers where id = $1', [customerId])

        if (!customer.rows[0]) {
          throw new Error('العميل المطلوب غير موجود.')
        }

        return loadCustomerPayments(pool, customerId)
      },
      async createCustomer(input) {
        try {
          const result = await pool.query<CustomerRow>(
            `
              insert into app_customers (id, name, phone, address, notes, current_balance, is_active)
              values ($1, $2, $3, $4, $5, 0, true)
              returning id, name, phone, address, notes, current_balance, is_active, created_at
            `,
            [createId('cust'), input.name, input.phone ?? null, input.address ?? null, input.notes ?? null],
          )

          return mapCustomerRow(result.rows[0])
        } catch (error) {
          throw mapPostgresError(error, 'تعذر إنشاء العميل.')
        }
      },
      async updateCustomer(customerId, input) {
        try {
          const result = await pool.query<CustomerRow>(
            `
              update app_customers
              set name = $2, phone = $3, address = $4, notes = $5
              where id = $1
              returning id, name, phone, address, notes, current_balance, is_active, created_at
            `,
            [customerId, input.name, input.phone ?? null, input.address ?? null, input.notes ?? null],
          )

          if (!result.rows[0]) {
            throw new Error('العميل المطلوب غير موجود.')
          }

          return mapCustomerRow(result.rows[0])
        } catch (error) {
          throw mapPostgresError(error, 'تعذر تعديل العميل.')
        }
      },
      async createPayment(customerId, input: CustomerPaymentInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const customer = await getLockedCustomer(client, customerId)

          if (!customer) {
            throw new Error('العميل المطلوب غير موجود.')
          }

          const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount)
          const currentBalance = asNumber(customer.current_balance)

          if (amountIqd - currentBalance > 0.01) {
            throw new Error('قيمة التسديد تتجاوز الرصيد المستحق على العميل.')
          }

          const paymentNo = await generateCustomerPaymentNo(client)
          const paymentId = createId('cust-pay')

          await client.query(
            `
              insert into app_customer_payments (
                id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              paymentId,
              paymentNo,
              customer.id,
              customer.name,
              input.currencyCode,
              input.exchangeRate,
              roundMoney(input.amount),
              amountIqd,
              input.notes ?? null,
            ],
          )

          await client.query(
            'update app_customers set current_balance = $1 where id = $2',
            [roundMoney(currentBalance - amountIqd), customer.id],
          )

          await client.query('commit')

          const paymentResult = await pool.query<CustomerPaymentRow>(
            `
              select id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd, notes, created_at
              from app_customer_payments
              where id = $1
            `,
            [paymentId],
          )

          if (!paymentResult.rows[0]) {
            throw new Error('تعذر تحميل تسديد العميل بعد الحفظ.')
          }

          return mapCustomerPaymentRow(paymentResult.rows[0])
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر تسجيل تسديد العميل.')
        } finally {
          client.release()
        }
      },
      async deleteCustomer(customerId) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const customer = await getLockedCustomer(client, customerId)

          if (!customer) {
            throw new Error('العميل المطلوب غير موجود.')
          }

          if (Math.abs(asNumber(customer.current_balance)) > 0.01) {
            throw new Error('لا يمكن حذف عميل لديه رصيد قائم.')
          }

          await client.query('delete from app_customers where id = $1', [customerId])
          await client.query('commit')

          return mapCustomerRow(customer)
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر حذف العميل.')
        } finally {
          client.release()
        }
      },
    },
    suppliers: {
      async listSuppliers() {
        const result = await pool.query<SupplierRow>(
          `
            select id, name, phone, current_balance, is_active, created_at
            from app_suppliers
            order by name asc
          `,
        )

        return result.rows.map(mapSupplierRow)
      },
      async listPayments(supplierId) {
        const supplier = await pool.query<{ id: string }>('select id from app_suppliers where id = $1', [supplierId])

        if (!supplier.rows[0]) {
          throw new Error('المورد المطلوب غير موجود.')
        }

        return loadSupplierPayments(pool, supplierId)
      },
      async createSupplier(input) {
        try {
          const result = await pool.query<SupplierRow>(
            `
              insert into app_suppliers (id, name, phone, current_balance, is_active)
              values ($1, $2, $3, 0, true)
              returning id, name, phone, current_balance, is_active, created_at
            `,
            [createId('supp'), input.name, input.phone ?? null],
          )

          return mapSupplierRow(result.rows[0])
        } catch (error) {
          throw mapPostgresError(error, 'تعذر إنشاء المورد.')
        }
      },
      async updateSupplier(supplierId, input) {
        try {
          const result = await pool.query<SupplierRow>(
            `
              update app_suppliers
              set name = $2, phone = $3
              where id = $1
              returning id, name, phone, current_balance, is_active, created_at
            `,
            [supplierId, input.name, input.phone ?? null],
          )

          if (!result.rows[0]) {
            throw new Error('المورد المطلوب غير موجود.')
          }

          return mapSupplierRow(result.rows[0])
        } catch (error) {
          throw mapPostgresError(error, 'تعذر تعديل المورد.')
        }
      },
      async createPayment(supplierId, input: SupplierPaymentInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const supplier = await getLockedSupplier(client, supplierId)

          if (!supplier) {
            throw new Error('المورد المطلوب غير موجود.')
          }

          const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount)
          const currentBalance = asNumber(supplier.current_balance)

          if (amountIqd - currentBalance > 0.01) {
            throw new Error('قيمة الدفعة تتجاوز الرصيد المستحق على المورد.')
          }

          const paymentNo = await generateSupplierPaymentNo(client)
          const paymentId = createId('supp-pay')

          await client.query(
            `
              insert into app_supplier_payments (
                id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              paymentId,
              paymentNo,
              supplier.id,
              supplier.name,
              input.currencyCode,
              input.exchangeRate,
              roundMoney(input.amount),
              amountIqd,
              input.notes ?? null,
            ],
          )

          await client.query(
            'update app_suppliers set current_balance = $1 where id = $2',
            [roundMoney(currentBalance - amountIqd), supplier.id],
          )

          await client.query('commit')

          const paymentResult = await pool.query<SupplierPaymentRow>(
            `
              select id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd, notes, created_at
              from app_supplier_payments
              where id = $1
            `,
            [paymentId],
          )

          if (!paymentResult.rows[0]) {
            throw new Error('تعذر تحميل دفعة المورد بعد الحفظ.')
          }

          return mapSupplierPaymentRow(paymentResult.rows[0])
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر تسجيل دفعة المورد.')
        } finally {
          client.release()
        }
      },
      async deleteSupplier(supplierId) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const supplier = await getLockedSupplier(client, supplierId)

          if (!supplier) {
            throw new Error('المورد المطلوب غير موجود.')
          }

          if (Math.abs(asNumber(supplier.current_balance)) > 0.01) {
            throw new Error('لا يمكن حذف مورد لديه رصيد قائم.')
          }

          await client.query('delete from app_suppliers where id = $1', [supplierId])
          await client.query('commit')

          return mapSupplierRow(supplier)
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر حذف المورد.')
        } finally {
          client.release()
        }
      },
    },
    sales: {
      async listInvoices() {
        return loadInvoices(pool)
      },
      async createInvoice(input: CreateSaleInvoiceInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const customer = input.customerId ? await getLockedCustomer(client, input.customerId) : null
          const paidIqd = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0))
          const remainingAmountIqd = roundMoney(Math.max(0, input.totalAmount - paidIqd))

          if (input.customerId && !customer) {
            throw new Error('العميل المحدد غير موجود.')
          }

          if ((input.paymentType === 'credit' || input.paymentType === 'partial') && !customer && !input.customerName) {
            throw new Error('حدد العميل أو أدخل اسمه قبل حفظ فاتورة الآجل.')
          }

          for (const item of input.items) {
            const product = await getLockedProduct(client, item.productId)

            if (!product) {
              throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`)
            }

            const currentStock = roundQuantity(asNumber(product.stock_qty))

            if (roundQuantity(item.baseQuantity) > currentStock) {
              throw new Error(`الكمية المطلوبة من ${item.name} تتجاوز الرصيد المتاح حالياً.`)
            }
          }

          const invoiceId = createId('sale')
          const invoiceNo = await generateInvoiceNo(client)

          await client.query(
            `
              insert into app_sale_invoices (
                id, invoice_no, payment_status, payment_type, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `,
            [
              invoiceId,
              invoiceNo,
              remainingAmountIqd <= 0.01 ? 'paid' : paidIqd > 0 ? 'partial' : 'credit',
              input.paymentType,
              customer?.id ?? input.customerId ?? null,
              customer?.name ?? input.customerName ?? null,
              input.currencyCode,
              input.exchangeRate,
              input.subtotal,
              input.vatAmount,
              input.totalAmount,
              paidIqd,
              remainingAmountIqd,
              input.notes ?? null,
            ],
          )

          if (customer && remainingAmountIqd > 0.01) {
            await client.query(
              'update app_customers set current_balance = $1 where id = $2',
              [roundMoney(asNumber(customer.current_balance) + remainingAmountIqd), customer.id],
            )
          }

          for (const item of input.items) {
            const product = await getLockedProduct(client, item.productId)

            if (!product) {
              throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`)
            }

            const nextStock = roundQuantity(asNumber(product.stock_qty) - item.baseQuantity)

            await client.query('update app_products set stock_qty = $1, updated_at = now() where id = $2', [nextStock, item.productId])
            await insertStockMovement(client, {
              id: createId('movement'),
              productId: item.productId,
              productName: item.name,
              movementType: 'sale',
              quantityDelta: roundQuantity(-item.baseQuantity),
              balanceAfter: nextStock,
              note: `خصم بيع عبر POS للصنف ${item.name}`,
            })
            await client.query(
              `
                insert into app_sale_invoice_items (
                  id, invoice_id, product_id, name, barcode, quantity, base_quantity, unit_cost, unit_price, vat_rate, line_cost, line_total, sale_unit, unit_label, source
                )
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              `,
              [
                createId('sale-item'),
                invoiceId,
                item.productId,
                item.name,
                item.barcode,
                item.quantity,
                item.baseQuantity,
                asNumber(product.purchase_price),
                item.unitPrice,
                item.vatRate,
                roundMoney(asNumber(product.purchase_price) * item.baseQuantity),
                item.lineTotal,
                item.saleUnit,
                item.unitLabel,
                item.source,
              ],
            )
          }

          for (const payment of input.payments) {
            await client.query(
              `
                insert into app_sale_invoice_payments (
                  id, invoice_id, payment_method, currency_code, amount_received, amount_received_iqd, exchange_rate
                )
                values ($1, $2, $3, $4, $5, $6, $7)
              `,
              [
                createId('payment'),
                invoiceId,
                payment.paymentMethod,
                payment.currencyCode,
                payment.amountReceived,
                payment.amountReceivedIqd,
                payment.exchangeRate,
              ],
            )
          }

          await client.query('commit')
          const [invoice] = await loadInvoices(pool, [invoiceId])

          if (!invoice) {
            throw new Error('تعذر تحميل الفاتورة بعد الحفظ.')
          }

          return invoice
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر حفظ الفاتورة.')
        } finally {
          client.release()
        }
      },
      async createReturn(invoiceId: string, input: CreateSaleReturnInput) {
        const client = await pool.connect()

        try {
          await client.query('begin')
          const invoices = await loadInvoices(client, [invoiceId])
          const invoice = invoices[0]

          if (!invoice) {
            throw new Error('الفاتورة المطلوبة غير موجودة.')
          }

          for (const returnItem of input.items) {
            const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId)

            if (!soldItem) {
              throw new Error('لا يمكن إرجاع صنف غير موجود في الفاتورة الأصلية.')
            }

            const alreadyReturned = invoice.returns.reduce((sum, saleReturn) => {
              const existing = saleReturn.items.find((item) => item.invoiceItemId === returnItem.invoiceItemId)
              return sum + (existing?.quantity ?? 0)
            }, 0)
            const remainingQty = roundMoney(soldItem.quantity - alreadyReturned)

            if (returnItem.quantity - remainingQty > 0.001) {
              throw new Error(`كمية المرتجع للصنف ${soldItem.name} تتجاوز الكمية المتبقية القابلة للإرجاع.`)
            }
          }

          const saleReturnId = createId('return')
          await client.query(
            'insert into app_sale_returns (id, invoice_id, reason) values ($1, $2, $3)',
            [saleReturnId, invoiceId, input.reason],
          )

          for (const returnItem of input.items) {
            const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId)
            const product = await getLockedProduct(client, soldItem?.productId ?? '')

            if (!product || !soldItem) {
              throw new Error('تعذر استعادة مخزون أحد الأصناف في المرتجع.')
            }

            const retailPerSaleUnit = (soldItem.baseQuantity || soldItem.quantity) / soldItem.quantity
            const restoredBaseQuantity = roundQuantity(returnItem.quantity * retailPerSaleUnit)
            const nextStock = roundQuantity(asNumber(product.stock_qty) + restoredBaseQuantity)

            await client.query('update app_products set stock_qty = $1, updated_at = now() where id = $2', [nextStock, soldItem.productId])
            await insertStockMovement(client, {
              id: createId('movement'),
              productId: soldItem.productId,
              productName: soldItem.name,
              movementType: 'return',
              quantityDelta: restoredBaseQuantity,
              balanceAfter: nextStock,
              note: `مرتجع مبيعات: ${input.reason}`,
            })
            await client.query(
              'insert into app_sale_return_items (id, sale_return_id, invoice_item_id, product_id, quantity) values ($1, $2, $3, $4, $5)',
              [createId('return-item'), saleReturnId, soldItem.id, soldItem.productId, returnItem.quantity],
            )
          }

          await client.query('commit')
          const [updatedInvoice] = await loadInvoices(pool, [invoiceId])

          if (!updatedInvoice) {
            throw new Error('تعذر تحميل الفاتورة بعد حفظ المرتجع.')
          }

          return updatedInvoice
        } catch (error) {
          await client.query('rollback').catch(() => undefined)
          throw error instanceof Error ? error : new Error('تعذر تنفيذ مرتجع المبيعات.')
        } finally {
          client.release()
        }
      },
    },
  }
}