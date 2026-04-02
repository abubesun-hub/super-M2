import { adjustCustomerBalance, createCustomer, createCustomerPayment, deleteCustomer, findCustomerById, listCustomerPayments, listCustomers, updateCustomer, } from '../modules/customers/store.js';
import { adjustProductStock, createCatalogProduct, deleteCatalogProduct, listCatalogProducts, listStockMovements, receivePurchaseToInventory, restoreSaleToInventory, updateCatalogProduct, applySaleToInventory, } from '../modules/products/store.js';
import { createPurchaseReceipt, listPurchaseReceipts } from '../modules/purchases/store.js';
import { createSaleInvoice, createSaleReturn, findSaleInvoiceById, getReturnedQuantity, listSaleInvoices, } from '../modules/sales/store.js';
import { adjustSupplierBalance, createSupplier, createSupplierPayment, deleteSupplier, findSupplierById, listSupplierPayments, listSuppliers, updateSupplier, } from '../modules/suppliers/store.js';
function createId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function roundQuantity(value) {
    return Number(value.toFixed(3));
}
function createPurchasedProductInput(draft, entryUnit, unitCostIqd) {
    const hasWholesale = Boolean(draft.wholesaleUnit && draft.wholesaleQuantity && draft.wholesaleQuantity > 0);
    const wholesaleQuantity = draft.wholesaleQuantity ?? 1;
    const usesWholesaleCost = entryUnit === 'wholesale' && hasWholesale;
    const retailPurchasePrice = usesWholesaleCost
        ? roundMoney(unitCostIqd / wholesaleQuantity)
        : roundMoney(unitCostIqd);
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
    };
}
function mapReturnLinesToInventory(invoiceId, input) {
    const invoice = findSaleInvoiceById(invoiceId);
    if (!invoice) {
        throw new Error('الفاتورة المطلوبة غير موجودة.');
    }
    for (const returnItem of input.items) {
        const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId);
        if (!soldItem) {
            throw new Error('لا يمكن إرجاع صنف غير موجود في الفاتورة الأصلية.');
        }
        const alreadyReturned = getReturnedQuantity(invoice, soldItem.id);
        const remainingQty = roundMoney(soldItem.quantity - alreadyReturned);
        if (returnItem.quantity - remainingQty > 0.001) {
            throw new Error(`كمية المرتجع للصنف ${soldItem.name} تتجاوز الكمية المتبقية القابلة للإرجاع.`);
        }
    }
    return input.items.map((returnItem) => {
        const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId);
        return {
            productId: soldItem?.productId ?? returnItem.invoiceItemId,
            name: soldItem?.name ?? returnItem.invoiceItemId,
            quantity: roundQuantity(returnItem.quantity * ((soldItem?.baseQuantity ?? soldItem?.quantity ?? 1) / (soldItem?.quantity || 1))),
        };
    });
}
export function createMemoryDataAccess() {
    return {
        products: {
            async listProducts() {
                return listCatalogProducts();
            },
            async listMovements() {
                return listStockMovements();
            },
            async adjustStock(input) {
                return adjustProductStock(input);
            },
            async createProduct(input) {
                return createCatalogProduct(input);
            },
            async updateProduct(productId, input) {
                return updateCatalogProduct(productId, input);
            },
            async deleteProduct(productId) {
                return deleteCatalogProduct(productId);
            },
        },
        sales: {
            async listInvoices() {
                return listSaleInvoices();
            },
            async createInvoice(input) {
                const currentProducts = listCatalogProducts();
                const customer = input.customerId ? findCustomerById(input.customerId) : null;
                if (input.customerId && !customer) {
                    throw new Error('العميل المحدد غير موجود.');
                }
                const storedItems = input.items.map((item) => {
                    const product = currentProducts.find((entry) => entry.id === item.productId);
                    if (!product) {
                        throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`);
                    }
                    const unitCost = roundMoney(product.purchasePrice);
                    const lineCost = roundMoney(unitCost * item.baseQuantity);
                    return {
                        id: createId('sale-item'),
                        ...item,
                        unitCost,
                        lineCost,
                        lineProfit: roundMoney(item.lineTotal - lineCost),
                    };
                });
                applySaleToInventory(input.items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    quantity: item.baseQuantity,
                })));
                const paidIqd = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0));
                const remainingAmountIqd = roundMoney(Math.max(0, input.totalAmount - paidIqd));
                if (customer && remainingAmountIqd > 0.01) {
                    adjustCustomerBalance(customer.id, remainingAmountIqd);
                }
                return createSaleInvoice({
                    ...input,
                    customerName: customer?.name ?? input.customerName,
                }, storedItems);
            },
            async createReturn(invoiceId, input) {
                const invoice = findSaleInvoiceById(invoiceId);
                if (!invoice) {
                    throw new Error('الفاتورة المطلوبة غير موجودة.');
                }
                const inventoryLines = mapReturnLinesToInventory(invoiceId, input);
                restoreSaleToInventory(inventoryLines, input.reason);
                createSaleReturn(invoice, input);
                return invoice;
            },
        },
        purchases: {
            async listReceipts() {
                return listPurchaseReceipts();
            },
            async createReceipt(input) {
                const supplier = input.supplierId ? findSupplierById(input.supplierId) : null;
                if (input.supplierId && !supplier) {
                    throw new Error('المورد المحدد غير موجود.');
                }
                const items = input.items.map((item) => {
                    const unitCostIqd = input.currencyCode === 'USD'
                        ? roundMoney(item.unitCost * input.exchangeRate)
                        : roundMoney(item.unitCost);
                    const product = item.productId
                        ? listCatalogProducts().find((entry) => entry.id === item.productId)
                        : createCatalogProduct(createPurchasedProductInput(item.productDraft, item.entryUnit, unitCostIqd));
                    if (!product) {
                        throw new Error('أحد الأصناف المختارة غير موجود في الكتالوج.');
                    }
                    const wholesaleQuantity = product.wholesaleQuantity ?? 1;
                    const isWholesaleEntry = item.entryUnit === 'wholesale' && product.wholesaleUnit && wholesaleQuantity > 0;
                    const baseQuantity = roundQuantity(item.quantity * (isWholesaleEntry ? wholesaleQuantity : 1));
                    const retailUnitCostIqd = roundMoney(unitCostIqd / (isWholesaleEntry ? wholesaleQuantity : 1));
                    return {
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
                    };
                });
                const purchaseDateLabel = input.purchaseDate || new Date().toISOString().slice(0, 10);
                const supplierInvoiceLabel = input.supplierInvoiceNo?.trim();
                const movementNote = [
                    `استلام شراء${supplier?.name || input.supplierName ? ` من ${supplier?.name ?? input.supplierName}` : ''}`,
                    `بتاريخ ${purchaseDateLabel}`,
                    supplierInvoiceLabel ? `قائمة ${supplierInvoiceLabel}` : null,
                ].filter(Boolean).join(' | ');
                receivePurchaseToInventory(items.map((item) => ({
                    productId: item.productId,
                    name: item.name,
                    quantity: item.quantity,
                    retailQuantity: item.baseQuantity,
                    retailUnitCost: item.retailUnitCostIqd,
                    wholesaleUnitCost: item.wholesaleUnitCostIqd,
                })), movementNote);
                const totalCostIqd = roundMoney(items.reduce((sum, item) => sum + item.lineTotalIqd, 0));
                if (supplier) {
                    adjustSupplierBalance(supplier.id, totalCostIqd);
                }
                return createPurchaseReceipt({
                    ...input,
                    supplierName: supplier?.name ?? input.supplierName,
                    purchaseDate: purchaseDateLabel,
                    supplierInvoiceNo: supplierInvoiceLabel || undefined,
                }, items, {
                    totalCost: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)),
                    totalCostIqd,
                });
            },
        },
        customers: {
            async listCustomers() {
                return listCustomers();
            },
            async listPayments(customerId) {
                if (!findCustomerById(customerId)) {
                    throw new Error('العميل المطلوب غير موجود.');
                }
                return listCustomerPayments(customerId);
            },
            async createCustomer(input) {
                return createCustomer(input);
            },
            async updateCustomer(customerId, input) {
                return updateCustomer(customerId, input);
            },
            async createPayment(customerId, input) {
                const customer = findCustomerById(customerId);
                if (!customer) {
                    throw new Error('العميل المطلوب غير موجود.');
                }
                const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount);
                if (amountIqd - customer.currentBalance > 0.01) {
                    throw new Error('قيمة التسديد تتجاوز الرصيد المستحق على العميل.');
                }
                adjustCustomerBalance(customerId, -amountIqd);
                return createCustomerPayment({
                    customerId,
                    customerName: customer.name,
                    currencyCode: input.currencyCode,
                    exchangeRate: input.exchangeRate,
                    amount: input.amount,
                    amountIqd,
                    notes: input.notes || undefined,
                });
            },
            async deleteCustomer(customerId) {
                return deleteCustomer(customerId);
            },
        },
        suppliers: {
            async listSuppliers() {
                return listSuppliers();
            },
            async listPayments(supplierId) {
                if (!findSupplierById(supplierId)) {
                    throw new Error('المورد المطلوب غير موجود.');
                }
                return listSupplierPayments(supplierId);
            },
            async createSupplier(input) {
                return createSupplier({
                    name: input.name,
                    phone: input.phone || undefined,
                });
            },
            async updateSupplier(supplierId, input) {
                return updateSupplier(supplierId, {
                    name: input.name,
                    phone: input.phone || undefined,
                });
            },
            async createPayment(supplierId, input) {
                const supplier = findSupplierById(supplierId);
                if (!supplier) {
                    throw new Error('المورد المطلوب غير موجود.');
                }
                const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount);
                if (amountIqd - supplier.currentBalance > 0.01) {
                    throw new Error('قيمة الدفعة تتجاوز الرصيد المستحق على المورد.');
                }
                adjustSupplierBalance(supplierId, -amountIqd);
                return createSupplierPayment({
                    supplierId,
                    supplierName: supplier.name,
                    currencyCode: input.currencyCode,
                    exchangeRate: input.exchangeRate,
                    amount: input.amount,
                    amountIqd,
                    notes: input.notes || undefined,
                });
            },
            async deleteSupplier(supplierId) {
                return deleteSupplier(supplierId);
            },
        },
    };
}
