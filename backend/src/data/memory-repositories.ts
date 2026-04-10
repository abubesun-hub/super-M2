import {
  adjustCustomerBalance,
  createCustomer,
  createCustomerPayment,
  deleteCustomer,
  findCustomerById,
  listCustomerPayments,
  listCustomers,
  resetCustomersStore,
  updateCustomer,
} from '../modules/customers/store.js'
import {
  authenticateEmployee,
  buildEmployeeCumulativePayrollSummary,
  buildMonthlyPayrollSummary,
  createEmployeeAbsence,
  createEmployeeCompensation,
  createEmployee,
  deleteEmployeeAbsence,
  findEmployeeById,
  isEmployeeCompensationOutflow,
  listEmployeeAbsences,
  listEmployeeCompensations,
  listEmployees,
  resetEmployeesStore,
  resetEmployeePin,
  setEmployeeActive,
  settleMonthlyPayroll,
  updateEmployeeAbsence,
  updateEmployee,
} from '../modules/employees/store.js'
import { buildShiftFinancialSummary } from '../modules/shifts/summary.js'
import { closeCashierShift, createCashierShift, findOpenShiftByEmployee, findShiftById, listCashierShifts } from '../modules/shifts/store.js'
import {
  adjustProductStock,
  createCatalogProduct,
  deleteCatalogProduct,
  listInventoryBatches,
  listCatalogProducts,
  listStockMovements,
  resetProductsStore,
  reversePurchaseFromInventory,
  receivePurchaseToInventory,
  restoreSaleToInventory,
  type ProductSaleLine,
  updateCatalogProduct,
  applySaleToInventory,
} from '../modules/products/store.js'
import type { CreatePurchaseReceiptInput } from '../modules/purchases/schemas.js'
import {
  createPurchaseReceipt,
  deletePurchaseReceipt,
  findPurchaseReceiptById,
  listPurchaseReceipts,
  resetPurchasesStore,
  type StoredPurchaseReceipt,
  updatePurchaseReceipt,
} from '../modules/purchases/store.js'
import type { CreateSaleInvoiceInput, CreateSaleReturnInput } from '../modules/sales/schemas.js'
import {
  createSaleInvoice,
  createSaleReturn,
  calculateSaleReturnValue,
  findSaleInvoiceById,
  getReturnedQuantity,
  listSaleInvoices,
  resetSalesStore,
  resolveSaleReturnSettlement,
} from '../modules/sales/store.js'
import {
  adjustSupplierBalance,
  createSupplier,
  createSupplierPayment,
  deleteSupplier,
  findSupplierById,
  listSupplierPayments,
  listSuppliers,
  resetSuppliersStore,
  updateSupplier,
} from '../modules/suppliers/store.js'
import { getFinalCashBalanceIqd } from '../modules/funds/store.js'
import {
  createExpenseCategory,
  createExpenseRecord,
  findExpenseCategoryByCode,
  listExpenseCategories,
  listExpenses,
  resetExpensesStore,
} from '../modules/expenses/store.js'
import {
  createCapitalTransaction,
  createFundMovement,
  deleteCapitalTransaction,
  findFundAccountByCode,
  findFundAccountById,
  listCapitalTransactions,
  listFundAccounts,
  listFundMovements,
  resetFundsStore,
  updateCapitalTransaction,
} from '../modules/funds/store.js'
import { createDefaultSystemSettings, normalizeSystemSettings } from '../modules/settings/store.js'
import { resetShiftsStore } from '../modules/shifts/store.js'
import type { DataAccess } from './contracts.js'

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function roundQuantity(value: number) {
  return Number(value.toFixed(3))
}

