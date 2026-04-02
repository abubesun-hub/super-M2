import type {
  CatalogProduct,
  ProductUpsertInput,
  StockMovement,
} from '../modules/products/store.js'
import type { CreatePurchaseReceiptInput } from '../modules/purchases/schemas.js'
import type { CustomerPaymentInput, CustomerUpsertInput } from '../modules/customers/schemas.js'
import type { Customer, CustomerPayment } from '../modules/customers/store.js'
import type { StoredPurchaseReceipt } from '../modules/purchases/store.js'
import type { CreateSaleInvoiceInput, CreateSaleReturnInput } from '../modules/sales/schemas.js'
import type { StoredSaleInvoice } from '../modules/sales/store.js'
import type { Supplier, SupplierPayment } from '../modules/suppliers/store.js'
import type { SupplierPaymentInput, SupplierUpsertInput } from '../modules/suppliers/schemas.js'

export interface ProductRepository {
  listProducts(): Promise<CatalogProduct[]>
  listMovements(): Promise<StockMovement[]>
  adjustStock(input: { productId: string; quantityDelta: number; note: string }): Promise<CatalogProduct>
  createProduct(input: ProductUpsertInput): Promise<CatalogProduct>
  updateProduct(productId: string, input: ProductUpsertInput): Promise<CatalogProduct>
  deleteProduct(productId: string): Promise<CatalogProduct>
}

export interface SalesRepository {
  listInvoices(): Promise<StoredSaleInvoice[]>
  createInvoice(input: CreateSaleInvoiceInput): Promise<StoredSaleInvoice>
  createReturn(invoiceId: string, input: CreateSaleReturnInput): Promise<StoredSaleInvoice>
}

export interface PurchasesRepository {
  listReceipts(): Promise<StoredPurchaseReceipt[]>
  createReceipt(input: CreatePurchaseReceiptInput): Promise<StoredPurchaseReceipt>
}

export interface CustomersRepository {
  listCustomers(): Promise<Customer[]>
  listPayments(customerId: string): Promise<CustomerPayment[]>
  createCustomer(input: CustomerUpsertInput): Promise<Customer>
  updateCustomer(customerId: string, input: CustomerUpsertInput): Promise<Customer>
  createPayment(customerId: string, input: CustomerPaymentInput): Promise<CustomerPayment>
  deleteCustomer(customerId: string): Promise<Customer>
}

export interface SuppliersRepository {
  listSuppliers(): Promise<Supplier[]>
  listPayments(supplierId: string): Promise<SupplierPayment[]>
  createSupplier(input: SupplierUpsertInput): Promise<Supplier>
  updateSupplier(supplierId: string, input: SupplierUpsertInput): Promise<Supplier>
  createPayment(supplierId: string, input: SupplierPaymentInput): Promise<SupplierPayment>
  deleteSupplier(supplierId: string): Promise<Supplier>
}

export type StorageInfo = {
  driver: 'memory' | 'postgres'
  persistence: boolean
  connected: boolean
  message: string
}

export type DataAccess = {
  products: ProductRepository
  sales: SalesRepository
  purchases: PurchasesRepository
  customers: CustomersRepository
  suppliers: SuppliersRepository
}