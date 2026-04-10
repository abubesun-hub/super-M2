import { Pool } from 'pg';
import { listCatalogProducts } from '../modules/products/store.js';
import { env } from '../config/env.js';
const bootstrapStatements = [
    `
    create table if not exists app_products (
      id text primary key,
      name text not null,
      product_family_name text,
      variant_label text,
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
    `alter table app_products add column if not exists product_family_name text`,
    `alter table app_products add column if not exists variant_label text`,
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
    `update app_products set product_family_name = name where product_family_name is null`,
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
    create table if not exists app_employees (
      id text primary key,
      employee_no text not null unique,
      username text unique,
      name text not null,
      role text not null,
      start_date date,
      monthly_salary_iqd numeric(12,2),
      employment_status text not null default 'active',
      service_end_date date,
      payroll_type text,
      payroll_rate_iqd numeric(12,2),
      pin_hash text not null,
      notes text,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_employees_name on app_employees(name asc)`,
    `alter table app_employees add column if not exists username text`,
    `alter table app_employees add column if not exists start_date date`,
    `alter table app_employees add column if not exists monthly_salary_iqd numeric(12,2)`,
    `alter table app_employees add column if not exists employment_status text not null default 'active'`,
    `alter table app_employees add column if not exists service_end_date date`,
    `alter table app_employees add column if not exists payroll_type text`,
    `alter table app_employees add column if not exists payroll_rate_iqd numeric(12,2)`,
    `create unique index if not exists idx_app_employees_username_unique on app_employees(lower(username)) where username is not null`,
    `
    create table if not exists app_employee_compensations (
      id text primary key,
      payment_no text not null unique,
      employee_id text not null references app_employees(id),
      employee_name text not null,
      kind text not null,
      amount_iqd numeric(12,2) not null,
      calculation_method text not null default 'manual',
      unit_rate_iqd numeric(12,2),
      quantity numeric(12,2),
      payment_method text,
      payment_date date not null,
      period_label text,
      notes text,
      created_by_employee_id text not null references app_employees(id),
      created_by_employee_name text not null,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_employee_compensations_employee_date on app_employee_compensations(employee_id, payment_date desc, created_at desc)`,
    `alter table app_employee_compensations add column if not exists calculation_method text not null default 'manual'`,
    `alter table app_employee_compensations add column if not exists unit_rate_iqd numeric(12,2)`,
    `alter table app_employee_compensations add column if not exists quantity numeric(12,2)`,
    `alter table app_employee_compensations alter column payment_method drop not null`,
    `
    create table if not exists app_employee_absences (
      id text primary key,
      employee_id text not null references app_employees(id),
      employee_name text not null,
      absence_date date not null,
      deduction_days numeric(8,2) not null,
      notes text,
      created_by_employee_id text not null references app_employees(id),
      created_by_employee_name text not null,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_employee_absences_employee_date on app_employee_absences(employee_id, absence_date desc, created_at desc)`,
    `
    create table if not exists app_cashier_shifts (
      id text primary key,
      shift_no text not null unique,
      employee_id text not null references app_employees(id),
      employee_name text not null,
      terminal_name text not null,
      opening_float_iqd numeric(12,2) not null default 0,
      opening_note text,
      opened_at timestamptz not null default now(),
      closed_at timestamptz,
      closing_note text,
      closing_cash_iqd numeric(12,2),
      invoices_count integer,
      returns_count integer,
      gross_sales_iqd numeric(12,2),
      returns_value_iqd numeric(12,2),
      net_sales_iqd numeric(12,2),
      invoice_collections_iqd numeric(12,2),
      customer_payments_count integer,
      customer_payments_iqd numeric(12,2),
      collected_cash_iqd numeric(12,2),
      credit_sales_iqd numeric(12,2),
      expected_cash_iqd numeric(12,2),
      cash_difference_iqd numeric(12,2),
      status text not null default 'open'
    )
  `,
    `create index if not exists idx_app_cashier_shifts_employee on app_cashier_shifts(employee_id, opened_at desc)`,
    `alter table app_cashier_shifts add column if not exists closing_cash_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists invoices_count integer`,
    `alter table app_cashier_shifts add column if not exists returns_count integer`,
    `alter table app_cashier_shifts add column if not exists gross_sales_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists returns_value_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists net_sales_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists invoice_collections_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists customer_payments_count integer`,
    `alter table app_cashier_shifts add column if not exists customer_payments_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists collected_cash_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists credit_sales_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists expected_cash_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists cash_difference_iqd numeric(12,2)`,
    `alter table app_cashier_shifts add column if not exists remitted_to_fund_account_id text`,
    `alter table app_cashier_shifts add column if not exists remitted_to_fund_account_name text`,
    `alter table app_cashier_shifts add column if not exists remittance_movement_id text`,
    `
    create table if not exists app_fund_accounts (
      id text primary key,
      name text not null unique,
      code text not null unique,
      account_type text not null,
      current_balance_iqd numeric(14,2) not null default 0,
      is_system boolean not null default false,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_fund_accounts_type on app_fund_accounts(account_type, name asc)`,
    `
    create table if not exists app_fund_movements (
      id text primary key,
      movement_no text not null unique,
      movement_date date not null,
      direction text not null,
      amount_iqd numeric(14,2) not null,
      source_fund_account_id text references app_fund_accounts(id),
      source_fund_account_name text,
      destination_fund_account_id text references app_fund_accounts(id),
      destination_fund_account_name text,
      reason text not null,
      reference_type text not null,
      reference_id text,
      counterparty_name text,
      notes text,
      created_by_employee_id text references app_employees(id),
      created_by_employee_name text,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_fund_movements_date on app_fund_movements(movement_date desc, created_at desc)`,
    `create index if not exists idx_app_fund_movements_reason on app_fund_movements(reason, created_at desc)`,
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
      shift_id text references app_cashier_shifts(id) on delete set null,
      terminal_name text,
      destination_fund_account_id text references app_fund_accounts(id),
      destination_fund_account_name text,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_customer_payments_customer on app_customer_payments(customer_id, created_at desc)`,
    `create index if not exists idx_app_customer_payments_shift on app_customer_payments(shift_id, created_at desc)`,
    `alter table app_customer_payments add column if not exists shift_id text references app_cashier_shifts(id) on delete set null`,
    `alter table app_customer_payments add column if not exists terminal_name text`,
    `alter table app_customer_payments add column if not exists destination_fund_account_id text references app_fund_accounts(id)`,
    `alter table app_customer_payments add column if not exists destination_fund_account_name text`,
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
      source_fund_account_id text references app_fund_accounts(id),
      source_fund_account_name text,
      notes text,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_supplier_payments_supplier on app_supplier_payments(supplier_id, created_at desc)`,
    `alter table app_supplier_payments add column if not exists source_fund_account_id text references app_fund_accounts(id)`,
    `alter table app_supplier_payments add column if not exists source_fund_account_name text`,
    `
    create table if not exists app_expense_categories (
      id text primary key,
      name text not null unique,
      code text not null unique,
      kind text not null,
      description text,
      is_system boolean not null default false,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_expense_categories_kind on app_expense_categories(kind, name asc)`,
    `
    create table if not exists app_expenses (
      id text primary key,
      expense_no text not null unique,
      expense_date date not null,
      category_id text not null references app_expense_categories(id),
      category_name text not null,
      category_kind text not null,
      amount_iqd numeric(12,2) not null,
      payment_method text not null,
      beneficiary_name text,
      notes text,
      created_by_employee_id text not null references app_employees(id),
      created_by_employee_name text not null,
      source_fund_account_id text references app_fund_accounts(id),
      source_fund_account_name text,
      shift_id text references app_cashier_shifts(id) on delete set null,
      reference_type text not null default 'manual',
      reference_id text,
      status text not null default 'posted',
      created_at timestamptz not null default now()
    )
  `,
    `alter table app_expenses add column if not exists reference_id text`,
    `alter table app_expenses add column if not exists source_fund_account_id text references app_fund_accounts(id)`,
    `alter table app_expenses add column if not exists source_fund_account_name text`,
    `create index if not exists idx_app_expenses_date on app_expenses(expense_date desc, created_at desc)`,
    `create index if not exists idx_app_expenses_category on app_expenses(category_id, expense_date desc)`,
    `
    create table if not exists app_system_settings (
      id text primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `,
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
    `alter table app_sale_invoices add column if not exists employee_id text references app_employees(id) on delete set null`,
    `alter table app_sale_invoices add column if not exists employee_name text`,
    `alter table app_sale_invoices add column if not exists shift_id text references app_cashier_shifts(id) on delete set null`,
    `alter table app_sale_invoices add column if not exists terminal_name text`,
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
      settlement_type text not null default 'cash-refund',
      cash_refund_iqd numeric(12,2) not null default 0,
      debt_relief_iqd numeric(12,2) not null default 0,
      created_at timestamptz not null default now()
    )
  `,
    `create index if not exists idx_app_sale_returns_invoice on app_sale_returns(invoice_id, created_at desc)`,
    `alter table app_sale_returns add column if not exists settlement_type text not null default 'cash-refund'`,
    `alter table app_sale_returns add column if not exists cash_refund_iqd numeric(12,2) not null default 0`,
    `alter table app_sale_returns add column if not exists debt_relief_iqd numeric(12,2) not null default 0`,
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
    create table if not exists app_inventory_batches (
      id text primary key,
      product_id text not null references app_products(id) on delete cascade,
      product_name text not null,
      source text not null default 'purchase',
      purchase_receipt_item_id text references app_purchase_receipt_items(id) on delete set null,
      batch_no text,
      expiry_date date,
      purchase_date date,
      supplier_name text,
      received_quantity numeric(12,3) not null,
      remaining_quantity numeric(12,3) not null,
      retail_unit_cost numeric(12,2) not null,
      created_at timestamptz not null default now()
    )
  `,
    `alter table app_inventory_batches add column if not exists source text not null default 'purchase'`,
    `alter table app_inventory_batches add column if not exists purchase_receipt_item_id text references app_purchase_receipt_items(id) on delete set null`,
    `alter table app_inventory_batches add column if not exists batch_no text`,
    `alter table app_inventory_batches add column if not exists expiry_date date`,
    `alter table app_inventory_batches add column if not exists purchase_date date`,
    `alter table app_inventory_batches add column if not exists supplier_name text`,
    `alter table app_inventory_batches add column if not exists received_quantity numeric(12,3) not null default 0`,
    `alter table app_inventory_batches add column if not exists remaining_quantity numeric(12,3) not null default 0`,
    `alter table app_inventory_batches add column if not exists retail_unit_cost numeric(12,2) not null default 0`,
    `create index if not exists idx_app_inventory_batches_product on app_inventory_batches(product_id, created_at asc)`,
    `create index if not exists idx_app_inventory_batches_expiry on app_inventory_batches(product_id, expiry_date asc)`,
    `
    create table if not exists app_sale_item_batch_allocations (
      id text primary key,
      sale_item_id text not null references app_sale_invoice_items(id) on delete cascade,
      product_id text not null references app_products(id) on delete cascade,
      batch_id text not null references app_inventory_batches(id) on delete cascade,
      quantity numeric(12,3) not null,
      returned_quantity numeric(12,3) not null default 0,
      created_at timestamptz not null default now()
    )
  `,
    `alter table app_sale_item_batch_allocations add column if not exists returned_quantity numeric(12,3) not null default 0`,
    `create index if not exists idx_app_sale_item_batch_allocations_sale_item on app_sale_item_batch_allocations(sale_item_id, created_at asc)`,
    `
    insert into app_inventory_batches (
      id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost
    )
    select
      'legacy-batch-' || item.id,
      item.product_id,
      item.name,
      'purchase',
      item.id,
      item.batch_no,
      item.expiry_date,
      receipt.purchase_date,
      receipt.supplier_name,
      item.base_quantity,
      item.base_quantity,
      item.unit_cost_iqd / greatest(item.base_quantity / nullif(item.quantity, 0), 1)
    from app_purchase_receipt_items item
    join app_purchase_receipts receipt on receipt.id = item.receipt_id
    where not exists (
      select 1 from app_inventory_batches batch where batch.purchase_receipt_item_id = item.id
    )
  `,
    `
    insert into app_inventory_batches (
      id, product_id, product_name, source, received_quantity, remaining_quantity, retail_unit_cost
    )
    select
      'opening-batch-' || product.id,
      product.id,
      product.name,
      'opening',
      greatest(product.stock_qty - coalesce(existing.purchase_qty, 0), 0),
      greatest(product.stock_qty - coalesce(existing.purchase_qty, 0), 0),
      product.purchase_price
    from app_products product
    left join (
      select product_id, sum(remaining_quantity) as purchase_qty
      from app_inventory_batches
      where source = 'purchase'
      group by product_id
    ) existing on existing.product_id = product.id
    where greatest(product.stock_qty - coalesce(existing.purchase_qty, 0), 0) > 0
      and not exists (
        select 1 from app_inventory_batches batch where batch.product_id = product.id and batch.source = 'opening'
      )
  `,
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
];
let pool = null;
export async function seedPostgresDefaults(target) {
    const seedProducts = listCatalogProducts();
    for (const product of seedProducts) {
        await target.query(`
        insert into app_products (
          id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        on conflict (id) do nothing
      `, [
            product.id,
            product.name,
            product.productFamilyName,
            product.variantLabel ?? null,
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
        ]);
        if (product.stockQty > 0) {
            await target.query(`
          insert into app_inventory_batches (
            id, product_id, product_name, source, received_quantity, remaining_quantity, retail_unit_cost
          )
          values ($1, $2, $3, 'opening', $4, $4, $5)
          on conflict (id) do nothing
        `, [
                `seed-opening-${product.id}`,
                product.id,
                product.name,
                product.stockQty,
                product.purchasePrice,
            ]);
        }
    }
    const existingSuppliers = await target.query('select count(*)::text as count from app_suppliers');
    if (Number(existingSuppliers.rows[0]?.count ?? '0') === 0) {
        await target.query(`
        insert into app_suppliers (id, name, phone, current_balance, is_active)
        values
          ('supp-nahrain', 'شركة النهرين للتجهيز', '07700000001', 0, true),
          ('supp-baghdad-foods', 'بغداد فودز', '07700000002', 0, true)
        on conflict (id) do nothing
      `);
    }
    const existingExpenseCategories = await target.query('select count(*)::text as count from app_expense_categories');
    if (Number(existingExpenseCategories.rows[0]?.count ?? '0') === 0) {
        await target.query(`
        insert into app_expense_categories (id, name, code, kind, description, is_system, is_active)
        values
          ('expense-cat-salary', 'رواتب الموظفين', 'salary', 'payroll', 'صرف الرواتب الشهرية والمستحقات الدورية للموظفين.', true, true),
          ('expense-cat-utilities', 'الخدمات', 'utilities', 'service', 'كهرباء وماء وإنترنت وخدمات تشغيلية مماثلة.', true, true),
          ('expense-cat-supplier-payment', 'تسديد مورد', 'supplier-payment', 'supplier', 'المبالغ المدفوعة للموردين لتخفيض أرصدتهم المستحقة.', true, true),
          ('expense-cat-transport', 'نقل وتحميل', 'transport', 'operating', 'مصاريف النقل والتحميل والتوصيل التشغيلي.', true, true),
          ('expense-cat-maintenance', 'صيانة', 'maintenance', 'operating', 'صيانة الطابعات والثلاجات وأجهزة الكاشير والمرافق.', true, true)
        on conflict (id) do nothing
      `);
    }
    const existingFundAccounts = await target.query('select count(*)::text as count from app_fund_accounts');
    if (Number(existingFundAccounts.rows[0]?.count ?? '0') === 0) {
        await target.query(`
        insert into app_fund_accounts (id, name, code, account_type, current_balance_iqd, is_system, is_active)
        values
          ('fund-revenue', 'صندوق الإيرادات', 'revenue', 'revenue', 0, true, true),
          ('fund-capital', 'صندوق رأس المال', 'capital', 'capital', 0, true, true)
        on conflict (id) do nothing
      `);
    }
}
export async function initializePostgresPool() {
    if (!env.DATABASE_URL) {
        return null;
    }
    if (pool) {
        return pool;
    }
    const createdPool = new Pool({
        connectionString: env.DATABASE_URL,
        ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    });
    try {
        await createdPool.query('select 1');
        for (const statement of bootstrapStatements) {
            await createdPool.query(statement);
        }
        await seedPostgresDefaults(createdPool);
        pool = createdPool;
        return pool;
    }
    catch (error) {
        await createdPool.end().catch(() => undefined);
        throw error;
    }
}
export function getPostgresPool() {
    if (!pool) {
        throw new Error('اتصال PostgreSQL غير مهيأ.');
    }
    return pool;
}