function createPurchasedProductInput(
  draft: NonNullable<CreatePurchaseReceiptInput['items'][number]['productDraft']>,
  entryUnit: CreatePurchaseReceiptInput['items'][number]['entryUnit'],
  unitCostIqd: number,
) {
  const hasWholesale = Boolean(draft.wholesaleUnit && draft.wholesaleQuantity && draft.wholesaleQuantity > 0)
  const wholesaleQuantity = draft.wholesaleQuantity ?? 1
  const usesWholesaleCost = entryUnit === 'wholesale' && hasWholesale
  const retailPurchasePrice = usesWholesaleCost
    ? roundMoney(unitCostIqd / wholesaleQuantity)
    : roundMoney(unitCostIqd)

  return {
    name: draft.name,
    productFamilyName: draft.productFamilyName || draft.name,
    variantLabel: draft.variantLabel || undefined,
    barcode: draft.barcode,
    wholesaleBarcode: hasWholesale ? draft.wholesaleBarcode || undefined : undefined,
    plu: draft.plu || undefined,
    department: draft.department,
    measurementType: draft.measurementType,
    purchaseCostBasis: usesWholesaleCost ? 'wholesale' as const : 'retail' as const,
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

type NormalizedPurchaseReceiptItem = StoredPurchaseReceipt['items'][number] & {
  receiptItemId: string
  retailUnitCostIqd: number
  wholesaleUnitCostIqd?: number
}

function buildPurchaseMovementNote(actionLabel: string, purchaseDate: string, supplierName?: string, supplierInvoiceNo?: string) {
  return [
    `${actionLabel}${supplierName ? ` من ${supplierName}` : ''}`,
    `بتاريخ ${purchaseDate}`,
    supplierInvoiceNo ? `قائمة ${supplierInvoiceNo}` : null,
  ].filter(Boolean).join(' | ')
}

function normalizePurchaseReceiptItems(input: CreatePurchaseReceiptInput) {
  return input.items.map<NormalizedPurchaseReceiptItem>((item) => {
    const unitCostIqd = input.currencyCode === 'USD'
      ? roundMoney(item.unitCost * input.exchangeRate)
      : roundMoney(item.unitCost)

    const product = item.productId
      ? listCatalogProducts().find((entry) => entry.id === item.productId)
      : createCatalogProduct(createPurchasedProductInput(item.productDraft!, item.entryUnit, unitCostIqd))

    if (!product) {
      throw new Error('أحد الأصناف المختارة غير موجود في الكتالوج.')
    }

    const wholesaleQuantity = product.wholesaleQuantity ?? 1
    const isWholesaleEntry = item.entryUnit === 'wholesale' && product.wholesaleUnit && wholesaleQuantity > 0
    const baseQuantity = roundQuantity(item.quantity * (isWholesaleEntry ? wholesaleQuantity : 1))
    const retailUnitCostIqd = roundMoney(unitCostIqd / (isWholesaleEntry ? wholesaleQuantity : 1))

    return {
      receiptItemId: createId('purchase-item'),
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      baseQuantity,
      entryUnit: item.entryUnit,
      entryUnitLabel: isWholesaleEntry ? product.wholesaleUnit ?? product.retailUnit : product.retailUnit,
      batchNo: item.batchNo?.trim() || undefined,
      expiryDate: item.expiryDate?.trim() || undefined,
      unitCost: roundMoney(item.unitCost),
      unitCostIqd,
      lineTotal: roundMoney(item.quantity * item.unitCost),
      lineTotalIqd: roundMoney(item.quantity * unitCostIqd),
      retailUnitCostIqd,
      wholesaleUnitCostIqd: isWholesaleEntry ? unitCostIqd : (product.wholesaleQuantity ? roundMoney(retailUnitCostIqd * product.wholesaleQuantity) : undefined),
    }
  })
}

function mapReturnLinesToInventory(invoiceId: string, input: CreateSaleReturnInput): ProductSaleLine[] {
  const invoice = findSaleInvoiceById(invoiceId)

  if (!invoice) {
    throw new Error('الفاتورة المطلوبة غير موجودة.')
  }

  for (const returnItem of input.items) {
    const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId)

    if (!soldItem) {
      throw new Error('لا يمكن إرجاع صنف غير موجود في الفاتورة الأصلية.')
    }

    const alreadyReturned = getReturnedQuantity(invoice, soldItem.id)
    const remainingQty = roundMoney(soldItem.quantity - alreadyReturned)

    if (returnItem.quantity - remainingQty > 0.001) {
      throw new Error(`كمية المرتجع للصنف ${soldItem.name} تتجاوز الكمية المتبقية القابلة للإرجاع.`)
    }
  }

  return input.items.map((returnItem) => {
    const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId)

    return {
      saleItemId: soldItem?.id,
      productId: soldItem?.productId ?? returnItem.invoiceItemId,
      name: soldItem?.name ?? returnItem.invoiceItemId,
      quantity: roundQuantity(returnItem.quantity * ((soldItem?.baseQuantity ?? soldItem?.quantity ?? 1) / (soldItem?.quantity || 1))),
    }
  })
}

