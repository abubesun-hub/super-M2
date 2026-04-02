-- PostgreSQL initial schema for Super M2 supermarket system

create extension if not exists "pgcrypto";

create table currencies (
  code varchar(3) primary key,
  name_ar varchar(50) not null,
  symbol varchar(10) not null,
  exchange_rate_to_iqd numeric(12,4) not null,
  is_active boolean not null default true
);

insert into currencies (code, name_ar, symbol, exchange_rate_to_iqd)
values
  ('IQD', 'دينار عراقي', 'د.ع', 1),
  ('USD', 'دولار أمريكي', '$', 1310);

create table branches (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  name_ar varchar(150) not null,
  base_currency_code varchar(3) not null default 'IQD' references currencies(code),
  phone varchar(30),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  code varchar(20) not null unique,
  name_ar varchar(150) not null,
  warehouse_type varchar(30) not null default 'store',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  name_ar varchar(100) not null,
  description text,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  role_id uuid not null references roles(id),
  full_name varchar(150) not null,
  username varchar(60) not null unique,
  password_hash text not null,
  phone varchar(30),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id),
  code varchar(30) not null unique,
  name_ar varchar(150) not null,
  created_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  code varchar(30) not null unique,
  name_ar varchar(150) not null,
  created_at timestamptz not null default now()
);

create table units (
  id uuid primary key default gen_random_uuid(),
  code varchar(20) not null unique,
  name_ar varchar(100) not null,
  symbol varchar(20),
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  brand_id uuid references brands(id),
  base_unit_id uuid not null references units(id),
  code varchar(40) not null unique,
  name_ar varchar(200) not null,
  description text,
  is_weighted boolean not null default false,
  scale_prefix varchar(4),
  plu_code varchar(10),
  vat_rate numeric(5,4) not null default 0.1500,
  purchase_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  min_stock numeric(12,3) not null default 0,
  track_expiry boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_plu_code_unique on products(plu_code) where plu_code is not null;

create table product_barcodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  barcode varchar(50) not null unique,
  barcode_type varchar(20) not null default 'retail',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  code varchar(30) not null unique,
  name_ar varchar(150) not null,
  phone varchar(30),
  email varchar(150),
  credit_limit numeric(12,2) not null default 0,
  current_balance numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code varchar(30) not null unique,
  name_ar varchar(150) not null,
  phone varchar(30),
  current_balance numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  batch_no varchar(50) not null,
  expiry_date date,
  received_at timestamptz not null default now(),
  quantity_on_hand numeric(12,3) not null default 0,
  cost_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(product_id, warehouse_id, batch_no)
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  warehouse_id uuid not null references warehouses(id),
  batch_id uuid references inventory_batches(id),
  movement_type varchar(30) not null,
  reference_type varchar(30) not null,
  reference_id uuid,
  quantity_in numeric(12,3) not null default 0,
  quantity_out numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table sales_invoices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  warehouse_id uuid not null references warehouses(id),
  cashier_id uuid not null references users(id),
  customer_id uuid references customers(id),
  invoice_no varchar(30) not null unique,
  status varchar(20) not null default 'posted',
  payment_method varchar(20) not null default 'cash',
  currency_code varchar(3) not null default 'IQD' references currencies(code),
  exchange_rate numeric(12,4) not null default 1310,
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references sales_invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  batch_id uuid references inventory_batches(id),
  barcode varchar(50),
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  currency_code varchar(3) not null default 'IQD' references currencies(code),
  vat_rate numeric(5,4) not null,
  vat_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  line_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table sales_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references sales_invoices(id) on delete cascade,
  payment_method varchar(20) not null default 'cash',
  currency_code varchar(3) not null references currencies(code),
  amount_received numeric(12,2) not null,
  amount_received_iqd numeric(12,2) not null,
  exchange_rate numeric(12,4) not null default 1310,
  reference_no varchar(100),
  notes text,
  created_at timestamptz not null default now()
);

create table purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  warehouse_id uuid not null references warehouses(id),
  supplier_id uuid not null references suppliers(id),
  invoice_no varchar(30) not null unique,
  status varchar(20) not null default 'posted',
  currency_code varchar(3) not null default 'IQD' references currencies(code),
  exchange_rate numeric(12,4) not null default 1310,
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  purchase_invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  batch_no varchar(50) not null,
  expiry_date date,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2) not null,
  currency_code varchar(3) not null default 'IQD' references currencies(code),
  vat_rate numeric(5,4) not null default 0.1500,
  vat_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  cashier_id uuid not null references users(id),
  opening_balance numeric(12,2) not null default 0,
  closing_balance numeric(12,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status varchar(20) not null default 'open'
);

create index idx_inventory_batches_product_expiry on inventory_batches(product_id, expiry_date);
create index idx_stock_movements_product_warehouse on stock_movements(product_id, warehouse_id, created_at desc);
create index idx_sales_invoices_created_at on sales_invoices(created_at desc);
create index idx_sales_invoice_items_product on sales_invoice_items(product_id);
create index idx_sales_invoice_payments_invoice on sales_invoice_payments(sales_invoice_id, created_at desc);

comment on table inventory_batches is 'Stores batches and expiry dates to support FIFO and food safety controls.';
comment on table stock_movements is 'Immutable stock ledger for purchases, sales, returns, wastage, and manual adjustments.';
comment on table sales_invoices is 'Supports offline sync by tracking synced_at when POS reconnects.';
comment on table currencies is 'Supports Iraqi dinar as base currency and US dollar as parallel currency for display and settlement.';
comment on table sales_invoice_payments is 'Supports split tender settlement, including mixed IQD and USD cash entries for the same invoice.';
