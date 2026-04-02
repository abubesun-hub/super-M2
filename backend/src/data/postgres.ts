import { Pool } from 'pg'
import { listCatalogProducts } from '../modules/products/store.js'
import { env } from '../config/env.js'

const bootstrapStatements = [
  `
    create table if not exists app_products (
      id text primary key,
      name text not null,
      barcode text not null unique,
      wholesale_barcode text unique,
      plu text unique,
      department text not null,
      measurement_type text not null default 'unit',
      purchase_cost_basis text not null default 'retail',
      retail_unit text not null default 'قطعة',
      wholesale_unit text,
      wholesale_quantity numeric(12,3),
      retail_purchase_price numeric(12,2) not null default 0,
      wholesale_purchase_price numeric(12,2),
      retail_sale_price numeric(12,2) not null default 0,
      wholesale_sale_price numeric(12,2),
      purchase_price numeric(12,2) not null default 0,
      unit_price numeric(12,2) not null,
      vat_rate numeric(6,4) not null,
      stock_qty numeric(12,3) not null,
      min_stock numeric(12,3) not null,
      sold_by_weight boolean not null default false,
      unit_label text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_products_stock on app_products(stock_qty, min_stock)`,
  `alter table app_products add column if not exists wholesale_barcode text`,
  `create unique index if not exists idx_app_products_wholesale_barcode_unique on app_products(wholesale_barcode) where wholesale_barcode is not null`,
  `alter table app_products add column if not exists purchase_price numeric(12,2) not null default 0`,
  `alter table app_products add column if not exists measurement_type text`,
  `alter table app_products add column if not exists purchase_cost_basis text`,
  `alter table app_products add column if not exists retail_unit text`,
  `alter table app_products add column if not exists wholesale_unit text`,
  `alter table app_products add column if not exists wholesale_quantity numeric(12,3)`,
  `alter table app_products add column if not exists retail_purchase_price numeric(12,2)`,
  `alter table app_products add column if not exists wholesale_purchase_price numeric(12,2)`,
  `alter table app_products add column if not exists retail_sale_price numeric(12,2)`,
  `alter table app_products add column if not exists wholesale_sale_price numeric(12,2)`,
  `update app_products set measurement_type = case when sold_by_weight then 'weight' else 'unit' end where measurement_type is null`,
  `update app_products set purchase_cost_basis = 'retail' where purchase_cost_basis is null`,
  `update app_products set retail_unit = unit_label where retail_unit is null`,
  `update app_products set retail_purchase_price = purchase_price where retail_purchase_price is null`,
  `update app_products set retail_sale_price = unit_price where retail_sale_price is null`,
  `
    create table if not exists app_suppliers (
      id text primary key,
      name text not null unique,
      phone text,
      current_balance numeric(12,2) not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_suppliers_name on app_suppliers(name asc)`,
  `
    create table if not exists app_customers (
      id text primary key,
      name text not null unique,
      phone text,
      address text,
      notes text,
      current_balance numeric(12,2) not null default 0,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_customers_name on app_customers(name asc)`,
  `
    create table if not exists app_customer_payments (
      id text primary key,
      payment_no text not null unique,
      customer_id text not null references app_customers(id) on delete cascade,
      customer_name text not null,
      currency_code text not null,
      exchange_rate numeric(12,4) not null,
      amount numeric(12,2) not null,
      amount_iqd numeric(12,2) not null,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_customer_payments_customer on app_customer_payments(customer_id, created_at desc)`,
  `
    create table if not exists app_supplier_payments (
      id text primary key,
      payment_no text not null unique,
      supplier_id text not null references app_suppliers(id) on delete cascade,
      supplier_name text not null,
      currency_code text not null,
      exchange_rate numeric(12,4) not null,
      amount numeric(12,2) not null,
      amount_iqd numeric(12,2) not null,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_supplier_payments_supplier on app_supplier_payments(supplier_id, created_at desc)`,
  `
    create table if not exists app_stock_movements (
      id text primary key,
      product_id text not null references app_products(id) on delete cascade,
      product_name text not null,
      movement_type text not null,
      quantity_delta numeric(12,3) not null,
      balance_after numeric(12,3) not null,
      note text not null,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_stock_movements_created_at on app_stock_movements(created_at desc)`,
  `
    create table if not exists app_sale_invoices (
      id text primary key,
      invoice_no text not null unique,
      payment_status text not null,
      payment_type text not null default 'cash',
      customer_id text references app_customers(id) on delete set null,
      customer_name text,
      currency_code text not null,
      exchange_rate numeric(12,4) not null,
      subtotal numeric(12,2) not null,
      vat_amount numeric(12,2) not null,
      total_amount numeric(12,2) not null,
      amount_paid_iqd numeric(12,2) not null default 0,
      remaining_amount_iqd numeric(12,2) not null default 0,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_sale_invoices_created_at on app_sale_invoices(created_at desc)`,
  `alter table app_sale_invoices add column if not exists payment_type text not null default 'cash'`,
  `alter table app_sale_invoices add column if not exists customer_id text references app_customers(id) on delete set null`,
  `alter table app_sale_invoices add column if not exists customer_name text`,
  `alter table app_sale_invoices add column if not exists amount_paid_iqd numeric(12,2) not null default 0`,
  `alter table app_sale_invoices add column if not exists remaining_amount_iqd numeric(12,2) not null default 0`,
  `update app_sale_invoices set payment_type = case when payment_status = 'paid' then 'cash' else 'credit' end where payment_type is null or payment_type = ''`,
  `update app_sale_invoices set amount_paid_iqd = total_amount where amount_paid_iqd = 0 and payment_status = 'paid'`,
  `update app_sale_invoices set remaining_amount_iqd = greatest(total_amount - amount_paid_iqd, 0) where remaining_amount_iqd = 0`,
  `
    create table if not exists app_sale_invoice_items (
      id text primary key,
      invoice_id text not null references app_sale_invoices(id) on delete cascade,
      product_id text not null,
      name text not null,
      barcode text not null,
      quantity numeric(12,3) not null,
      base_quantity numeric(12,3) not null default 0,
      unit_cost numeric(12,2) not null default 0,
      unit_price numeric(12,2) not null,
      vat_rate numeric(6,4) not null,
      line_cost numeric(12,2) not null default 0,
      line_total numeric(12,2) not null,
      sale_unit text not null default 'retail',
      unit_label text not null default 'قطعة',
      source text not null
    )
  `,
  `alter table app_sale_invoice_items add column if not exists base_quantity numeric(12,3) not null default 0`,
  `alter table app_sale_invoice_items add column if not exists unit_cost numeric(12,2) not null default 0`,
  `alter table app_sale_invoice_items add column if not exists line_cost numeric(12,2) not null default 0`,
  `alter table app_sale_invoice_items add column if not exists sale_unit text not null default 'retail'`,
  `alter table app_sale_invoice_items add column if not exists unit_label text not null default 'قطعة'`,
  `update app_sale_invoice_items set base_quantity = quantity where base_quantity = 0`,
  `create index if not exists idx_app_sale_invoice_items_invoice on app_sale_invoice_items(invoice_id)`,
  `
    create table if not exists app_sale_invoice_payments (
      id text primary key,
      invoice_id text not null references app_sale_invoices(id) on delete cascade,
      payment_method text not null,
      currency_code text not null,
      amount_received numeric(12,2) not null,
      amount_received_iqd numeric(12,2) not null,
      exchange_rate numeric(12,4) not null
    )
  `,
  `create index if not exists idx_app_sale_invoice_payments_invoice on app_sale_invoice_payments(invoice_id)`,
  `
    create table if not exists app_sale_returns (
      id text primary key,
      invoice_id text not null references app_sale_invoices(id) on delete cascade,
      reason text not null,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_sale_returns_invoice on app_sale_returns(invoice_id, created_at desc)`,
  `
    create table if not exists app_purchase_receipts (
      id text primary key,
      receipt_no text not null unique,
      supplier_id text references app_suppliers(id),
      supplier_name text,
      purchase_date date,
      supplier_invoice_no text,
      currency_code text not null,
      exchange_rate numeric(12,4) not null,
      total_cost numeric(12,2) not null,
      total_cost_iqd numeric(12,2) not null,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
  `create index if not exists idx_app_purchase_receipts_created_at on app_purchase_receipts(created_at desc)`,
  `alter table app_purchase_receipts add column if not exists supplier_id text references app_suppliers(id)`,
  `alter table app_purchase_receipts add column if not exists purchase_date date`,
  `alter table app_purchase_receipts add column if not exists supplier_invoice_no text`,
  `
    create table if not exists app_purchase_receipt_items (
      id text primary key,
      receipt_id text not null references app_purchase_receipts(id) on delete cascade,
      product_id text not null,
      name text not null,
      quantity numeric(12,3) not null,
      base_quantity numeric(12,3) not null default 0,
      entry_unit text not null default 'retail',
      entry_unit_label text not null default 'قطعة',
      batch_no text,
      expiry_date date,
      unit_cost numeric(12,2) not null,
      unit_cost_iqd numeric(12,2) not null,
      line_total numeric(12,2) not null,
      line_total_iqd numeric(12,2) not null
    )
  `,
  `alter table app_purchase_receipt_items add column if not exists base_quantity numeric(12,3) not null default 0`,
  `alter table app_purchase_receipt_items add column if not exists entry_unit text not null default 'retail'`,
  `alter table app_purchase_receipt_items add column if not exists entry_unit_label text not null default 'قطعة'`,
  `alter table app_purchase_receipt_items add column if not exists batch_no text`,
  `alter table app_purchase_receipt_items add column if not exists expiry_date date`,
  `update app_purchase_receipt_items set base_quantity = quantity where base_quantity = 0`,
  `create index if not exists idx_app_purchase_receipt_items_receipt on app_purchase_receipt_items(receipt_id)`,
  `
    create table if not exists app_sale_return_items (
      id text primary key,
      sale_return_id text not null references app_sale_returns(id) on delete cascade,
      invoice_item_id text references app_sale_invoice_items(id) on delete cascade,
      product_id text not null,
      quantity numeric(12,3) not null
    )
  `,
  `alter table app_sale_return_items add column if not exists invoice_item_id text references app_sale_invoice_items(id) on delete cascade`,
  `create index if not exists idx_app_sale_return_items_return on app_sale_return_items(sale_return_id)`,
  `
    create table if not exists app_daily_sequences (
      seq_key text not null,
      seq_date date not null,
      value integer not null default 0,
      primary key (seq_key, seq_date)
    )
  `,
]

let pool: Pool | null = null

export async function initializePostgresPool() {
  if (!env.DATABASE_URL) {
    return null
  }

  if (pool) {
    return pool
  }

  const createdPool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  })

  try {
    await createdPool.query('select 1')

    for (const statement of bootstrapStatements) {
      await createdPool.query(statement)
    }

    const existingProducts = await createdPool.query<{ count: string }>('select count(*)::text as count from app_products')

    if (Number(existingProducts.rows[0]?.count ?? '0') === 0) {
      const seedProducts = listCatalogProducts()

      for (const product of seedProducts) {
        await createdPool.query(
          `
            insert into app_products (
              id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `,
          [
            product.id,
            product.name,
            product.barcode,
            product.wholesaleBarcode ?? null,
            product.plu ?? null,
            product.department,
            product.measurementType,
            product.purchaseCostBasis,
            product.retailUnit,
            product.wholesaleUnit ?? null,
            product.wholesaleQuantity ?? null,
            product.retailPurchasePrice,
            product.wholesalePurchasePrice ?? null,
            product.retailSalePrice,
            product.wholesaleSalePrice ?? null,
            product.purchasePrice,
            product.unitPrice,
            product.vatRate,
            product.stockQty,
            product.minStock,
            product.soldByWeight ?? false,
            product.unitLabel,
          ],
        )
      }
    }

    const existingSuppliers = await createdPool.query<{ count: string }>('select count(*)::text as count from app_suppliers')

    if (Number(existingSuppliers.rows[0]?.count ?? '0') === 0) {
      await createdPool.query(
        `
          insert into app_suppliers (id, name, phone, current_balance, is_active)
          values
            ('supp-nahrain', 'شركة النهرين للتجهيز', '07700000001', 0, true),
            ('supp-baghdad-foods', 'بغداد فودز', '07700000002', 0, true)
          on conflict (id) do nothing
        `,
      )
    }

    pool = createdPool
    return pool
  } catch (error) {
    await createdPool.end().catch(() => undefined)
    throw error
  }
}

export function getPostgresPool() {
  if (!pool) {
    throw new Error('اتصال PostgreSQL غير مهيأ.')
  }

  return pool
}