export function createMemoryDataAccess(): DataAccess {
  let systemSettings = createDefaultSystemSettings()

  return {
    products: {
      async listProducts() {
        return listCatalogProducts()
      },
      async listMovements() {
        return listStockMovements()
      },
      async listBatches(productId?: string) {
        const batches = listInventoryBatches()
        return productId ? batches.filter((batch) => batch.productId === productId) : batches
      },
      async adjustStock(input) {
        return adjustProductStock(input)
      },
      async createProduct(input) {
        return createCatalogProduct(input)
      },
      async updateProduct(productId, input) {
        return updateCatalogProduct(productId, input)
      },
      async deleteProduct(productId) {
        return deleteCatalogProduct(productId)
      },
    },
    sales: {
      async listInvoices() {
        return listSaleInvoices()
      },
      async createInvoice(input: CreateSaleInvoiceInput) {
        const currentProducts = listCatalogProducts()
        const customer = input.customerId ? findCustomerById(input.customerId) : null
        const employee = findEmployeeById(input.employeeId)
        const shift = findShiftById(input.shiftId)

        if (input.customerId && !customer) {
          throw new Error('العميل المحدد غير موجود.')
        }

        if (!employee || !employee.isActive) {
          throw new Error('الموظف المحدد غير موجود أو غير مفعل.')
        }

        if (!shift || shift.status !== 'open') {
          throw new Error('لا توجد وردية مفتوحة صالحة لهذه الفاتورة.')
        }

        if (shift.employeeId !== employee.id) {
          throw new Error('الوردية المفتوحة لا تخص الموظف المحدد.')
        }

        const storedItems = input.items.map((item) => {
          const product = currentProducts.find((entry) => entry.id === item.productId)

          if (!product) {
            throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`)
          }

          const unitCost = roundMoney(product.purchasePrice)
          const lineCost = roundMoney(unitCost * item.baseQuantity)

          return {
            id: createId('sale-item'),
            ...item,
            unitCost,
            lineCost,
            lineProfit: roundMoney(item.lineTotal - lineCost),
          }
        })

        applySaleToInventory(
          storedItems.map((item) => ({
            saleItemId: item.id,
            productId: item.productId,
            name: item.name,
            quantity: item.baseQuantity,
          })),
        )

        const paidIqd = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0))
        const remainingAmountIqd = roundMoney(Math.max(0, input.totalAmount - paidIqd))

        if (customer && remainingAmountIqd > 0.01) {
          adjustCustomerBalance(customer.id, remainingAmountIqd)
        }

        return createSaleInvoice({
          ...input,
          employeeName: employee.name,
          customerName: customer?.name ?? input.customerName,
          terminalName: shift.terminalName,
        }, storedItems)
      },
      async createReturn(invoiceId: string, input: CreateSaleReturnInput) {
        const invoice = findSaleInvoiceById(invoiceId)

        if (!invoice) {
          throw new Error('الفاتورة المطلوبة غير موجودة.')
        }

        if (input.settlementType === 'deduct-customer-balance' && !invoice.customerId) {
          throw new Error('تخفيض مديونية العميل يتطلب ربط الفاتورة بعميل محفوظ.')
        }

        const settlement = resolveSaleReturnSettlement(invoice, input)

        const inventoryLines = mapReturnLinesToInventory(invoiceId, input)
        restoreSaleToInventory(inventoryLines, input.reason)
        createSaleReturn(invoice, input)

        if (invoice.customerId && settlement.debtReliefIqd > 0) {
          adjustCustomerBalance(invoice.customerId, -settlement.debtReliefIqd)
        }

        return invoice
      },
    },
    purchases: {
      async listReceipts() {
        return listPurchaseReceipts()
      },
      async createReceipt(input: CreatePurchaseReceiptInput) {
        const supplier = input.supplierId ? findSupplierById(input.supplierId) : null

        if (input.supplierId && !supplier) {
          throw new Error('المورد المحدد غير موجود.')
        }

        const purchaseDateLabel = input.purchaseDate || new Date().toISOString().slice(0, 10)
        const supplierInvoiceLabel = input.supplierInvoiceNo?.trim()
        const supplierName = supplier?.name ?? input.supplierName
        const items = normalizePurchaseReceiptItems({
          ...input,
          supplierName,
          purchaseDate: purchaseDateLabel,
          supplierInvoiceNo: supplierInvoiceLabel || undefined,
        })
        const movementNote = buildPurchaseMovementNote('استلام شراء', purchaseDateLabel, supplierName, supplierInvoiceLabel)

        receivePurchaseToInventory(
          items.map((item) => ({
            purchaseReceiptItemId: item.receiptItemId,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            retailQuantity: item.baseQuantity,
            retailUnitCost: item.retailUnitCostIqd,
            wholesaleUnitCost: item.wholesaleUnitCostIqd,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            purchaseDate: purchaseDateLabel,
            supplierName,
          })),
          movementNote,
        )

        const totalCostIqd = roundMoney(items.reduce((sum, item) => sum + item.lineTotalIqd, 0))

        if (supplier) {
          adjustSupplierBalance(supplier.id, totalCostIqd)
        }

        return createPurchaseReceipt({
          ...input,
          supplierName,
          purchaseDate: purchaseDateLabel,
          supplierInvoiceNo: supplierInvoiceLabel || undefined,
        }, items, {
          totalCost: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
          totalCostIqd,
        })
      },
      async updateReceipt(receiptId: string, input: CreatePurchaseReceiptInput) {
        const existingReceipt = findPurchaseReceiptById(receiptId)

        if (!existingReceipt) {
          throw new Error('سند الشراء المطلوب غير موجود.')
        }

        const oldSupplier = existingReceipt.supplierId ? findSupplierById(existingReceipt.supplierId) : null
        const supplier = input.supplierId ? findSupplierById(input.supplierId) : null
        const purchaseDateLabel = input.purchaseDate || existingReceipt.purchaseDate
        const supplierInvoiceLabel = input.supplierInvoiceNo?.trim()

        if (input.supplierId && !supplier) {
          throw new Error('المورد المحدد غير موجود.')
        }

        reversePurchaseFromInventory(
          existingReceipt.items.map((item) => ({
            receiptItemId: item.receiptItemId,
            productId: item.productId,
            name: item.name,
            retailQuantity: item.baseQuantity,
          })),
          `عكس سند الشراء ${existingReceipt.receiptNo} قبل التعديل`,
          'تعديل',
        )

        if (oldSupplier) {
          adjustSupplierBalance(oldSupplier.id, -existingReceipt.totalCostIqd)
        }

        const supplierName = supplier?.name ?? input.supplierName
        const items = normalizePurchaseReceiptItems({
          ...input,
          supplierName,
          purchaseDate: purchaseDateLabel,
          supplierInvoiceNo: supplierInvoiceLabel || undefined,
        })
        const movementNote = buildPurchaseMovementNote('استلام شراء', purchaseDateLabel, supplierName, supplierInvoiceLabel)

        receivePurchaseToInventory(
          items.map((item) => ({
            purchaseReceiptItemId: item.receiptItemId,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            retailQuantity: item.baseQuantity,
            retailUnitCost: item.retailUnitCostIqd,
            wholesaleUnitCost: item.wholesaleUnitCostIqd,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            purchaseDate: purchaseDateLabel,
            supplierName,
          })),
          movementNote,
        )

        const totalCost = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0))
        const totalCostIqd = roundMoney(items.reduce((sum, item) => sum + item.lineTotalIqd, 0))

        if (supplier) {
          adjustSupplierBalance(supplier.id, totalCostIqd)
        }

        return updatePurchaseReceipt(receiptId, {
          ...input,
          supplierName,
          purchaseDate: purchaseDateLabel,
          supplierInvoiceNo: supplierInvoiceLabel || undefined,
        }, items, {
          totalCost,
          totalCostIqd,
        })
      },
      async deleteReceipt(receiptId: string) {
        const existingReceipt = findPurchaseReceiptById(receiptId)

        if (!existingReceipt) {
          throw new Error('سند الشراء المطلوب غير موجود.')
        }

        reversePurchaseFromInventory(
          existingReceipt.items.map((item) => ({
            receiptItemId: item.receiptItemId,
            productId: item.productId,
            name: item.name,
            retailQuantity: item.baseQuantity,
          })),
          `حذف سند الشراء ${existingReceipt.receiptNo}`,
          'حذف',
        )

        if (existingReceipt.supplierId) {
          const supplier = findSupplierById(existingReceipt.supplierId)

          if (supplier) {
            adjustSupplierBalance(supplier.id, -existingReceipt.totalCostIqd)
          }
        }

        return deletePurchaseReceipt(receiptId)
      },
    },
    customers: {
      async listCustomers() {
        return listCustomers()
      },
      async listPayments(customerId) {
        if (!findCustomerById(customerId)) {
          throw new Error('العميل المطلوب غير موجود.')
        }

        return listCustomerPayments(customerId)
      },
      async createCustomer(input) {
        return createCustomer(input)
      },
      async updateCustomer(customerId, input) {
        return updateCustomer(customerId, input)
      },
      async createPayment(customerId, input) {
        const customer = findCustomerById(customerId)

        if (!customer) {
          throw new Error('العميل المطلوب غير موجود.')
        }

        const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount)

        if (amountIqd - customer.currentBalance > 0.01) {
          throw new Error('قيمة التسديد تتجاوز الرصيد المستحق على العميل.')
        }

        adjustCustomerBalance(customerId, -amountIqd)

        const openShift = findOpenShiftByEmployee(input.createdByEmployeeId)
        const destinationFund = findFundAccountByCode('revenue')

        if (!openShift && !destinationFund) {
          throw new Error('صندوق الإيرادات غير معرف في النظام.')
        }

        const payment = createCustomerPayment({
          customerId,
          customerName: customer.name,
          currencyCode: input.currencyCode,
          exchangeRate: input.exchangeRate,
          amount: input.amount,
          amountIqd,
          shiftId: openShift?.id,
          terminalName: openShift?.terminalName,
          destinationFundAccountId: openShift ? undefined : destinationFund?.id,
          destinationFundAccountName: openShift ? undefined : destinationFund?.name,
          notes: input.notes || undefined,
        })

        if (!openShift && destinationFund) {
          createFundMovement({
            movementDate: payment.createdAt.slice(0, 10),
            direction: 'inflow',
            amountIqd,
            destinationFundAccountId: destinationFund.id,
            reason: 'customer-payment',
            referenceType: 'customer-payment',
            referenceId: payment.id,
            counterpartyName: customer.name,
            notes: payment.notes,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
          })
        }

        return payment
      },
      async deleteCustomer(customerId) {
        return deleteCustomer(customerId)
      },
    },
    employees: {
      async listEmployees() {
        return listEmployees()
      },
      async listCompensations(employeeId) {
        if (!findEmployeeById(employeeId)) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        return listEmployeeCompensations(employeeId)
      },
      async listAbsences(employeeId) {
        if (!findEmployeeById(employeeId)) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        return listEmployeeAbsences(employeeId)
      },
      async listMonthlyPayroll(month) {
        return listEmployees()
          .filter((employee) => employee.monthlySalaryIqd && employee.startDate)
          .map((employee) => buildMonthlyPayrollSummary(
            employee,
            listEmployeeCompensations(employee.id),
            listEmployeeAbsences(employee.id),
            month,
          ))
      },
      async listCumulativePayroll(throughMonth) {
        return listEmployees()
          .filter((employee) => employee.monthlySalaryIqd && employee.startDate)
          .map((employee) => buildEmployeeCumulativePayrollSummary(
            employee,
            listEmployeeCompensations(employee.id),
            listEmployeeAbsences(employee.id),
            throughMonth,
          ))
      },
      async createEmployee(input) {
        return createEmployee(input)
      },
      async createCompensation(employeeId, input) {
        const employee = findEmployeeById(employeeId)

        if (!employee) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        const compensation = createEmployeeCompensation(employee, input)

        if (isEmployeeCompensationOutflow(compensation.kind)) {
          const category = findExpenseCategoryByCode('salary')

          if (!category || !category.isActive) {
            throw new Error('فئة مصروف الرواتب غير معرفة في النظام.')
          }

          createExpenseRecord({
            expenseDate: compensation.paymentDate,
            categoryId: category.id,
            amountIqd: compensation.amountIqd,
            paymentMethod: compensation.paymentMethod ?? 'cash',
            beneficiaryName: employee.name,
            notes: compensation.notes || `${compensation.kind === 'payment' ? 'صرف راتب' : 'سلفة'} ${compensation.paymentNo}`,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
            referenceType: 'employee-compensation',
            referenceId: compensation.id,
          })
        }

        return compensation
      },
      async createAbsence(employeeId, input) {
        const employee = findEmployeeById(employeeId)

        if (!employee) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        return createEmployeeAbsence(employee, input)
      },
      async updateAbsence(employeeId, absenceId, input) {
        const employee = findEmployeeById(employeeId)

        if (!employee) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        return updateEmployeeAbsence(employee, absenceId, input)
      },
      async deleteAbsence(employeeId, absenceId) {
        const employee = findEmployeeById(employeeId)

        if (!employee) {
          throw new Error('الموظف المطلوب غير موجود.')
        }

        return deleteEmployeeAbsence(employee, absenceId)
      },
      async settleMonthlyPayroll(input) {
        const createdEntries = settleMonthlyPayroll(
          input.month,
          input.paymentDate,
          input.paymentMethod,
          input.createdByEmployeeId,
          input.createdByEmployeeName,
          input.employeeIds,
        )

        for (const compensation of createdEntries.filter((entry) => isEmployeeCompensationOutflow(entry.kind))) {
          const employee = findEmployeeById(compensation.employeeId)
          const category = findExpenseCategoryByCode('salary')

          if (!employee || !category || !category.isActive) {
            continue
          }

          createExpenseRecord({
            expenseDate: compensation.paymentDate,
            categoryId: category.id,
            amountIqd: compensation.amountIqd,
            paymentMethod: compensation.paymentMethod ?? 'cash',
            beneficiaryName: employee.name,
            notes: compensation.notes || `${compensation.kind === 'payment' ? 'تسديد راتب' : 'سلفة'} ${compensation.paymentNo}`,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
            referenceType: 'employee-compensation',
            referenceId: compensation.id,
          })
        }

        return createdEntries
      },
      async updateEmployee(employeeId, input) {
        return updateEmployee(employeeId, input)
      },
      async authenticate(employeeId, pin) {
        return authenticateEmployee(employeeId, pin)
      },
      async resetPin(employeeId, pin) {
        return resetEmployeePin(employeeId, pin)
      },
      async setActive(employeeId, isActive) {
        return setEmployeeActive(employeeId, isActive)
      },
    },
    shifts: {
      async listShifts(employeeId) {
        return listCashierShifts(employeeId).map((shift) => {
          if (shift.status === 'closed') {
            return shift
          }

          const shiftInvoices = listSaleInvoices().filter((invoice) => invoice.shiftId === shift.id)
          const shiftCustomerPayments = listCustomerPayments().filter((payment) => payment.shiftId === shift.id)

          return {
            ...shift,
            closingSummary: buildShiftFinancialSummary(shift.openingFloatIqd, shiftInvoices, shiftCustomerPayments),
          }
        })
      },
      async createShift(input) {
        const employee = findEmployeeById(input.employeeId)

        if (!employee || !employee.isActive) {
          throw new Error('الموظف غير موجود أو غير مفعل.')
        }

        if (employee.role !== 'cashier' && employee.role !== 'admin') {
          throw new Error('هذا الموظف غير مخول بفتح وردية كاشير.')
        }

        return createCashierShift({
          employeeId: employee.id,
          employeeName: employee.name,
          terminalName: input.terminalName,
          openingFloatIqd: input.openingFloatIqd,
          openingNote: input.openingNote || undefined,
        })
      },
      async closeShift(shiftId, input) {
        const shift = findShiftById(shiftId)

        if (!shift) {
          throw new Error('الوردية المطلوبة غير موجودة.')
        }

        const shiftInvoices = listSaleInvoices().filter((invoice) => invoice.shiftId === shiftId)
        const shiftCustomerPayments = listCustomerPayments().filter((payment) => payment.shiftId === shiftId)
        const summary = buildShiftFinancialSummary(shift.openingFloatIqd, shiftInvoices, shiftCustomerPayments)

        const closedShift = closeCashierShift({
          shiftId,
          closingCashIqd: input.closingCashIqd,
          closingNote: input.closingNote || undefined,
          summary,
        })

        const destinationFund = findFundAccountByCode('revenue')

        if (!destinationFund) {
          throw new Error('صندوق الإيرادات غير معرف في النظام.')
        }

        const movement = input.closingCashIqd > 0
          ? createFundMovement({
              movementDate: closedShift.closedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
              direction: 'inflow',
              amountIqd: input.closingCashIqd,
              destinationFundAccountId: destinationFund.id,
              reason: 'shift-remittance',
              referenceType: 'shift',
              referenceId: closedShift.id,
              counterpartyName: closedShift.employeeName,
              notes: closedShift.closingNote,
              createdByEmployeeId: input.createdByEmployeeId,
              createdByEmployeeName: input.createdByEmployeeName,
            })
          : null

        return {
          ...closedShift,
          remittedToFundAccountId: movement ? destinationFund.id : undefined,
          remittedToFundAccountName: movement ? destinationFund.name : undefined,
          remittanceMovementId: movement?.id,
        }
      },
    },
    expenses: {
      async listCategories() {
        return listExpenseCategories()
      },
      async createCategory(input) {
        return createExpenseCategory(input)
      },
      async listExpenses() {
        return listExpenses()
      },
      async createExpense(input) {
        return createExpenseRecord(input)
      },
    },
    funds: {
      async listAccounts() {
        return listFundAccounts()
      },
      async listMovements() {
        return listFundMovements()
      },
      async listCapitalTransactions() {
        return listCapitalTransactions()
      },
      async createCapitalTransaction(input) {
        return createCapitalTransaction(input)
      },
      async updateCapitalTransaction(movementId, input) {
        return updateCapitalTransaction(movementId, input)
      },
      async deleteCapitalTransaction(movementId) {
        return deleteCapitalTransaction(movementId)
      },
    },
    settings: {
      async getSettings() {
        return normalizeSystemSettings(systemSettings)
      },
      async updateSettings(input) {
        systemSettings = normalizeSystemSettings({
          ...input,
          updatedAt: new Date().toISOString(),
        })

        return normalizeSystemSettings(systemSettings)
      },
    },
    async resetAllData() {
      resetSalesStore()
      resetPurchasesStore()
      resetCustomersStore()
      resetSuppliersStore()
      resetShiftsStore()
      resetExpensesStore()
      resetFundsStore()
      resetEmployeesStore()
      resetProductsStore()
      systemSettings = createDefaultSystemSettings()
    },
    suppliers: {
      async listSuppliers() {
        return listSuppliers()
      },
      async listPayments(supplierId) {
        if (!findSupplierById(supplierId)) {
          throw new Error('المورد المطلوب غير موجود.')
        }

        return listSupplierPayments(supplierId)
      },
      async createSupplier(input) {
        return createSupplier({
          name: input.name,
          phone: input.phone || undefined,
        })
      },
      async updateSupplier(supplierId, input) {
        return updateSupplier(supplierId, {
          name: input.name,
          phone: input.phone || undefined,
        })
      },
      async createPayment(supplierId, input) {
        const supplier = findSupplierById(supplierId)

        if (!supplier) {
          throw new Error('المورد المطلوب غير موجود.')
        }

        const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount)
        const finalCashBalanceIqd = getFinalCashBalanceIqd()

        if (amountIqd - supplier.currentBalance > 0.01) {
          throw new Error('قيمة الدفعة تتجاوز الرصيد المستحق على المورد.')
        }

        if (amountIqd - finalCashBalanceIqd > 0.01) {
          throw new Error(`لا يمكن تسجيل دفعة مورد أكبر من الرصيد النقدي النهائي الحالي البالغ ${finalCashBalanceIqd.toFixed(2)} د.ع.`)
        }

        adjustSupplierBalance(supplierId, -amountIqd)

        const resolvedSourceFund = input.sourceFundAccountId
          ? findFundAccountById(input.sourceFundAccountId)
          : null

        if (input.sourceFundAccountId && !resolvedSourceFund) {
          throw new Error('صندوق الدفع المحدد غير موجود أو غير مفعل.')
        }

        const payment = createSupplierPayment({
          supplierId,
          supplierName: supplier.name,
          currencyCode: input.currencyCode,
          exchangeRate: input.exchangeRate,
          amount: input.amount,
          amountIqd,
          sourceFundAccountId: resolvedSourceFund?.id,
          sourceFundAccountName: resolvedSourceFund?.name ?? 'FINAL CASH',
          notes: input.notes || undefined,
        })

        const category = findExpenseCategoryByCode('supplier-payment')

        if (!category) {
          throw new Error('فئة مصروف تسديد المورد غير معرفة في النظام.')
        }

        createExpenseRecord({
          expenseDate: payment.createdAt.slice(0, 10),
          categoryId: category.id,
          amountIqd,
          paymentMethod: input.currencyCode === 'IQD' ? 'cash' : 'bank',
          sourceFundAccountId: resolvedSourceFund?.id,
          beneficiaryName: supplier.name,
          notes: input.notes || `دفعة مورد ${payment.paymentNo}`,
          createdByEmployeeId: input.createdByEmployeeId,
          createdByEmployeeName: input.createdByEmployeeName,
          referenceType: 'supplier-payment',
          referenceId: payment.id,
        })

        return payment
      },
      async deleteSupplier(supplierId) {
        return deleteSupplier(supplierId)
      },
    },
  }
}