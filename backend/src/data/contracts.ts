import type {
  CatalogProduct,
  InventoryBatch,
  ProductUpsertInput,
  StockMovement,
} from '../modules/products/store.js'
import type { CreatePurchaseReceiptInput } from '../modules/purchases/schemas.js'
import type { CustomerPaymentInput, CustomerUpsertInput } from '../modules/customers/schemas.js'
import type { Customer, CustomerPayment } from '../modules/customers/store.js'
import type { EmployeeCompensationCreateInput, EmployeeCreateInput, EmployeeUpdateInput, EmployeeAbsenceCreateInput, EmployeeAbsenceUpdateInput } from '../modules/employees/schemas.js'
import type { Employee, EmployeeCompensation, EmployeeAbsence, MonthlyPayrollSummary, EmployeeCumulativePayrollSummary } from '../modules/employees/store.js'
import type { ExpenseCategoryCreateInput } from '../modules/expenses/schemas.js'
import type { Expense, ExpenseCategory, ExpenseCreateRecordInput } from '../modules/expenses/store.js'
import type { CapitalTransactionCreateInput, CapitalTransactionUpdateInput, FundAccount, FundMovement } from '../modules/funds/store.js'
import type { SystemSettings, SystemSettingsUpdateInput } from '../modules/settings/store.js'
import type { StoredPurchaseReceipt } from '../modules/purchases/store.js'
import type { CreateSaleInvoiceInput, CreateSaleReturnInput } from '../modules/sales/schemas.js'
import type { StoredSaleInvoice } from '../modules/sales/store.js'
import type { CloseShiftInput, CreateShiftInput } from '../modules/shifts/schemas.js'
import type { CashierShift } from '../modules/shifts/store.js'
import type { Supplier, SupplierPayment } from '../modules/suppliers/store.js'
import type { SupplierPaymentInput, SupplierUpsertInput } from '../modules/suppliers/schemas.js'

export interface ProductRepository {
  listProducts(): Promise<CatalogProduct[]>
  listMovements(): Promise<StockMovement[]>
  listBatches(productId?: string): Promise<InventoryBatch[]>
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
  updateReceipt(receiptId: string, input: CreatePurchaseReceiptInput): Promise<StoredPurchaseReceipt>
  deleteReceipt(receiptId: string): Promise<StoredPurchaseReceipt>
}

export interface CustomersRepository {
  listCustomers(): Promise<Customer[]>
  listPayments(customerId: string): Promise<CustomerPayment[]>
  createCustomer(input: CustomerUpsertInput): Promise<Customer>
  updateCustomer(customerId: string, input: CustomerUpsertInput): Promise<Customer>
  createPayment(customerId: string, input: CustomerPaymentInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<CustomerPayment>
  deleteCustomer(customerId: string): Promise<Customer>
}

export interface SuppliersRepository {
  listSuppliers(): Promise<Supplier[]>
  listPayments(supplierId: string): Promise<SupplierPayment[]>
  createSupplier(input: SupplierUpsertInput): Promise<Supplier>
  updateSupplier(supplierId: string, input: SupplierUpsertInput): Promise<Supplier>
  createPayment(supplierId: string, input: SupplierPaymentInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<SupplierPayment>
  deleteSupplier(supplierId: string): Promise<Supplier>
}

export interface EmployeesRepository {
  listEmployees(): Promise<Employee[]>
  listCompensations(employeeId: string): Promise<EmployeeCompensation[]>
  listAbsences(employeeId: string): Promise<EmployeeAbsence[]>
  listMonthlyPayroll(month: string): Promise<MonthlyPayrollSummary[]>
  listCumulativePayroll(throughMonth: string): Promise<EmployeeCumulativePayrollSummary[]>
  createEmployee(input: EmployeeCreateInput): Promise<Employee>
  createCompensation(employeeId: string, input: EmployeeCompensationCreateInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<EmployeeCompensation>
  createAbsence(employeeId: string, input: EmployeeAbsenceCreateInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<EmployeeAbsence>
  updateAbsence(employeeId: string, absenceId: string, input: EmployeeAbsenceUpdateInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<EmployeeAbsence>
  deleteAbsence(employeeId: string, absenceId: string): Promise<EmployeeAbsence>
  settleMonthlyPayroll(input: { month: string; paymentDate: string; paymentMethod: 'cash' | 'bank'; employeeIds?: string[]; createdByEmployeeId: string; createdByEmployeeName: string }): Promise<EmployeeCompensation[]>
  updateEmployee(employeeId: string, input: EmployeeUpdateInput): Promise<Employee>
  authenticate(login: string, pin: string): Promise<Employee>
  resetPin(employeeId: string, pin: string): Promise<Employee>
  setActive(employeeId: string, isActive: boolean): Promise<Employee>
}

export interface ShiftsRepository {
  listShifts(employeeId?: string): Promise<CashierShift[]>
  createShift(input: CreateShiftInput): Promise<CashierShift>
  closeShift(shiftId: string, input: CloseShiftInput & { createdByEmployeeId: string; createdByEmployeeName: string }): Promise<CashierShift>
}

export interface ExpensesRepository {
  listCategories(): Promise<ExpenseCategory[]>
  createCategory(input: ExpenseCategoryCreateInput): Promise<ExpenseCategory>
  listExpenses(): Promise<Expense[]>
  createExpense(input: ExpenseCreateRecordInput): Promise<Expense>
}

export interface FundsRepository {
  listAccounts(): Promise<FundAccount[]>
  listMovements(): Promise<FundMovement[]>
  listCapitalTransactions(): Promise<FundMovement[]>
  createCapitalTransaction(input: CapitalTransactionCreateInput): Promise<FundMovement>
  updateCapitalTransaction(movementId: string, input: CapitalTransactionUpdateInput): Promise<FundMovement>
  deleteCapitalTransaction(movementId: string): Promise<FundMovement>
}

export interface SettingsRepository {
  getSettings(): Promise<SystemSettings>
  updateSettings(input: SystemSettingsUpdateInput): Promise<SystemSettings>
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
  employees: EmployeesRepository
  shifts: ShiftsRepository
  suppliers: SuppliersRepository
  expenses: ExpensesRepository
  funds: FundsRepository
  settings: SettingsRepository
  resetAllData(): Promise<void>
}