import { createHash, randomUUID } from 'node:crypto';
import { DEFAULT_ADMIN_PIN, DEFAULT_ADMIN_USERNAME, buildEmployeeCumulativePayrollSummary, buildMonthlyPayrollSummary, isEmployeeCompensationOutflow, resolveEmployeeCompensationInput } from '../modules/employees/store.js';
import { resolveSaleReturnSettlement } from '../modules/sales/store.js';
import { normalizeSystemSettings } from '../modules/settings/store.js';
import { buildShiftFinancialSummary } from '../modules/shifts/summary.js';
import { seedPostgresDefaults } from './postgres.js';
function createId(prefix) {
    return `${prefix}-${randomUUID()}`;
}
function hashPin(pin) {
    return createHash('sha256').update(pin).digest('hex');
}
function asNumber(value) {
    return typeof value === 'number' ? value : Number(value);
}
function toIsoString(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function roundQuantity(value) {
    return Number(value.toFixed(3));
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
const FINAL_CASH_LABEL = 'FINAL CASH';
const FINAL_CASH_METADATA_PREFIX = '__FINAL_CASH_ALLOC__:';
function sortOperationalAccounts(accounts) {
    const weightByCode = { revenue: 0, capital: 1 };
    return [...accounts].sort((left, right) => (weightByCode[left.code] ?? 99) - (weightByCode[right.code] ?? 99));
}
function encodeFinalCashMetadata(notes, allocations) {
    const encodedAllocations = Buffer.from(JSON.stringify(allocations), 'utf8').toString('base64url');
    const trimmedNotes = notes?.trim() || '';
    return `${FINAL_CASH_METADATA_PREFIX}${encodedAllocations}${trimmedNotes ? `\n${trimmedNotes}` : ''}`;
}
function parseFinalCashMetadata(notes) {
    if (!notes?.startsWith(FINAL_CASH_METADATA_PREFIX)) {
        return {
            publicNotes: notes ?? undefined,
            allocations: [],
        };
    }
    const [header, ...rest] = notes.split('\n');
    const encodedAllocations = header.slice(FINAL_CASH_METADATA_PREFIX.length);
    try {
        const allocations = JSON.parse(Buffer.from(encodedAllocations, 'base64url').toString('utf8'));
        return {
            publicNotes: rest.join('\n').trim() || undefined,
            allocations,
        };
    }
    catch {
        return {
            publicNotes: notes,
            allocations: [],
        };
    }
}
function buildPurchasedProductInput(draft, entryUnit, unitCostIqd) {
    const hasWholesale = Boolean(draft.wholesaleUnit && draft.wholesaleQuantity && draft.wholesaleQuantity > 0);
    const wholesaleQuantity = draft.wholesaleQuantity ?? 1;
    const usesWholesaleCost = entryUnit === 'wholesale' && hasWholesale;
    const retailPurchasePrice = usesWholesaleCost
        ? roundMoney(unitCostIqd / wholesaleQuantity)
        : roundMoney(unitCostIqd);
    return {
        name: draft.name,
        productFamilyName: draft.productFamilyName || draft.name,
        variantLabel: draft.variantLabel || undefined,
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
function mapProductRow(row) {
    const retailPurchasePrice = row.retail_purchase_price !== null ? asNumber(row.retail_purchase_price) : asNumber(row.purchase_price);
    const retailSalePrice = row.retail_sale_price !== null ? asNumber(row.retail_sale_price) : asNumber(row.unit_price);
    return {
        id: row.id,
        name: row.name,
        productFamilyName: row.product_family_name ?? row.name,
        variantLabel: row.variant_label ?? undefined,
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
    };
}
function mapMovementRow(row) {
    return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        movementType: row.movement_type,
        quantityDelta: asNumber(row.quantity_delta),
        balanceAfter: asNumber(row.balance_after),
        note: row.note,
        createdAt: toIsoString(row.created_at),
    };
}
function mapInventoryBatchRow(row) {
    return {
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        source: row.source,
        batchNo: row.batch_no ?? undefined,
        expiryDate: row.expiry_date ? toIsoString(row.expiry_date).slice(0, 10) : undefined,
        purchaseDate: row.purchase_date ? toIsoString(row.purchase_date).slice(0, 10) : undefined,
        supplierName: row.supplier_name ?? undefined,
        receivedQuantity: asNumber(row.received_quantity),
        remainingQuantity: asNumber(row.remaining_quantity),
        retailUnitCost: asNumber(row.retail_unit_cost),
        createdAt: toIsoString(row.created_at),
    };
}
async function loadInvoices(database, invoiceIds) {
    const invoicesResult = invoiceIds && invoiceIds.length > 0
        ? await database.query(`
          select id, invoice_no, payment_status, payment_type, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes, created_at
            , employee_id, employee_name, shift_id, terminal_name
          from app_sale_invoices
          where id = any($1::text[])
          order by created_at desc
        `, [invoiceIds])
        : await database.query(`
          select id, invoice_no, payment_status, payment_type, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes, created_at, employee_id, employee_name, shift_id, terminal_name
          from app_sale_invoices
          order by created_at desc
        `);
    if (invoicesResult.rows.length === 0) {
        return [];
    }
    const ids = invoicesResult.rows.map((row) => row.id);
    const itemsResult = await database.query(`
      select id, invoice_id, product_id, name, barcode, quantity, base_quantity, unit_cost, unit_price, vat_rate, line_cost, line_total, sale_unit, unit_label, source
      from app_sale_invoice_items
      where invoice_id = any($1::text[])
      order by invoice_id asc, id asc
    `, [ids]);
    const paymentsResult = await database.query(`
      select id, invoice_id, payment_method, currency_code, amount_received, amount_received_iqd, exchange_rate
      from app_sale_invoice_payments
      where invoice_id = any($1::text[])
      order by invoice_id asc, id asc
    `, [ids]);
    const returnsResult = await database.query(`
      select id, invoice_id, reason, settlement_type, cash_refund_iqd, debt_relief_iqd, created_at
      from app_sale_returns
      where invoice_id = any($1::text[])
      order by created_at desc
    `, [ids]);
    const returnIds = returnsResult.rows.map((row) => row.id);
    const returnItemsResult = returnIds.length > 0
        ? await database.query(`
          select id, sale_return_id, invoice_item_id, product_id, quantity
          from app_sale_return_items
          where sale_return_id = any($1::text[])
          order by sale_return_id asc, id asc
        `, [returnIds])
        : { rows: [] };
    const itemsByInvoice = new Map();
    for (const row of itemsResult.rows) {
        const current = itemsByInvoice.get(row.invoice_id) ?? [];
        current.push(row);
        itemsByInvoice.set(row.invoice_id, current);
    }
    const paymentsByInvoice = new Map();
    for (const row of paymentsResult.rows) {
        const current = paymentsByInvoice.get(row.invoice_id) ?? [];
        current.push(row);
        paymentsByInvoice.set(row.invoice_id, current);
    }
    const returnItemsByReturn = new Map();
    for (const row of returnItemsResult.rows) {
        const current = returnItemsByReturn.get(row.sale_return_id) ?? [];
        current.push(row);
        returnItemsByReturn.set(row.sale_return_id, current);
    }
    const returnsByInvoice = new Map();
    for (const row of returnsResult.rows) {
        const current = returnsByInvoice.get(row.invoice_id) ?? [];
        const saleReturnItems = (returnItemsByReturn.get(row.id) ?? []).map((item) => ({
            invoiceItemId: item.invoice_item_id ?? undefined,
            productId: item.product_id,
            quantity: asNumber(item.quantity),
        }));
        const invoiceItems = itemsByInvoice.get(row.invoice_id) ?? [];
        const inferredReturnValueIqd = roundMoney(saleReturnItems.reduce((sum, item) => {
            const soldItem = invoiceItems.find((invoiceItem) => invoiceItem.id === item.invoiceItemId);
            if (!soldItem || asNumber(soldItem.quantity) <= 0) {
                return sum;
            }
            return sum + ((asNumber(soldItem.line_total) / asNumber(soldItem.quantity)) * item.quantity);
        }, 0));
        const cashRefundIqd = asNumber(row.cash_refund_iqd);
        const debtReliefIqd = asNumber(row.debt_relief_iqd);
        current.push({
            id: row.id,
            reason: row.reason,
            settlementType: row.settlement_type,
            returnValueIqd: inferredReturnValueIqd,
            cashRefundIqd: cashRefundIqd > 0 || debtReliefIqd > 0 ? cashRefundIqd : (invoicesResult.rows.find((invoice) => invoice.id === row.invoice_id)?.payment_type === 'cash' ? inferredReturnValueIqd : 0),
            debtReliefIqd: cashRefundIqd > 0 || debtReliefIqd > 0 ? debtReliefIqd : (invoicesResult.rows.find((invoice) => invoice.id === row.invoice_id)?.payment_type === 'credit' ? inferredReturnValueIqd : 0),
            createdAt: toIsoString(row.created_at),
            items: saleReturnItems,
        });
        returnsByInvoice.set(row.invoice_id, current);
    }
    return invoicesResult.rows.map((row) => ({
        id: row.id,
        invoiceNo: row.invoice_no,
        paymentStatus: row.payment_status,
        paymentType: row.payment_type,
        employeeId: row.employee_id ?? '',
        employeeName: row.employee_name ?? 'غير محدد',
        shiftId: row.shift_id ?? '',
        terminalName: row.terminal_name ?? 'غير محدد',
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
        items: (itemsByInvoice.get(row.id) ?? []).map((item) => {
            const lineCost = asNumber(item.line_cost);
            const lineTotal = asNumber(item.line_total);
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
            };
        }),
        payments: (paymentsByInvoice.get(row.id) ?? []).map((payment) => ({
            paymentMethod: payment.payment_method,
            currencyCode: payment.currency_code,
            amountReceived: asNumber(payment.amount_received),
            amountReceivedIqd: asNumber(payment.amount_received_iqd),
            exchangeRate: asNumber(payment.exchange_rate),
        })),
        returns: returnsByInvoice.get(row.id) ?? [],
    }));
}
async function getLockedProduct(database, productId) {
    const result = await database.query(`
      select id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
      , product_family_name, variant_label
      from app_products
      where id = $1
      for update
    `, [productId]);
    return result.rows[0] ?? null;
}
async function insertPurchasedProduct(client, draft, entryUnit, unitCostIqd) {
    const productId = createId('prod');
    const input = buildPurchasedProductInput(draft, entryUnit, unitCostIqd);
    const result = await client.query(`
      insert into app_products (
        id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      returning id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
    `, [
        productId,
        input.name,
        input.productFamilyName ?? input.name,
        input.variantLabel ?? null,
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
    ]);
    return result.rows[0];
}
async function loadPurchaseReceipts(database, receiptIds) {
    const receiptsResult = receiptIds && receiptIds.length > 0
        ? await database.query(`
          select id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes, created_at
          from app_purchase_receipts
          where id = any($1::text[])
          order by created_at desc
        `, [receiptIds])
        : await database.query(`
          select id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes, created_at
          from app_purchase_receipts
          order by created_at desc
        `);
    if (receiptsResult.rows.length === 0) {
        return [];
    }
    const ids = receiptsResult.rows.map((row) => row.id);
    const itemsResult = await database.query(`
      select id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
      from app_purchase_receipt_items
      where receipt_id = any($1::text[])
      order by receipt_id asc, id asc
    `, [ids]);
    const itemsByReceipt = new Map();
    for (const row of itemsResult.rows) {
        const current = itemsByReceipt.get(row.receipt_id) ?? [];
        current.push(row);
        itemsByReceipt.set(row.receipt_id, current);
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
            receiptItemId: item.id,
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
    }));
}
async function loadInventoryBatches(database, productIds) {
    const result = productIds && productIds.length > 0
        ? await database.query(`
          select id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost, created_at
          from app_inventory_batches
          where product_id = any($1::text[])
          order by case when expiry_date is null then 1 else 0 end asc, expiry_date asc, created_at asc
        `, [productIds])
        : await database.query(`
          select id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost, created_at
          from app_inventory_batches
          order by case when expiry_date is null then 1 else 0 end asc, expiry_date asc, created_at asc
        `);
    return result.rows.map(mapInventoryBatchRow);
}
async function getLockedOpeningBatch(client, productId) {
    const result = await client.query(`
      select id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost, created_at
      from app_inventory_batches
      where product_id = $1 and source = 'opening'
      for update
    `, [productId]);
    return result.rows[0] ?? null;
}
async function getPurchaseBatchRemaining(client, productId) {
    const result = await client.query(`
      select coalesce(sum(remaining_quantity), 0) as remaining_quantity
      from app_inventory_batches
      where product_id = $1 and source = 'purchase'
    `, [productId]);
    return roundQuantity(asNumber(result.rows[0]?.remaining_quantity ?? 0));
}
async function syncOpeningBatch(client, product) {
    const purchaseRemaining = await getPurchaseBatchRemaining(client, product.id);
    const desiredQuantity = roundQuantity(Math.max(0, asNumber(product.stock_qty) - purchaseRemaining));
    const openingBatch = await getLockedOpeningBatch(client, product.id);
    if (!openingBatch && desiredQuantity <= 0) {
        return;
    }
    if (!openingBatch) {
        await client.query(`
        insert into app_inventory_batches (
          id, product_id, product_name, source, received_quantity, remaining_quantity, retail_unit_cost
        )
        values ($1, $2, $3, 'opening', $4, $4, $5)
      `, [createId('batch'), product.id, product.name, desiredQuantity, asNumber(product.purchase_price)]);
        return;
    }
    const currentRemaining = asNumber(openingBatch.remaining_quantity);
    const nextReceived = desiredQuantity > currentRemaining
        ? roundQuantity(asNumber(openingBatch.received_quantity) + (desiredQuantity - currentRemaining))
        : asNumber(openingBatch.received_quantity);
    await client.query(`
      update app_inventory_batches
      set product_name = $2,
          received_quantity = $3,
          remaining_quantity = $4,
          retail_unit_cost = $5
      where id = $1
    `, [openingBatch.id, product.name, nextReceived, desiredQuantity, asNumber(product.purchase_price)]);
}
async function loadConsumableBatches(client, productId) {
    const result = await client.query(`
      select id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost, created_at
      from app_inventory_batches
      where product_id = $1 and remaining_quantity > 0
      order by case when expiry_date is null then 1 else 0 end asc, expiry_date asc, created_at asc
      for update
    `, [productId]);
    return result.rows;
}
async function consumeInventoryBatchesForSale(client, input) {
    const batches = await loadConsumableBatches(client, input.productId);
    const availableQuantity = roundQuantity(batches.reduce((sum, batch) => sum + asNumber(batch.remaining_quantity), 0));
    if (roundQuantity(input.quantity) > availableQuantity) {
        throw new Error('تعذر توزيع الكمية المباعة على الدفعات المتاحة.');
    }
    let remainingToConsume = roundQuantity(input.quantity);
    for (const batch of batches) {
        if (remainingToConsume <= 0) {
            break;
        }
        const consumedQuantity = roundQuantity(Math.min(asNumber(batch.remaining_quantity), remainingToConsume));
        if (consumedQuantity <= 0) {
            continue;
        }
        await client.query('update app_inventory_batches set remaining_quantity = $1 where id = $2', [roundQuantity(asNumber(batch.remaining_quantity) - consumedQuantity), batch.id]);
        await client.query(`
        insert into app_sale_item_batch_allocations (
          id, sale_item_id, product_id, batch_id, quantity, returned_quantity
        )
        values ($1, $2, $3, $4, $5, 0)
      `, [createId('allocation'), input.saleItemId, input.productId, batch.id, consumedQuantity]);
        remainingToConsume = roundQuantity(remainingToConsume - consumedQuantity);
    }
}
async function restoreInventoryBatchesForSaleReturn(client, input) {
    const allocationsResult = await client.query(`
      select id, sale_item_id, product_id, batch_id, quantity, returned_quantity, created_at
      from app_sale_item_batch_allocations
      where sale_item_id = $1 and returned_quantity < quantity
      order by created_at asc
      for update
    `, [input.saleItemId]);
    let remainingToRestore = roundQuantity(input.quantity);
    for (const allocation of allocationsResult.rows) {
        if (remainingToRestore <= 0) {
            break;
        }
        const restorableQuantity = roundQuantity(asNumber(allocation.quantity) - asNumber(allocation.returned_quantity));
        const restoredQuantity = roundQuantity(Math.min(restorableQuantity, remainingToRestore));
        if (restoredQuantity <= 0) {
            continue;
        }
        await client.query('update app_inventory_batches set remaining_quantity = remaining_quantity + $1 where id = $2', [restoredQuantity, allocation.batch_id]);
        await client.query('update app_sale_item_batch_allocations set returned_quantity = $1 where id = $2', [roundQuantity(asNumber(allocation.returned_quantity) + restoredQuantity), allocation.id]);
        remainingToRestore = roundQuantity(remainingToRestore - restoredQuantity);
    }
    return roundQuantity(input.quantity - remainingToRestore);
}
function mapSupplierRow(row) {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone ?? undefined,
        currentBalance: asNumber(row.current_balance),
        isActive: row.is_active,
        createdAt: toIsoString(row.created_at),
    };
}
function mapSupplierPaymentRow(row) {
    return {
        id: row.id,
        paymentNo: row.payment_no,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        currencyCode: row.currency_code,
        exchangeRate: asNumber(row.exchange_rate),
        amount: asNumber(row.amount),
        amountIqd: asNumber(row.amount_iqd),
        sourceFundAccountId: row.source_fund_account_id ?? undefined,
        sourceFundAccountName: row.source_fund_account_name ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: toIsoString(row.created_at),
    };
}
function mapCustomerRow(row) {
    return {
        id: row.id,
        name: row.name,
        phone: row.phone ?? undefined,
        address: row.address ?? undefined,
        notes: row.notes ?? undefined,
        currentBalance: asNumber(row.current_balance),
        isActive: row.is_active,
        createdAt: toIsoString(row.created_at),
    };
}
function mapCustomerPaymentRow(row) {
    return {
        id: row.id,
        paymentNo: row.payment_no,
        customerId: row.customer_id,
        customerName: row.customer_name,
        currencyCode: row.currency_code,
        exchangeRate: asNumber(row.exchange_rate),
        amount: asNumber(row.amount),
        amountIqd: asNumber(row.amount_iqd),
        shiftId: row.shift_id ?? undefined,
        terminalName: row.terminal_name ?? undefined,
        destinationFundAccountId: row.destination_fund_account_id ?? undefined,
        destinationFundAccountName: row.destination_fund_account_name ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: toIsoString(row.created_at),
    };
}
function mapFundAccountRow(row) {
    return {
        id: row.id,
        name: row.name,
        code: row.code,
        type: row.account_type,
        currentBalanceIqd: asNumber(row.current_balance_iqd),
        isSystem: row.is_system,
        isActive: row.is_active,
        createdAt: toIsoString(row.created_at),
    };
}
function mapFundMovementRow(row) {
    const movementDate = toIsoString(row.movement_date);
    const { publicNotes, allocations } = parseFinalCashMetadata(row.notes);
    return {
        id: row.id,
        movementNo: row.movement_no,
        movementDate: movementDate.slice(0, 10),
        direction: row.direction,
        amountIqd: asNumber(row.amount_iqd),
        sourceFundAccountId: row.source_fund_account_id ?? undefined,
        sourceFundAccountName: row.source_fund_account_name ?? undefined,
        destinationFundAccountId: row.destination_fund_account_id ?? undefined,
        destinationFundAccountName: row.destination_fund_account_name ?? undefined,
        reason: row.reason,
        referenceType: row.reference_type,
        referenceId: row.reference_id ?? undefined,
        counterpartyName: row.counterparty_name ?? undefined,
        notes: publicNotes,
        createdByEmployeeId: row.created_by_employee_id ?? undefined,
        createdByEmployeeName: row.created_by_employee_name ?? undefined,
        createdAt: toIsoString(row.created_at),
        allocationBreakdown: allocations.map((allocation) => ({
            fundAccountId: allocation.fundAccountId,
            fundAccountName: '',
            amountIqd: allocation.amountIqd,
        })),
    };
}
function mapEmployeeRow(row) {
    return {
        id: row.id,
        employeeNo: row.employee_no,
        username: row.username ?? undefined,
        name: row.name,
        role: row.role,
        startDate: row.start_date ? toIsoString(row.start_date).slice(0, 10) : undefined,
        monthlySalaryIqd: row.monthly_salary_iqd !== null ? asNumber(row.monthly_salary_iqd) : undefined,
        employmentStatus: row.employment_status ?? 'active',
        serviceEndDate: row.service_end_date ? toIsoString(row.service_end_date).slice(0, 10) : undefined,
        notes: row.notes ?? undefined,
        isActive: row.is_active,
        createdAt: toIsoString(row.created_at),
    };
}
function mapEmployeeCompensationRow(row) {
    const paymentDate = toIsoString(row.payment_date);
    return {
        id: row.id,
        paymentNo: row.payment_no,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        kind: row.kind,
        amountIqd: asNumber(row.amount_iqd),
        calculationMethod: row.calculation_method,
        paymentMethod: row.payment_method ?? undefined,
        paymentDate: paymentDate.slice(0, 10),
        periodLabel: row.period_label ?? undefined,
        notes: row.notes ?? undefined,
        createdByEmployeeId: row.created_by_employee_id,
        createdByEmployeeName: row.created_by_employee_name,
        createdAt: toIsoString(row.created_at),
    };
}
function mapEmployeeAbsenceRow(row) {
    return {
        id: row.id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        absenceDate: toIsoString(row.absence_date).slice(0, 10),
        deductionDays: asNumber(row.deduction_days),
        notes: row.notes ?? undefined,
        createdByEmployeeId: row.created_by_employee_id,
        createdByEmployeeName: row.created_by_employee_name,
        createdAt: toIsoString(row.created_at),
    };
}
function mapShiftRow(row) {
    const hasClosingSummary = row.invoices_count !== null;
    return {
        id: row.id,
        shiftNo: row.shift_no,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        terminalName: row.terminal_name,
        openingFloatIqd: asNumber(row.opening_float_iqd),
        openingNote: row.opening_note ?? undefined,
        openedAt: toIsoString(row.opened_at),
        closedAt: row.closed_at ? toIsoString(row.closed_at) : undefined,
        closingNote: row.closing_note ?? undefined,
        closingCashIqd: row.closing_cash_iqd !== null ? asNumber(row.closing_cash_iqd) : undefined,
        remittedToFundAccountId: row.remitted_to_fund_account_id ?? undefined,
        remittedToFundAccountName: row.remitted_to_fund_account_name ?? undefined,
        remittanceMovementId: row.remittance_movement_id ?? undefined,
        cashDifferenceIqd: row.cash_difference_iqd !== null ? asNumber(row.cash_difference_iqd) : undefined,
        closingSummary: hasClosingSummary ? {
            invoicesCount: row.invoices_count ?? 0,
            returnsCount: row.returns_count ?? 0,
            grossSalesIqd: row.gross_sales_iqd !== null ? asNumber(row.gross_sales_iqd) : 0,
            returnsValueIqd: row.returns_value_iqd !== null ? asNumber(row.returns_value_iqd) : 0,
            netSalesIqd: row.net_sales_iqd !== null ? asNumber(row.net_sales_iqd) : 0,
            invoiceCollectionsIqd: row.invoice_collections_iqd !== null ? asNumber(row.invoice_collections_iqd) : 0,
            customerPaymentsCount: row.customer_payments_count ?? 0,
            customerPaymentsIqd: row.customer_payments_iqd !== null ? asNumber(row.customer_payments_iqd) : 0,
            collectedCashIqd: row.collected_cash_iqd !== null ? asNumber(row.collected_cash_iqd) : 0,
            creditSalesIqd: row.credit_sales_iqd !== null ? asNumber(row.credit_sales_iqd) : 0,
            expectedCashIqd: row.expected_cash_iqd !== null ? asNumber(row.expected_cash_iqd) : 0,
        } : undefined,
        status: row.status,
    };
}
function mapExpenseCategoryRow(row) {
    return {
        id: row.id,
        name: row.name,
        code: row.code,
        kind: row.kind,
        description: row.description ?? undefined,
        isSystem: row.is_system,
        isActive: row.is_active,
        createdAt: toIsoString(row.created_at),
    };
}
function mapExpenseRow(row) {
    const expenseDate = toIsoString(row.expense_date);
    return {
        id: row.id,
        expenseNo: row.expense_no,
        expenseDate: expenseDate.slice(0, 10),
        categoryId: row.category_id,
        categoryName: row.category_name,
        categoryKind: row.category_kind,
        amountIqd: asNumber(row.amount_iqd),
        paymentMethod: row.payment_method,
        beneficiaryName: row.beneficiary_name ?? undefined,
        notes: row.notes ?? undefined,
        createdByEmployeeId: row.created_by_employee_id,
        createdByEmployeeName: row.created_by_employee_name,
        sourceFundAccountId: row.source_fund_account_id ?? undefined,
        sourceFundAccountName: row.source_fund_account_name ?? undefined,
        shiftId: row.shift_id ?? undefined,
        referenceType: row.reference_type,
        referenceId: row.reference_id ?? undefined,
        status: row.status,
        createdAt: toIsoString(row.created_at),
    };
}
function mapSystemSettingsRow(row) {
    return normalizeSystemSettings({
        ...(row.payload ?? {}),
        updatedAt: toIsoString(row.updated_at),
    });
}
async function loadSystemSettings(database) {
    const result = await database.query(`
      select id, payload, updated_at
      from app_system_settings
      where id = $1
    `, ['system-settings']);
    if (!result.rows[0]) {
        return normalizeSystemSettings();
    }
    return mapSystemSettingsRow(result.rows[0]);
}
async function getLockedSupplier(database, supplierId) {
    const result = await database.query(`
      select id, name, phone, current_balance, is_active, created_at
      from app_suppliers
      where id = $1
      for update
    `, [supplierId]);
    return result.rows[0] ?? null;
}
async function getLockedCustomer(database, customerId) {
    const result = await database.query(`
      select id, name, phone, address, notes, current_balance, is_active, created_at
      from app_customers
      where id = $1
      for update
    `, [customerId]);
    return result.rows[0] ?? null;
}
async function getLockedEmployee(database, employeeId) {
    const result = await database.query(`
      select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, pin_hash, notes, is_active, created_at
      , payroll_type, payroll_rate_iqd
      from app_employees
      where id = $1
      for update
    `, [employeeId]);
    return result.rows[0] ?? null;
}
async function getLockedEmployeeAbsence(database, employeeId, absenceId) {
    const result = await database.query(`
      select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
      from app_employee_absences
      where id = $1 and employee_id = $2
      for update
    `, [absenceId, employeeId]);
    return result.rows[0] ?? null;
}
async function getLockedShift(database, shiftId) {
    const result = await database.query(`
      select id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status
        , closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id, invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
      from app_cashier_shifts
      where id = $1
      for update
    `, [shiftId]);
    return result.rows[0] ?? null;
}
async function getLockedExpenseCategory(database, categoryId) {
    const result = await database.query(`
      select id, name, code, kind, description, is_system, is_active, created_at
      from app_expense_categories
      where id = $1
      for update
    `, [categoryId]);
    return result.rows[0] ?? null;
}
async function getLockedExpenseCategoryByCode(database, code) {
    const result = await database.query(`
      select id, name, code, kind, description, is_system, is_active, created_at
      from app_expense_categories
      where lower(code) = lower($1)
      for update
    `, [code]);
    return result.rows[0] ?? null;
}
async function getLockedFundAccount(database, accountId) {
    const result = await database.query(`
      select id, name, code, account_type, current_balance_iqd, is_system, is_active, created_at
      from app_fund_accounts
      where id = $1
      for update
    `, [accountId]);
    return result.rows[0] ?? null;
}
async function getLockedFundAccountByCode(database, code) {
    const result = await database.query(`
      select id, name, code, account_type, current_balance_iqd, is_system, is_active, created_at
      from app_fund_accounts
      where lower(code) = lower($1)
      for update
    `, [code]);
    return result.rows[0] ?? null;
}
async function loadFundAccounts(database) {
    const result = await database.query(`
      select id, name, code, account_type, current_balance_iqd, is_system, is_active, created_at
      from app_fund_accounts
      order by is_system desc, name asc
    `);
    return result.rows.map(mapFundAccountRow);
}
async function loadFundMovements(database) {
    const result = await database.query(`
      select id, movement_no, movement_date, direction, amount_iqd,
             source_fund_account_id, source_fund_account_name,
             destination_fund_account_id, destination_fund_account_name,
             reason, reference_type, reference_id, counterparty_name,
             notes, created_by_employee_id, created_by_employee_name, created_at
      from app_fund_movements
      order by movement_date desc, created_at desc
    `);
    return result.rows.map(mapFundMovementRow);
}
async function loadFundMovementById(database, movementId) {
    const result = await database.query(`
      select id, movement_no, movement_date, direction, amount_iqd,
             source_fund_account_id, source_fund_account_name,
             destination_fund_account_id, destination_fund_account_name,
             reason, reference_type, reference_id, counterparty_name,
             notes, created_by_employee_id, created_by_employee_name, created_at
      from app_fund_movements
      where id = $1
    `, [movementId]);
    return result.rows[0] ? mapFundMovementRow(result.rows[0]) : null;
}
async function loadCapitalTransactions(database) {
    const result = await database.query(`
      select id, movement_no, movement_date, direction, amount_iqd,
             source_fund_account_id, source_fund_account_name,
             destination_fund_account_id, destination_fund_account_name,
             reason, reference_type, reference_id, counterparty_name,
             notes, created_by_employee_id, created_by_employee_name, created_at
      from app_fund_movements
      where reference_type = 'capital-transaction'
      order by movement_date desc, created_at desc
    `);
    return result.rows.map(mapFundMovementRow);
}
async function getCapitalTransactionRowForUpdate(client, movementId) {
    const result = await client.query(`
      select id, movement_no, movement_date, direction, amount_iqd,
             source_fund_account_id, source_fund_account_name,
             destination_fund_account_id, destination_fund_account_name,
             reason, reference_type, reference_id, counterparty_name,
             notes, created_by_employee_id, created_by_employee_name, created_at
      from app_fund_movements
      where id = $1 and reference_type = 'capital-transaction'
      for update
    `, [movementId]);
    return result.rows[0] ?? null;
}
async function getCapitalContributorBalance(client, contributorName, excludedMovementId) {
    const result = excludedMovementId
        ? await client.query(`
          select coalesce(sum(
            case
              when reason = 'capital-contribution' then amount_iqd
              when reason = 'capital-repayment' then -amount_iqd
              else 0
            end
          ), 0) as balance_iqd
          from app_fund_movements
          where reference_type = 'capital-transaction'
            and lower(trim(coalesce(counterparty_name, ''))) = lower(trim($1))
            and id <> $2
        `, [contributorName, excludedMovementId])
        : await client.query(`
          select coalesce(sum(
            case
              when reason = 'capital-contribution' then amount_iqd
              when reason = 'capital-repayment' then -amount_iqd
              else 0
            end
          ), 0) as balance_iqd
          from app_fund_movements
          where reference_type = 'capital-transaction'
            and lower(trim(coalesce(counterparty_name, ''))) = lower(trim($1))
        `, [contributorName]);
    return roundMoney(asNumber(result.rows[0]?.balance_iqd ?? 0));
}
async function reverseFundMovementEntry(client, movement) {
    const amountIqd = roundMoney(asNumber(movement.amount_iqd));
    const { allocations } = parseFinalCashMetadata(movement.notes);
    if (!movement.source_fund_account_id && movement.source_fund_account_name === FINAL_CASH_LABEL && allocations.length) {
        for (const allocation of allocations) {
            const sourceAccount = await getLockedFundAccount(client, allocation.fundAccountId);
            if (!sourceAccount || !sourceAccount.is_active) {
                throw new Error('لا يمكن عكس الحركة لأن أحد صناديق الرصيد النقدي النهائي غير موجود أو غير مفعل.');
            }
            await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [sourceAccount.id, roundMoney(asNumber(sourceAccount.current_balance_iqd) + allocation.amountIqd)]);
        }
        return;
    }
    if (movement.source_fund_account_id) {
        const sourceAccount = await getLockedFundAccount(client, movement.source_fund_account_id);
        if (!sourceAccount || !sourceAccount.is_active) {
            throw new Error('لا يمكن عكس الحركة لأن الصندوق المصدر غير موجود أو غير مفعل.');
        }
        await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [sourceAccount.id, roundMoney(asNumber(sourceAccount.current_balance_iqd) + amountIqd)]);
    }
    if (movement.destination_fund_account_id) {
        const destinationAccount = await getLockedFundAccount(client, movement.destination_fund_account_id);
        if (!destinationAccount || !destinationAccount.is_active) {
            throw new Error('لا يمكن عكس الحركة لأن الصندوق المستلم غير موجود أو غير مفعل.');
        }
        if (asNumber(destinationAccount.current_balance_iqd) + 0.01 < amountIqd) {
            throw new Error(`لا يمكن حذف أو تعديل الحركة لأن رصيد ${destinationAccount.name} الحالي لا يسمح بعكسها.`);
        }
        await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [destinationAccount.id, roundMoney(asNumber(destinationAccount.current_balance_iqd) - amountIqd)]);
    }
}
async function resolveFinalCashAllocations(client, amountIqd) {
    const operationalAccounts = sortOperationalAccounts([
        await getLockedFundAccountByCode(client, 'revenue'),
        await getLockedFundAccountByCode(client, 'capital'),
    ].filter((account) => Boolean(account && account.is_active)));
    const totalBalanceIqd = operationalAccounts.reduce((sum, account) => sum + asNumber(account.current_balance_iqd), 0);
    if (totalBalanceIqd + 0.01 < amountIqd) {
        throw new Error(`الرصيد النقدي النهائي الحالي هو ${roundMoney(totalBalanceIqd).toFixed(2)} د.ع فقط، ولا يكفي لإتمام العملية.`);
    }
    let remainingIqd = roundMoney(amountIqd);
    const allocations = [];
    for (const account of operationalAccounts) {
        const accountBalanceIqd = roundMoney(asNumber(account.current_balance_iqd));
        if (remainingIqd <= 0.01 || accountBalanceIqd <= 0.01) {
            continue;
        }
        const allocatedAmountIqd = roundMoney(Math.min(accountBalanceIqd, remainingIqd));
        if (allocatedAmountIqd <= 0.01) {
            continue;
        }
        allocations.push({ fundAccountId: account.id, amountIqd: allocatedAmountIqd });
        remainingIqd = roundMoney(remainingIqd - allocatedAmountIqd);
    }
    if (remainingIqd > 0.01) {
        throw new Error('تعذر توزيع مبلغ الصرف على الرصيد النقدي النهائي المتاح.');
    }
    return allocations;
}
async function createFinalCashOutflowEntry(client, input) {
    if (!Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
        throw new Error('مبلغ حركة الصندوق يجب أن يكون أكبر من صفر.');
    }
    const amountIqd = roundMoney(input.amountIqd);
    const allocations = await resolveFinalCashAllocations(client, amountIqd);
    for (const allocation of allocations) {
        const account = await getLockedFundAccount(client, allocation.fundAccountId);
        if (!account || !account.is_active) {
            throw new Error('أحد صناديق الرصيد النقدي النهائي غير موجود أو غير مفعل.');
        }
        await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [account.id, roundMoney(asNumber(account.current_balance_iqd) - allocation.amountIqd)]);
    }
    const movementId = createId('fund-movement');
    const movementNo = await generateFundMovementNo(client);
    await client.query(`
      insert into app_fund_movements (
        id, movement_no, movement_date, direction, amount_iqd,
        source_fund_account_id, source_fund_account_name,
        destination_fund_account_id, destination_fund_account_name,
        reason, reference_type, reference_id, counterparty_name,
        notes, created_by_employee_id, created_by_employee_name
      )
      values ($1, $2, $3::date, 'outflow', $4, null, $5, null, null, $6, $7, $8, $9, $10, $11, $12)
    `, [
        movementId,
        movementNo,
        input.movementDate,
        amountIqd,
        FINAL_CASH_LABEL,
        input.reason,
        input.referenceType,
        input.referenceId ?? null,
        input.counterpartyName?.trim() || null,
        encodeFinalCashMetadata(input.notes, allocations),
        input.createdByEmployeeId ?? null,
        input.createdByEmployeeName ?? null,
    ]);
    return {
        id: movementId,
        movementNo,
        sourceAccount: null,
        destinationAccount: null,
    };
}
async function createCapitalTransactionEntry(client, input) {
    const capitalFund = await getLockedFundAccountByCode(client, 'capital');
    if (!capitalFund || !capitalFund.is_active) {
        throw new Error('الصناديق الأساسية غير معرفة أو غير مفعلة.');
    }
    if (input.movementType === 'repayment') {
        const contributorBalanceIqd = await getCapitalContributorBalance(client, input.contributorName);
        if (contributorBalanceIqd + 0.01 < input.amountIqd) {
            throw new Error('لا يمكن سحب مبلغ أكبر من الرصيد الصافي للمساهم داخل حساب رأس المال.');
        }
    }
    const movement = input.movementType === 'contribution'
        ? await createFundMovementEntry(client, {
            movementDate: input.movementDate,
            direction: 'inflow',
            amountIqd: input.amountIqd,
            destinationFundAccountId: capitalFund.id,
            reason: 'capital-contribution',
            referenceType: 'capital-transaction',
            counterpartyName: input.contributorName,
            notes: input.notes,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
        })
        : await createFinalCashOutflowEntry(client, {
            movementDate: input.movementDate,
            amountIqd: input.amountIqd,
            reason: 'capital-repayment',
            referenceType: 'capital-transaction',
            counterpartyName: input.contributorName,
            notes: input.notes,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
        });
    const createdMovement = await loadFundMovementById(client, movement.id);
    if (!createdMovement) {
        throw new Error('تعذر تحميل حركة رأس المال بعد الحفظ.');
    }
    return createdMovement;
}
async function createFundMovementEntry(client, input) {
    if (!Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
        throw new Error('مبلغ حركة الصندوق يجب أن يكون أكبر من صفر.');
    }
    if (input.direction === 'inflow' && !input.destinationFundAccountId) {
        throw new Error('يجب تحديد الصندوق المستلم لحركة القبض.');
    }
    if (input.direction === 'outflow' && !input.sourceFundAccountId) {
        throw new Error('يجب تحديد الصندوق المصدر لحركة الصرف.');
    }
    if (input.direction === 'transfer' && (!input.sourceFundAccountId || !input.destinationFundAccountId)) {
        throw new Error('التحويل بين الصناديق يتطلب تحديد الصندوق المصدر والوجهة.');
    }
    if (input.direction === 'transfer' && input.sourceFundAccountId === input.destinationFundAccountId) {
        throw new Error('لا يمكن التحويل إلى نفس الصندوق.');
    }
    const amountIqd = roundMoney(input.amountIqd);
    const sourceAccount = input.sourceFundAccountId ? await getLockedFundAccount(client, input.sourceFundAccountId) : null;
    const destinationAccount = input.destinationFundAccountId ? await getLockedFundAccount(client, input.destinationFundAccountId) : null;
    if (input.sourceFundAccountId && (!sourceAccount || !sourceAccount.is_active)) {
        throw new Error('صندوق الدفع المحدد غير موجود أو غير مفعل.');
    }
    if (input.destinationFundAccountId && (!destinationAccount || !destinationAccount.is_active)) {
        throw new Error('صندوق القبض المحدد غير موجود أو غير مفعل.');
    }
    if (sourceAccount && asNumber(sourceAccount.current_balance_iqd) + 0.01 < amountIqd) {
        throw new Error(`الرصيد المتاح في ${sourceAccount.name} غير كافٍ لإتمام العملية.`);
    }
    if (sourceAccount) {
        await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [sourceAccount.id, roundMoney(asNumber(sourceAccount.current_balance_iqd) - amountIqd)]);
    }
    if (destinationAccount) {
        await client.query('update app_fund_accounts set current_balance_iqd = $2 where id = $1', [destinationAccount.id, roundMoney(asNumber(destinationAccount.current_balance_iqd) + amountIqd)]);
    }
    const movementId = createId('fund-movement');
    const movementNo = await generateFundMovementNo(client);
    await client.query(`
      insert into app_fund_movements (
        id, movement_no, movement_date, direction, amount_iqd,
        source_fund_account_id, source_fund_account_name,
        destination_fund_account_id, destination_fund_account_name,
        reason, reference_type, reference_id, counterparty_name,
        notes, created_by_employee_id, created_by_employee_name
      )
      values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
        movementId,
        movementNo,
        input.movementDate,
        input.direction,
        amountIqd,
        sourceAccount?.id ?? null,
        sourceAccount?.name ?? null,
        destinationAccount?.id ?? null,
        destinationAccount?.name ?? null,
        input.reason,
        input.referenceType,
        input.referenceId ?? null,
        input.counterpartyName?.trim() || null,
        input.notes?.trim() || null,
        input.createdByEmployeeId ?? null,
        input.createdByEmployeeName ?? null,
    ]);
    return {
        id: movementId,
        movementNo,
        sourceAccount,
        destinationAccount,
    };
}
async function loadSupplierPayments(database, supplierId) {
    const result = await database.query(`
      select id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd,
             source_fund_account_id, source_fund_account_name, notes, created_at
      from app_supplier_payments
      where supplier_id = $1
      order by created_at desc, payment_no desc
    `, [supplierId]);
    return result.rows.map(mapSupplierPaymentRow);
}
async function loadCustomerPayments(database, customerId) {
    const result = await database.query(`
      select id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd,
             shift_id, terminal_name, destination_fund_account_id, destination_fund_account_name, notes, created_at
      from app_customer_payments
      where customer_id = $1
      order by created_at desc, payment_no desc
    `, [customerId]);
    return result.rows.map(mapCustomerPaymentRow);
}
async function loadShiftCustomerPayments(database, shiftId) {
    const result = await database.query(`
      select id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd,
             shift_id, terminal_name, destination_fund_account_id, destination_fund_account_name, notes, created_at
      from app_customer_payments
      where shift_id = $1
      order by created_at asc, payment_no asc
    `, [shiftId]);
    return result.rows.map(mapCustomerPaymentRow);
}
async function getOpenShiftByEmployee(database, employeeId) {
    const result = await database.query(`
      select id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status,
             closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id,
             invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, invoice_collections_iqd,
             customer_payments_count, customer_payments_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
      from app_cashier_shifts
      where employee_id = $1 and status = 'open'
      order by opened_at desc
      limit 1
      for update
    `, [employeeId]);
    return result.rows[0] ?? null;
}
async function buildLiveShiftSummary(database, shift) {
    const invoiceIdsResult = await database.query('select id from app_sale_invoices where shift_id = $1 order by created_at asc', [shift.id]);
    const invoices = invoiceIdsResult.rows.length > 0
        ? await loadInvoices(database, invoiceIdsResult.rows.map((row) => row.id))
        : [];
    const customerPayments = await loadShiftCustomerPayments(database, shift.id);
    return buildShiftFinancialSummary(asNumber(shift.opening_float_iqd), invoices, customerPayments);
}
async function insertStockMovement(database, input) {
    await database.query(`
      insert into app_stock_movements (
        id, product_id, product_name, movement_type, quantity_delta, balance_after, note
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `, [
        input.id,
        input.productId,
        input.productName,
        input.movementType,
        input.quantityDelta,
        input.balanceAfter,
        input.note,
    ]);
}
function mapPostgresError(error, fallbackMessage) {
    if (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505') {
        const detail = 'detail' in error ? String(error.detail ?? '') : '';
        if (detail.includes('(barcode)')) {
            return new Error('الباركود مستخدم مسبقاً لصنف آخر.');
        }
        if (detail.includes('(wholesale_barcode)')) {
            return new Error('باركود الجملة مستخدم مسبقاً لصنف آخر.');
        }
        if (detail.includes('(plu)')) {
            return new Error('رمز PLU مستخدم مسبقاً لصنف آخر.');
        }
        if (detail.includes('(employee_no)')) {
            return new Error('رقم الموظف تم توليده مسبقاً. أعد المحاولة.');
        }
        if (detail.includes('(code)')) {
            return new Error('رمز فئة المصروف مستخدم مسبقاً.');
        }
        if (detail.includes('(name)')) {
            return new Error('اسم السجل مستخدم مسبقاً.');
        }
        if (detail.includes('(expense_no)')) {
            return new Error('تم توليد رقم مصروف مكرر. أعد المحاولة.');
        }
    }
    return error instanceof Error ? error : new Error(fallbackMessage);
}
async function generateEmployeeNo(client) {
    const sequenceResult = await client.query(`
      select coalesce(max(substring(employee_no from 'EMP-(\\d+)$')::integer), 0) + 1 as value
      from app_employees
    `);
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `EMP-${serial}`;
}
function normalizeLogin(login) {
    return login.trim().toLowerCase();
}
function isProtectedAdminRow(employee) {
    return employee.role === 'admin' && employee.username?.toLowerCase() === DEFAULT_ADMIN_USERNAME;
}
export async function ensureDefaultAdminAccount(pool) {
    const adminId = 'emp-admin-default';
    const adminPinHash = hashPin(DEFAULT_ADMIN_PIN);
    const existingAdminResult = await pool.query(`
      select id
      from app_employees
      where id = $1 or lower(username) = lower($2)
      limit 1
    `, [adminId, DEFAULT_ADMIN_USERNAME]);
    const existingAdminId = existingAdminResult.rows[0]?.id;
    if (existingAdminId) {
        await pool.query(`
        update app_employees
        set employee_no = $2, username = $3, name = $4, role = 'admin', pin_hash = $5, notes = $6, is_active = true
        where id = $1
      `, [existingAdminId, 'ADM-0001', DEFAULT_ADMIN_USERNAME, 'مدير النظام', adminPinHash, 'حساب الإدارة الافتراضي']);
        return;
    }
    await pool.query(`
      insert into app_employees (id, employee_no, username, name, role, pin_hash, notes, is_active)
      values ($1, $2, $3, $4, 'admin', $5, $6, true)
    `, [adminId, 'ADM-0001', DEFAULT_ADMIN_USERNAME, 'مدير النظام', adminPinHash, 'حساب الإدارة الافتراضي']);
}
async function generateInvoiceNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('invoice', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `POS-${year}${month}${day}-${serial}`;
}
async function generatePurchaseReceiptNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('purchase', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `PUR-${year}${month}${day}-${serial}`;
}
function buildPurchaseMovementNote(actionLabel, purchaseDate, supplierName, supplierInvoiceNo) {
    return [
        supplierName ? `${actionLabel} من ${supplierName}` : actionLabel,
        `بتاريخ ${purchaseDate}`,
        supplierInvoiceNo ? `قائمة ${supplierInvoiceNo}` : null,
    ].filter(Boolean).join(' | ');
}
async function getLockedPurchaseReceipt(client, receiptId) {
    const receiptResult = await client.query(`
      select id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes, created_at
      from app_purchase_receipts
      where id = $1
      for update
    `, [receiptId]);
    const receipt = receiptResult.rows[0];
    if (!receipt) {
        return null;
    }
    const itemsResult = await client.query(`
      select id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
      from app_purchase_receipt_items
      where receipt_id = $1
      order by id asc
      for update
    `, [receiptId]);
    return {
        ...receipt,
        items: itemsResult.rows,
    };
}
async function getLatestPurchaseBatchRetailCost(client, productId) {
    const result = await client.query(`
      select retail_unit_cost
      from app_inventory_batches
      where product_id = $1 and source = 'purchase'
      order by created_at desc
      limit 1
    `, [productId]);
    return result.rows[0] ? asNumber(result.rows[0].retail_unit_cost) : null;
}
async function applyPurchaseReceiptItems(client, input, supplierName, purchaseDateLabel, supplierInvoiceLabel) {
    const normalizedItems = [];
    const movementNote = buildPurchaseMovementNote('استلام شراء', purchaseDateLabel, supplierName, supplierInvoiceLabel);
    for (const item of input.items) {
        const draft = item.productDraft ?? null;
        let product = item.productId ? await getLockedProduct(client, item.productId) : null;
        if (!product && draft) {
            product = await insertPurchasedProduct(client, draft, item.entryUnit, input.currencyCode === 'USD'
                ? roundMoney(item.unitCost * input.exchangeRate)
                : roundMoney(item.unitCost));
        }
        if (!product) {
            throw new Error('أحد الأصناف المختارة غير موجود في الكتالوج.');
        }
        const wholesaleQuantity = asNumber(product.wholesale_quantity ?? 1);
        const isWholesaleEntry = item.entryUnit === 'wholesale' && Boolean(product.wholesale_unit) && wholesaleQuantity > 0;
        const baseQuantity = roundQuantity(item.quantity * (isWholesaleEntry ? wholesaleQuantity : 1));
        const unitCostIqd = input.currencyCode === 'USD'
            ? roundMoney(item.unitCost * input.exchangeRate)
            : roundMoney(item.unitCost);
        const retailUnitCostIqd = roundMoney(unitCostIqd / (isWholesaleEntry ? wholesaleQuantity : 1));
        const wholesaleUnitCostIqd = product.wholesale_unit && wholesaleQuantity > 0
            ? (isWholesaleEntry ? roundMoney(unitCostIqd) : roundMoney(retailUnitCostIqd * wholesaleQuantity))
            : undefined;
        const nextStock = roundQuantity(asNumber(product.stock_qty) + baseQuantity);
        await client.query(`
        update app_products
        set stock_qty = $1,
            purchase_price = $2,
            retail_purchase_price = $2,
            wholesale_purchase_price = case when $3::numeric is null then wholesale_purchase_price else $3 end,
            updated_at = now()
        where id = $4
      `, [nextStock, retailUnitCostIqd, wholesaleUnitCostIqd ?? null, product.id]);
        await insertStockMovement(client, {
            id: createId('movement'),
            productId: product.id,
            productName: product.name,
            movementType: 'purchase',
            quantityDelta: baseQuantity,
            balanceAfter: nextStock,
            note: movementNote,
        });
        normalizedItems.push({
            purchaseItemId: createId('purchase-item'),
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
        });
    }
    return normalizedItems;
}
async function reversePurchaseReceiptInventory(client, receipt, actionLabel) {
    const itemIds = receipt.items.map((item) => item.id);
    const batchesResult = itemIds.length > 0
        ? await client.query(`
          select id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost, created_at
          from app_inventory_batches
          where purchase_receipt_item_id = any($1::text[])
          for update
        `, [itemIds])
        : { rows: [] };
    const batchByItemId = new Map();
    for (const batch of batchesResult.rows) {
        if (batch.purchase_receipt_item_id) {
            batchByItemId.set(batch.purchase_receipt_item_id, batch);
        }
    }
    for (const item of receipt.items) {
        const product = await getLockedProduct(client, item.product_id);
        if (!product) {
            throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`);
        }
        const batch = batchByItemId.get(item.id);
        if (!batch) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن دفعة الصنف ${item.name} لم تعد متاحة في المخزون.`);
        }
        const consumedQuantity = roundQuantity(asNumber(batch.received_quantity) - asNumber(batch.remaining_quantity));
        if (consumedQuantity > 0.001) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن الصنف ${item.name} خرجت منه كمية ${consumedQuantity} من المخزون.`);
        }
    }
    for (const item of receipt.items) {
        const product = await getLockedProduct(client, item.product_id);
        const batch = batchByItemId.get(item.id);
        if (!product || !batch) {
            continue;
        }
        const nextStock = roundQuantity(asNumber(product.stock_qty) - asNumber(item.base_quantity));
        if (nextStock < 0) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن رصيد ${item.name} سيصبح سالباً.`);
        }
        await client.query('delete from app_inventory_batches where id = $1', [batch.id]);
        const latestPurchaseRetailCost = await getLatestPurchaseBatchRetailCost(client, product.id);
        const nextWholesalePurchaseCost = latestPurchaseRetailCost !== null && product.wholesale_quantity !== null
            ? roundMoney(latestPurchaseRetailCost * asNumber(product.wholesale_quantity))
            : null;
        await client.query(`
        update app_products
        set stock_qty = $1,
            purchase_price = coalesce($2, purchase_price),
            retail_purchase_price = coalesce($2, retail_purchase_price),
            wholesale_purchase_price = case when $3::numeric is null then wholesale_purchase_price else $3 end,
            updated_at = now()
        where id = $4
      `, [nextStock, latestPurchaseRetailCost, nextWholesalePurchaseCost, product.id]);
        await insertStockMovement(client, {
            id: createId('movement'),
            productId: product.id,
            productName: product.name,
            movementType: 'purchase',
            quantityDelta: -asNumber(item.base_quantity),
            balanceAfter: nextStock,
            note: actionLabel === 'تعديل'
                ? `عكس سند الشراء ${receipt.receipt_no} قبل التعديل`
                : `حذف سند الشراء ${receipt.receipt_no}`,
        });
        await syncOpeningBatch(client, {
            id: product.id,
            name: product.name,
            stock_qty: nextStock,
            purchase_price: latestPurchaseRetailCost ?? asNumber(product.purchase_price),
        });
    }
}
async function generateSupplierPaymentNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('supplier-payment', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `SUPPAY-${year}${month}${day}-${serial}`;
}
async function generateEmployeeCompensationNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('employee-compensation', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `PAY-${year}${month}${day}-${serial}`;
}
async function generateCustomerPaymentNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('customer-payment', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `CUSTPAY-${year}${month}${day}-${serial}`;
}
async function generateShiftNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('shift', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `SHIFT-${year}${month}${day}-${serial}`;
}
async function generateExpenseNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('expense', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `EXP-${year}${month}-${serial}`;
}
async function generateFundMovementNo(client) {
    const today = new Date().toISOString().slice(0, 10);
    const sequenceResult = await client.query(`
      insert into app_daily_sequences (seq_key, seq_date, value)
      values ('fund-movement', $1::date, 1)
      on conflict (seq_key, seq_date)
      do update set value = app_daily_sequences.value + 1
      returning value
    `, [today]);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const serial = String(sequenceResult.rows[0]?.value ?? 1).padStart(4, '0');
    return `FUND-${year}${month}-${serial}`;
}
export function createPostgresDataAccess(pool) {
    return {
        products: {
            async listProducts() {
                const result = await pool.query(`
            select id, name, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            , product_family_name, variant_label
            from app_products
            order by name asc
          `);
                return result.rows.map(mapProductRow);
            },
            async listMovements() {
                const result = await pool.query(`
            select id, product_id, product_name, movement_type, quantity_delta, balance_after, note, created_at
            from app_stock_movements
            order by created_at desc
            limit 500
          `);
                return result.rows.map(mapMovementRow);
            },
            async listBatches(productId) {
                return loadInventoryBatches(pool, productId ? [productId] : undefined);
            },
            async adjustStock(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const product = await getLockedProduct(client, input.productId);
                    if (!product) {
                        throw new Error('الصنف المطلوب غير موجود.');
                    }
                    const nextBalance = roundQuantity(asNumber(product.stock_qty) + input.quantityDelta);
                    if (nextBalance < 0) {
                        throw new Error(`لا يمكن أن يصبح رصيد ${product.name} أقل من الصفر.`);
                    }
                    await client.query('update app_products set stock_qty = $1, updated_at = now() where id = $2', [nextBalance, input.productId]);
                    await syncOpeningBatch(client, {
                        ...product,
                        stock_qty: nextBalance,
                    });
                    await insertStockMovement(client, {
                        id: createId('movement'),
                        productId: product.id,
                        productName: product.name,
                        movementType: 'adjustment',
                        quantityDelta: roundQuantity(input.quantityDelta),
                        balanceAfter: nextBalance,
                        note: input.note,
                    });
                    await client.query('commit');
                    return {
                        ...mapProductRow(product),
                        stockQty: nextBalance,
                    };
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر تنفيذ تعديل المخزون.');
                }
                finally {
                    client.release();
                }
            },
            async createProduct(input) {
                const productId = createId('prod');
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const result = await client.query(`
              insert into app_products (
                id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
              returning id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            `, [
                        productId,
                        input.name,
                        input.productFamilyName ?? input.name,
                        input.variantLabel ?? null,
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
                    ]);
                    const product = mapProductRow(result.rows[0]);
                    await syncOpeningBatch(client, {
                        id: product.id,
                        name: product.name,
                        stock_qty: product.stockQty,
                        purchase_price: product.purchasePrice,
                    });
                    if (product.stockQty > 0) {
                        await insertStockMovement(client, {
                            id: createId('movement'),
                            productId: product.id,
                            productName: product.name,
                            movementType: 'adjustment',
                            quantityDelta: product.stockQty,
                            balanceAfter: product.stockQty,
                            note: 'رصيد افتتاحي عند إنشاء الصنف',
                        });
                    }
                    await client.query('commit');
                    return product;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر إنشاء الصنف.');
                }
                finally {
                    client.release();
                }
            },
            async updateProduct(productId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const current = await getLockedProduct(client, productId);
                    if (!current) {
                        throw new Error('الصنف المطلوب غير موجود.');
                    }
                    const nextStockQty = roundQuantity(input.stockQty);
                    const stockDelta = roundQuantity(nextStockQty - asNumber(current.stock_qty));
                    const result = await client.query(`
              update app_products
              set
                name = $2,
                product_family_name = $3,
                variant_label = $4,
                barcode = $5,
                wholesale_barcode = $6,
                plu = $7,
                department = $8,
                measurement_type = $9,
                purchase_cost_basis = $10,
                retail_unit = $11,
                wholesale_unit = $12,
                wholesale_quantity = $13,
                retail_purchase_price = $14,
                wholesale_purchase_price = $15,
                retail_sale_price = $16,
                wholesale_sale_price = $17,
                purchase_price = $14,
                unit_price = $16,
                vat_rate = $18,
                stock_qty = $19,
                min_stock = $20,
                sold_by_weight = $21,
                unit_label = $11,
                updated_at = now()
              where id = $1
              returning id, name, product_family_name, variant_label, barcode, wholesale_barcode, plu, department, measurement_type, purchase_cost_basis, retail_unit, wholesale_unit, wholesale_quantity, retail_purchase_price, wholesale_purchase_price, retail_sale_price, wholesale_sale_price, purchase_price, unit_price, vat_rate, stock_qty, min_stock, sold_by_weight, unit_label
            `, [
                        productId,
                        input.name,
                        input.productFamilyName ?? input.name,
                        input.variantLabel ?? null,
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
                    ]);
                    if (stockDelta !== 0) {
                        await insertStockMovement(client, {
                            id: createId('movement'),
                            productId,
                            productName: input.name,
                            movementType: 'adjustment',
                            quantityDelta: stockDelta,
                            balanceAfter: nextStockQty,
                            note: 'تعديل بيانات الصنف وتحديث الرصيد',
                        });
                    }
                    await client.query('update app_inventory_batches set product_name = $1 where product_id = $2', [input.name, productId]);
                    await syncOpeningBatch(client, {
                        id: productId,
                        name: input.name,
                        stock_qty: nextStockQty,
                        purchase_price: input.retailPurchasePrice,
                    });
                    await client.query('commit');
                    return mapProductRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تعديل الصنف.');
                }
                finally {
                    client.release();
                }
            },
            async deleteProduct(productId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const current = await getLockedProduct(client, productId);
                    if (!current) {
                        throw new Error('الصنف المطلوب غير موجود.');
                    }
                    if (asNumber(current.stock_qty) > 0) {
                        throw new Error('لا يمكن حذف صنف لا يزال لديه رصيد مخزني. صفّر الرصيد أولاً.');
                    }
                    await client.query('delete from app_products where id = $1', [productId]);
                    await client.query('commit');
                    return mapProductRow(current);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر حذف الصنف.');
                }
                finally {
                    client.release();
                }
            },
        },
        purchases: {
            async listReceipts() {
                return loadPurchaseReceipts(pool);
            },
            async createReceipt(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const receiptId = createId('purchase');
                    const receiptNo = await generatePurchaseReceiptNo(client);
                    const supplier = input.supplierId ? await getLockedSupplier(client, input.supplierId) : null;
                    const purchaseDateLabel = input.purchaseDate || new Date().toISOString().slice(0, 10);
                    const supplierInvoiceLabel = input.supplierInvoiceNo?.trim();
                    const supplierName = supplier?.name ?? input.supplierName;
                    if (input.supplierId && !supplier) {
                        throw new Error('المورد المحدد غير موجود.');
                    }
                    const normalizedItems = await applyPurchaseReceiptItems(client, input, supplierName, purchaseDateLabel, supplierInvoiceLabel || undefined);
                    const totalCost = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
                    const totalCostIqd = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotalIqd, 0));
                    if (supplier) {
                        await client.query('update app_suppliers set current_balance = $1 where id = $2', [roundMoney(asNumber(supplier.current_balance) + totalCostIqd), supplier.id]);
                    }
                    await client.query(`
              insert into app_purchase_receipts (
                id, receipt_no, supplier_id, supplier_name, purchase_date, supplier_invoice_no, currency_code, exchange_rate, total_cost, total_cost_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                        receiptId,
                        receiptNo,
                        supplier?.id ?? input.supplierId ?? null,
                        supplierName || null,
                        purchaseDateLabel,
                        supplierInvoiceLabel || null,
                        input.currencyCode,
                        input.exchangeRate,
                        totalCost,
                        totalCostIqd,
                        input.notes || null,
                    ]);
                    for (const item of normalizedItems) {
                        await client.query(`
                insert into app_purchase_receipt_items (
                  id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
                )
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              `, [
                            item.purchaseItemId,
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
                        ]);
                        await client.query(`
                insert into app_inventory_batches (
                  id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost
                )
                values ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8, $9, $9, $10)
              `, [
                            createId('batch'),
                            item.productId,
                            item.name,
                            item.purchaseItemId,
                            item.batchNo ?? null,
                            item.expiryDate ?? null,
                            purchaseDateLabel,
                            supplierName ?? null,
                            item.baseQuantity,
                            roundMoney(item.unitCostIqd / Math.max(item.baseQuantity / item.quantity, 1)),
                        ]);
                    }
                    await client.query('commit');
                    const [receipt] = await loadPurchaseReceipts(pool, [receiptId]);
                    if (!receipt) {
                        throw new Error('تعذر تحميل سند الاستلام بعد الحفظ.');
                    }
                    return receipt;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر حفظ سند الشراء.');
                }
                finally {
                    client.release();
                }
            },
            async updateReceipt(receiptId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const existingReceipt = await getLockedPurchaseReceipt(client, receiptId);
                    if (!existingReceipt) {
                        throw new Error('سند الشراء المطلوب غير موجود.');
                    }
                    const oldSupplier = existingReceipt.supplier_id ? await getLockedSupplier(client, existingReceipt.supplier_id) : null;
                    const supplier = input.supplierId ? await getLockedSupplier(client, input.supplierId) : null;
                    const purchaseDateLabel = input.purchaseDate || (existingReceipt.purchase_date ? toIsoString(existingReceipt.purchase_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
                    const supplierInvoiceLabel = input.supplierInvoiceNo?.trim();
                    const supplierName = supplier?.name ?? input.supplierName;
                    if (input.supplierId && !supplier) {
                        throw new Error('المورد المحدد غير موجود.');
                    }
                    await reversePurchaseReceiptInventory(client, existingReceipt, 'تعديل');
                    if (oldSupplier) {
                        await client.query('update app_suppliers set current_balance = current_balance - $1 where id = $2', [asNumber(existingReceipt.total_cost_iqd), oldSupplier.id]);
                    }
                    await client.query('delete from app_purchase_receipt_items where receipt_id = $1', [receiptId]);
                    const normalizedItems = await applyPurchaseReceiptItems(client, input, supplierName, purchaseDateLabel, supplierInvoiceLabel || undefined);
                    const totalCost = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0));
                    const totalCostIqd = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineTotalIqd, 0));
                    if (supplier) {
                        await client.query('update app_suppliers set current_balance = current_balance + $1 where id = $2', [totalCostIqd, supplier.id]);
                    }
                    await client.query(`
              update app_purchase_receipts
              set supplier_id = $1,
                  supplier_name = $2,
                  purchase_date = $3,
                  supplier_invoice_no = $4,
                  currency_code = $5,
                  exchange_rate = $6,
                  total_cost = $7,
                  total_cost_iqd = $8,
                  notes = $9
              where id = $10
            `, [
                        supplier?.id ?? input.supplierId ?? null,
                        supplierName || null,
                        purchaseDateLabel,
                        supplierInvoiceLabel || null,
                        input.currencyCode,
                        input.exchangeRate,
                        totalCost,
                        totalCostIqd,
                        input.notes || null,
                        receiptId,
                    ]);
                    for (const item of normalizedItems) {
                        await client.query(`
                insert into app_purchase_receipt_items (
                  id, receipt_id, product_id, name, quantity, base_quantity, entry_unit, entry_unit_label, batch_no, expiry_date, unit_cost, unit_cost_iqd, line_total, line_total_iqd
                )
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              `, [
                            item.purchaseItemId,
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
                        ]);
                        await client.query(`
                insert into app_inventory_batches (
                  id, product_id, product_name, source, purchase_receipt_item_id, batch_no, expiry_date, purchase_date, supplier_name, received_quantity, remaining_quantity, retail_unit_cost
                )
                values ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8, $9, $9, $10)
              `, [
                            createId('batch'),
                            item.productId,
                            item.name,
                            item.purchaseItemId,
                            item.batchNo ?? null,
                            item.expiryDate ?? null,
                            purchaseDateLabel,
                            supplierName ?? null,
                            item.baseQuantity,
                            roundMoney(item.unitCostIqd / Math.max(item.baseQuantity / item.quantity, 1)),
                        ]);
                    }
                    await client.query('commit');
                    const [receipt] = await loadPurchaseReceipts(pool, [receiptId]);
                    if (!receipt) {
                        throw new Error('تعذر تحميل سند الشراء بعد التعديل.');
                    }
                    return receipt;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تعديل سند الشراء.');
                }
                finally {
                    client.release();
                }
            },
            async deleteReceipt(receiptId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const existingReceipt = await getLockedPurchaseReceipt(client, receiptId);
                    if (!existingReceipt) {
                        throw new Error('سند الشراء المطلوب غير موجود.');
                    }
                    await reversePurchaseReceiptInventory(client, existingReceipt, 'حذف');
                    if (existingReceipt.supplier_id) {
                        const supplier = await getLockedSupplier(client, existingReceipt.supplier_id);
                        if (supplier) {
                            await client.query('update app_suppliers set current_balance = current_balance - $1 where id = $2', [asNumber(existingReceipt.total_cost_iqd), supplier.id]);
                        }
                    }
                    await client.query('delete from app_purchase_receipt_items where receipt_id = $1', [receiptId]);
                    await client.query('delete from app_purchase_receipts where id = $1', [receiptId]);
                    await client.query('commit');
                    return {
                        id: existingReceipt.id,
                        receiptNo: existingReceipt.receipt_no,
                        supplierId: existingReceipt.supplier_id ?? undefined,
                        supplierName: existingReceipt.supplier_name ?? undefined,
                        purchaseDate: existingReceipt.purchase_date ? toIsoString(existingReceipt.purchase_date).slice(0, 10) : toIsoString(existingReceipt.created_at).slice(0, 10),
                        supplierInvoiceNo: existingReceipt.supplier_invoice_no ?? undefined,
                        currencyCode: existingReceipt.currency_code,
                        exchangeRate: asNumber(existingReceipt.exchange_rate),
                        totalCost: asNumber(existingReceipt.total_cost),
                        totalCostIqd: asNumber(existingReceipt.total_cost_iqd),
                        notes: existingReceipt.notes ?? undefined,
                        createdAt: toIsoString(existingReceipt.created_at),
                        items: existingReceipt.items.map((item) => ({
                            receiptItemId: item.id,
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
                    };
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر حذف سند الشراء.');
                }
                finally {
                    client.release();
                }
            },
        },
        customers: {
            async listCustomers() {
                const result = await pool.query(`
            select id, name, phone, address, notes, current_balance, is_active, created_at
            from app_customers
            order by name asc
          `);
                return result.rows.map(mapCustomerRow);
            },
            async listPayments(customerId) {
                const customer = await pool.query('select id from app_customers where id = $1', [customerId]);
                if (!customer.rows[0]) {
                    throw new Error('العميل المطلوب غير موجود.');
                }
                return loadCustomerPayments(pool, customerId);
            },
            async createCustomer(input) {
                try {
                    const result = await pool.query(`
              insert into app_customers (id, name, phone, address, notes, current_balance, is_active)
              values ($1, $2, $3, $4, $5, 0, true)
              returning id, name, phone, address, notes, current_balance, is_active, created_at
            `, [createId('cust'), input.name, input.phone ?? null, input.address ?? null, input.notes ?? null]);
                    return mapCustomerRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر إنشاء العميل.');
                }
            },
            async updateCustomer(customerId, input) {
                try {
                    const result = await pool.query(`
              update app_customers
              set name = $2, phone = $3, address = $4, notes = $5
              where id = $1
              returning id, name, phone, address, notes, current_balance, is_active, created_at
            `, [customerId, input.name, input.phone ?? null, input.address ?? null, input.notes ?? null]);
                    if (!result.rows[0]) {
                        throw new Error('العميل المطلوب غير موجود.');
                    }
                    return mapCustomerRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر تعديل العميل.');
                }
            },
            async createPayment(customerId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const customer = await getLockedCustomer(client, customerId);
                    if (!customer) {
                        throw new Error('العميل المطلوب غير موجود.');
                    }
                    const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount);
                    const currentBalance = asNumber(customer.current_balance);
                    const openShift = await getOpenShiftByEmployee(client, input.createdByEmployeeId);
                    const destinationFund = openShift ? null : await getLockedFundAccountByCode(client, 'revenue');
                    if (amountIqd - currentBalance > 0.01) {
                        throw new Error('قيمة التسديد تتجاوز الرصيد المستحق على العميل.');
                    }
                    if (!openShift && (!destinationFund || !destinationFund.is_active)) {
                        throw new Error('صندوق الإيرادات غير معرف أو غير مفعل.');
                    }
                    const paymentNo = await generateCustomerPaymentNo(client);
                    const paymentId = createId('cust-pay');
                    await client.query(`
              insert into app_customer_payments (
                id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd,
                shift_id, terminal_name, destination_fund_account_id, destination_fund_account_name, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                        paymentId,
                        paymentNo,
                        customer.id,
                        customer.name,
                        input.currencyCode,
                        input.exchangeRate,
                        roundMoney(input.amount),
                        amountIqd,
                        openShift?.id ?? null,
                        openShift?.terminal_name ?? null,
                        destinationFund?.id ?? null,
                        destinationFund?.name ?? null,
                        input.notes ?? null,
                    ]);
                    await client.query('update app_customers set current_balance = $1 where id = $2', [roundMoney(currentBalance - amountIqd), customer.id]);
                    if (destinationFund) {
                        await createFundMovementEntry(client, {
                            movementDate: new Date().toISOString().slice(0, 10),
                            direction: 'inflow',
                            amountIqd,
                            destinationFundAccountId: destinationFund.id,
                            reason: 'customer-payment',
                            referenceType: 'customer-payment',
                            referenceId: paymentId,
                            counterpartyName: customer.name,
                            notes: input.notes,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    await client.query('commit');
                    const paymentResult = await pool.query(`
              select id, payment_no, customer_id, customer_name, currency_code, exchange_rate, amount, amount_iqd,
                     shift_id, terminal_name, destination_fund_account_id, destination_fund_account_name, notes, created_at
              from app_customer_payments
              where id = $1
            `, [paymentId]);
                    if (!paymentResult.rows[0]) {
                        throw new Error('تعذر تحميل تسديد العميل بعد الحفظ.');
                    }
                    return mapCustomerPaymentRow(paymentResult.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر تسجيل تسديد العميل.');
                }
                finally {
                    client.release();
                }
            },
            async deleteCustomer(customerId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const customer = await getLockedCustomer(client, customerId);
                    if (!customer) {
                        throw new Error('العميل المطلوب غير موجود.');
                    }
                    if (Math.abs(asNumber(customer.current_balance)) > 0.01) {
                        throw new Error('لا يمكن حذف عميل لديه رصيد قائم.');
                    }
                    await client.query('delete from app_customers where id = $1', [customerId]);
                    await client.query('commit');
                    return mapCustomerRow(customer);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر حذف العميل.');
                }
                finally {
                    client.release();
                }
            },
        },
        employees: {
            async listEmployees() {
                const result = await pool.query(`
            select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            from app_employees
            order by employee_no asc
          `);
                return result.rows.map(mapEmployeeRow);
            },
            async listCompensations(employeeId) {
                const employee = await pool.query('select id from app_employees where id = $1', [employeeId]);
                if (!employee.rows[0]) {
                    throw new Error('الموظف المطلوب غير موجود.');
                }
                const result = await pool.query(`
               select id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method, payment_method, payment_date,
                   period_label, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_compensations
            where employee_id = $1
            order by payment_date desc, created_at desc
          `, [employeeId]);
                return result.rows.map(mapEmployeeCompensationRow);
            },
            async listAbsences(employeeId) {
                const employee = await pool.query('select id from app_employees where id = $1', [employeeId]);
                if (!employee.rows[0]) {
                    throw new Error('الموظف المطلوب غير موجود.');
                }
                const result = await pool.query(`
            select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_absences
            where employee_id = $1
            order by absence_date desc, created_at desc
          `, [employeeId]);
                return result.rows.map(mapEmployeeAbsenceRow);
            },
            async listMonthlyPayroll(month) {
                const employeesResult = await pool.query(`
            select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            from app_employees
            order by employee_no asc
          `);
                const compensationsResult = await pool.query(`
            select id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method, payment_method, payment_date,
                   period_label, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_compensations
            where coalesce(nullif(period_label, ''), to_char(payment_date, 'YYYY-MM')) = $1
            order by payment_date desc, created_at desc
          `, [month]);
                const absencesResult = await pool.query(`
            select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_absences
            where to_char(absence_date, 'YYYY-MM') = $1
            order by absence_date desc, created_at desc
          `, [month]);
                return employeesResult.rows
                    .map(mapEmployeeRow)
                    .filter((employee) => employee.monthlySalaryIqd && employee.startDate)
                    .map((employee) => buildMonthlyPayrollSummary(employee, compensationsResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeCompensationRow), absencesResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeAbsenceRow), month));
            },
            async listCumulativePayroll(throughMonth) {
                const employeesResult = await pool.query(`
            select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            from app_employees
            order by employee_no asc
          `);
                const employees = employeesResult.rows
                    .map(mapEmployeeRow)
                    .filter((employee) => employee.monthlySalaryIqd && employee.startDate);
                const employeeIds = employees.map((employee) => employee.id);
                if (!employeeIds.length) {
                    return [];
                }
                const compensationsResult = await pool.query(`
            select id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method, payment_method, payment_date,
                   period_label, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_compensations
            where employee_id = any($1::text[])
              and coalesce(nullif(period_label, ''), to_char(payment_date, 'YYYY-MM')) <= $2
            order by payment_date desc, created_at desc
          `, [employeeIds, throughMonth]);
                const absencesResult = await pool.query(`
            select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
            from app_employee_absences
            where employee_id = any($1::text[]) and to_char(absence_date, 'YYYY-MM') <= $2
            order by absence_date desc, created_at desc
          `, [employeeIds, throughMonth]);
                return employees.map((employee) => buildEmployeeCumulativePayrollSummary(employee, compensationsResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeCompensationRow), absencesResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeAbsenceRow), throughMonth));
            },
            async createEmployee(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employeeNo = await generateEmployeeNo(client);
                    const employeeId = createId('emp');
                    await client.query(`
              insert into app_employees (
                id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date,
                payroll_type, payroll_rate_iqd, pin_hash, notes, is_active
              )
              values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::date, null, null, $10, $11, $12)
            `, [employeeId, employeeNo, null, input.name, input.role, input.startDate ?? null, input.monthlySalaryIqd ?? null, input.employmentStatus ?? 'active', input.serviceEndDate ?? null, hashPin(input.pin), input.notes ?? null, input.employmentStatus !== 'suspended' && input.employmentStatus !== 'terminated']);
                    await client.query('commit');
                    const result = await pool.query(`
              select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
              from app_employees
              where id = $1
            `, [employeeId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل الموظف بعد الحفظ.');
                    }
                    return mapEmployeeRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر إنشاء الموظف.');
                }
                finally {
                    client.release();
                }
            },
            async createCompensation(employeeId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employee = await getLockedEmployee(client, employeeId);
                    if (!employee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    const compensationId = createId('emp-pay');
                    const paymentNo = await generateEmployeeCompensationNo(client);
                    const resolved = resolveEmployeeCompensationInput(mapEmployeeRow(employee), input);
                    await client.query(`
              insert into app_employee_compensations (
                id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method,
                payment_method, payment_date, period_label, notes, created_by_employee_id, created_by_employee_name
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13)
            `, [
                        compensationId,
                        paymentNo,
                        employee.id,
                        employee.name,
                        input.kind,
                        resolved.amountIqd,
                        resolved.calculationMethod,
                        input.paymentMethod ?? null,
                        input.paymentDate,
                        input.periodLabel ?? null,
                        input.notes ?? null,
                        input.createdByEmployeeId,
                        input.createdByEmployeeName,
                    ]);
                    if (isEmployeeCompensationOutflow(input.kind)) {
                        const expenseCategory = await getLockedExpenseCategoryByCode(client, 'salary');
                        if (!expenseCategory || !expenseCategory.is_active) {
                            throw new Error('فئة مصروف الرواتب غير معرفة في النظام.');
                        }
                        const expenseId = createId('expense');
                        const expenseNo = await generateExpenseNo(client);
                        const fallbackNote = `${input.kind === 'advance' ? 'سلفة' : 'دفعة راتب'} ${paymentNo}`;
                        await client.query(`
                insert into app_expenses (
                  id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method,
                  beneficiary_name, notes, created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name,
                  shift_id, reference_type, reference_id, status
                )
                values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, null, 'employee-compensation', $15, 'posted')
              `, [
                            expenseId,
                            expenseNo,
                            input.paymentDate,
                            expenseCategory.id,
                            expenseCategory.name,
                            expenseCategory.kind,
                            resolved.amountIqd,
                            input.paymentMethod ?? 'cash',
                            employee.name,
                            input.notes ?? fallbackNote,
                            input.createdByEmployeeId,
                            input.createdByEmployeeName,
                            null,
                            FINAL_CASH_LABEL,
                            compensationId,
                        ]);
                        await createFinalCashOutflowEntry(client, {
                            movementDate: input.paymentDate,
                            amountIqd: resolved.amountIqd,
                            reason: 'expense-payment',
                            referenceType: 'expense',
                            referenceId: expenseId,
                            counterpartyName: employee.name,
                            notes: input.notes ?? fallbackNote,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    await client.query('commit');
                    const result = await pool.query(`
              select id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method, payment_method, payment_date,
                     period_label, notes, created_by_employee_id, created_by_employee_name, created_at
              from app_employee_compensations
              where id = $1
            `, [compensationId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل حركة صرف الموظف بعد الحفظ.');
                    }
                    return mapEmployeeCompensationRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تسجيل صرف الموظف.');
                }
                finally {
                    client.release();
                }
            },
            async createAbsence(employeeId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employee = await getLockedEmployee(client, employeeId);
                    if (!employee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    const absenceId = createId('emp-abs');
                    await client.query(`
              insert into app_employee_absences (
                id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name
              )
              values ($1, $2, $3, $4::date, $5, $6, $7, $8)
            `, [absenceId, employee.id, employee.name, input.absenceDate, input.deductionDays, input.notes ?? null, input.createdByEmployeeId, input.createdByEmployeeName]);
                    await client.query('commit');
                    const result = await pool.query(`
              select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
              from app_employee_absences
              where id = $1
            `, [absenceId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل سجل الغياب بعد الحفظ.');
                    }
                    return mapEmployeeAbsenceRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تسجيل غياب الموظف.');
                }
                finally {
                    client.release();
                }
            },
            async updateAbsence(employeeId, absenceId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employee = await getLockedEmployee(client, employeeId);
                    if (!employee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    const absence = await getLockedEmployeeAbsence(client, employeeId, absenceId);
                    if (!absence) {
                        throw new Error('سجل الغياب المطلوب غير موجود.');
                    }
                    await client.query(`
              update app_employee_absences
              set employee_name = $3,
                  absence_date = $4::date,
                  deduction_days = $5,
                  notes = $6,
                  created_by_employee_id = $7,
                  created_by_employee_name = $8
              where id = $1 and employee_id = $2
            `, [absenceId, employeeId, employee.name, input.absenceDate, input.deductionDays, input.notes ?? null, input.createdByEmployeeId, input.createdByEmployeeName]);
                    await client.query('commit');
                    const result = await pool.query(`
              select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
              from app_employee_absences
              where id = $1
            `, [absenceId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل سجل الغياب بعد التعديل.');
                    }
                    return mapEmployeeAbsenceRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تعديل غياب الموظف.');
                }
                finally {
                    client.release();
                }
            },
            async deleteAbsence(employeeId, absenceId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employee = await getLockedEmployee(client, employeeId);
                    if (!employee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    const absence = await getLockedEmployeeAbsence(client, employeeId, absenceId);
                    if (!absence) {
                        throw new Error('سجل الغياب المطلوب غير موجود.');
                    }
                    await client.query('delete from app_employee_absences where id = $1 and employee_id = $2', [absenceId, employeeId]);
                    await client.query('commit');
                    return mapEmployeeAbsenceRow(absence);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر حذف غياب الموظف.');
                }
                finally {
                    client.release();
                }
            },
            async settleMonthlyPayroll(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employeesResult = await client.query(`
              select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
              from app_employees
              order by employee_no asc
              for update
            `);
                    const selectedEmployees = employeesResult.rows
                        .map(mapEmployeeRow)
                        .filter((employee) => employee.monthlySalaryIqd && employee.startDate)
                        .filter((employee) => !input.employeeIds?.length || input.employeeIds.includes(employee.id));
                    const employeeIds = selectedEmployees.map((employee) => employee.id);
                    if (!employeeIds.length) {
                        await client.query('commit');
                        return [];
                    }
                    const compensationsResult = await client.query(`
              select id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method, payment_method, payment_date,
                     period_label, notes, created_by_employee_id, created_by_employee_name, created_at
              from app_employee_compensations
              where employee_id = any($1::text[]) and coalesce(nullif(period_label, ''), to_char(payment_date, 'YYYY-MM')) = $2
              order by payment_date desc, created_at desc
            `, [employeeIds, input.month]);
                    const absencesResult = await client.query(`
              select id, employee_id, employee_name, absence_date, deduction_days, notes, created_by_employee_id, created_by_employee_name, created_at
              from app_employee_absences
              where employee_id = any($1::text[]) and to_char(absence_date, 'YYYY-MM') = $2
              order by absence_date desc, created_at desc
            `, [employeeIds, input.month]);
                    const expenseCategory = await getLockedExpenseCategoryByCode(client, 'salary');
                    if (!expenseCategory || !expenseCategory.is_active) {
                        throw new Error('فئة مصروف الرواتب غير معرفة في النظام.');
                    }
                    const createdEntries = [];
                    for (const employee of selectedEmployees) {
                        const summary = buildMonthlyPayrollSummary(employee, compensationsResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeCompensationRow), absencesResult.rows.filter((row) => row.employee_id === employee.id).map(mapEmployeeAbsenceRow), input.month);
                        if (summary.salaryToAccrueIqd > 0) {
                            const salaryCompensationId = createId('emp-pay');
                            const salaryPaymentNo = await generateEmployeeCompensationNo(client);
                            await client.query(`
                  insert into app_employee_compensations (
                    id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method,
                    payment_method, payment_date, period_label, notes, created_by_employee_id, created_by_employee_name
                  )
                  values ($1, $2, $3, $4, 'salary', $5, 'monthly', null, $6::date, $7, $8, $9, $10)
                `, [
                                salaryCompensationId,
                                salaryPaymentNo,
                                employee.id,
                                employee.name,
                                summary.salaryToAccrueIqd,
                                input.paymentDate,
                                input.month,
                                `استحقاق راتب شهر ${input.month}`,
                                input.createdByEmployeeId,
                                input.createdByEmployeeName,
                            ]);
                            createdEntries.push({
                                id: salaryCompensationId,
                                paymentNo: salaryPaymentNo,
                                employeeId: employee.id,
                                employeeName: employee.name,
                                kind: 'salary',
                                amountIqd: summary.salaryToAccrueIqd,
                                calculationMethod: 'monthly',
                                paymentDate: input.paymentDate,
                                periodLabel: input.month,
                                notes: `استحقاق راتب شهر ${input.month}`,
                                createdByEmployeeId: input.createdByEmployeeId,
                                createdByEmployeeName: input.createdByEmployeeName,
                                createdAt: new Date().toISOString(),
                            });
                        }
                        if (summary.remainingPayableIqd > 0) {
                            const paymentCompensationId = createId('emp-pay');
                            const paymentNo = await generateEmployeeCompensationNo(client);
                            await client.query(`
                  insert into app_employee_compensations (
                    id, payment_no, employee_id, employee_name, kind, amount_iqd, calculation_method,
                    payment_method, payment_date, period_label, notes, created_by_employee_id, created_by_employee_name
                  )
                  values ($1, $2, $3, $4, 'payment', $5, 'manual', $6, $7::date, $8, $9, $10, $11)
                `, [
                                paymentCompensationId,
                                paymentNo,
                                employee.id,
                                employee.name,
                                summary.remainingPayableIqd,
                                input.paymentMethod,
                                input.paymentDate,
                                input.month,
                                `تسديد راتب شهر ${input.month}`,
                                input.createdByEmployeeId,
                                input.createdByEmployeeName,
                            ]);
                            const expenseId = createId('expense');
                            const expenseNo = await generateExpenseNo(client);
                            await client.query(`
                  insert into app_expenses (
                    id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method,
                    beneficiary_name, notes, created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name,
                    shift_id, reference_type, reference_id, status
                  )
                  values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, null, 'employee-compensation', $15, 'posted')
                `, [
                                expenseId,
                                expenseNo,
                                input.paymentDate,
                                expenseCategory.id,
                                expenseCategory.name,
                                expenseCategory.kind,
                                summary.remainingPayableIqd,
                                input.paymentMethod,
                                employee.name,
                                `تسديد راتب شهر ${input.month}`,
                                input.createdByEmployeeId,
                                input.createdByEmployeeName,
                                null,
                                FINAL_CASH_LABEL,
                                paymentCompensationId,
                            ]);
                            await createFinalCashOutflowEntry(client, {
                                movementDate: input.paymentDate,
                                amountIqd: summary.remainingPayableIqd,
                                reason: 'expense-payment',
                                referenceType: 'expense',
                                referenceId: expenseId,
                                counterpartyName: employee.name,
                                notes: `تسديد راتب شهر ${input.month}`,
                                createdByEmployeeId: input.createdByEmployeeId,
                                createdByEmployeeName: input.createdByEmployeeName,
                            });
                            createdEntries.push({
                                id: paymentCompensationId,
                                paymentNo,
                                employeeId: employee.id,
                                employeeName: employee.name,
                                kind: 'payment',
                                amountIqd: summary.remainingPayableIqd,
                                calculationMethod: 'manual',
                                paymentMethod: input.paymentMethod,
                                paymentDate: input.paymentDate,
                                periodLabel: input.month,
                                notes: `تسديد راتب شهر ${input.month}`,
                                createdByEmployeeId: input.createdByEmployeeId,
                                createdByEmployeeName: input.createdByEmployeeName,
                                createdAt: new Date().toISOString(),
                            });
                        }
                    }
                    await client.query('commit');
                    return createdEntries;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تسديد الرواتب الشهرية.');
                }
                finally {
                    client.release();
                }
            },
            async updateEmployee(employeeId, input) {
                try {
                    const currentResult = await pool.query(`
              select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
              from app_employees
              where id = $1
            `, [employeeId]);
                    const currentEmployee = currentResult.rows[0];
                    if (!currentEmployee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    if (isProtectedAdminRow(currentEmployee) && input.role !== 'admin') {
                        throw new Error('لا يمكن تغيير صلاحيات حساب الإدارة الافتراضي.');
                    }
                    const result = await pool.query(`
              update app_employees
              set name = $2, role = $3, start_date = $4::date, monthly_salary_iqd = $5, employment_status = $6, service_end_date = $7::date, notes = $8, is_active = $9
              where id = $1
              returning id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            `, [employeeId, input.name, input.role, input.startDate ?? null, input.monthlySalaryIqd ?? null, input.employmentStatus ?? 'active', input.serviceEndDate ?? null, input.notes ?? null, input.employmentStatus !== 'suspended' && input.employmentStatus !== 'terminated']);
                    if (!result.rows[0]) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    return mapEmployeeRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر تعديل الموظف.');
                }
            },
            async authenticate(login, pin) {
                const normalizedLogin = normalizeLogin(login);
                const result = await pool.query(`
            select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            from app_employees
            where id = $1 or lower(employee_no) = $2 or lower(username) = $2
          `, [login, normalizedLogin]);
                const employee = result.rows[0];
                if (!employee || !employee.is_active || employee.employment_status !== 'active') {
                    throw new Error('الموظف غير موجود أو غير مفعل.');
                }
                if (employee.pin_hash !== hashPin(pin)) {
                    throw new Error('PIN غير صحيح.');
                }
                return mapEmployeeRow(employee);
            },
            async resetPin(employeeId, pin) {
                try {
                    const result = await pool.query(`
              update app_employees
              set pin_hash = $2
              where id = $1
              returning id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            `, [employeeId, hashPin(pin)]);
                    if (!result.rows[0]) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    return mapEmployeeRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر إعادة تعيين PIN.');
                }
            },
            async setActive(employeeId, isActive) {
                try {
                    const currentResult = await pool.query(`
              select id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
              from app_employees
              where id = $1
            `, [employeeId]);
                    const currentEmployee = currentResult.rows[0];
                    if (!currentEmployee) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    if (isProtectedAdminRow(currentEmployee) && !isActive) {
                        throw new Error('لا يمكن تعطيل حساب الإدارة الافتراضي.');
                    }
                    const result = await pool.query(`
              update app_employees
              set is_active = $2
              where id = $1
              returning id, employee_no, username, name, role, start_date, monthly_salary_iqd, employment_status, service_end_date, payroll_type, payroll_rate_iqd, pin_hash, notes, is_active, created_at
            `, [employeeId, isActive]);
                    if (!result.rows[0]) {
                        throw new Error('الموظف المطلوب غير موجود.');
                    }
                    return mapEmployeeRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر تحديث حالة الموظف.');
                }
            },
        },
        shifts: {
            async listShifts(employeeId) {
                const result = employeeId
                    ? await pool.query(`
                select id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status
                  , closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id, invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, invoice_collections_iqd, customer_payments_count, customer_payments_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
                from app_cashier_shifts
                where employee_id = $1
                order by opened_at desc
              `, [employeeId])
                    : await pool.query(`
                select id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status
                  , closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id, invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, invoice_collections_iqd, customer_payments_count, customer_payments_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
                from app_cashier_shifts
                order by opened_at desc
              `);
                return Promise.all(result.rows.map(async (row) => {
                    const mappedShift = mapShiftRow(row);
                    if (row.status === 'closed') {
                        return mappedShift;
                    }
                    return {
                        ...mappedShift,
                        closingSummary: await buildLiveShiftSummary(pool, row),
                    };
                }));
            },
            async createShift(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const employee = await getLockedEmployee(client, input.employeeId);
                    if (!employee || !employee.is_active) {
                        throw new Error('الموظف غير موجود أو غير مفعل.');
                    }
                    if (employee.role !== 'cashier' && employee.role !== 'admin') {
                        throw new Error('هذا الموظف غير مخول بفتح وردية كاشير.');
                    }
                    const openShiftCheck = await client.query('select id from app_cashier_shifts where employee_id = $1 and status = $2 for update', [employee.id, 'open']);
                    if (openShiftCheck.rows[0]) {
                        throw new Error('يوجد وردية مفتوحة لهذا الموظف بالفعل.');
                    }
                    const shiftId = createId('shift');
                    const shiftNo = await generateShiftNo(client);
                    await client.query(`
              insert into app_cashier_shifts (
                id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, status
              )
              values ($1, $2, $3, $4, $5, $6, $7, 'open')
            `, [shiftId, shiftNo, employee.id, employee.name, input.terminalName, input.openingFloatIqd, input.openingNote ?? null]);
                    await client.query('commit');
                    const result = await pool.query(`
              select id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status
                , closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id, invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, invoice_collections_iqd, customer_payments_count, customer_payments_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
              from app_cashier_shifts
              where id = $1
            `, [shiftId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل الوردية بعد الفتح.');
                    }
                    return mapShiftRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر فتح الوردية.');
                }
                finally {
                    client.release();
                }
            },
            async closeShift(shiftId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const shift = await getLockedShift(client, shiftId);
                    if (!shift || shift.status !== 'open') {
                        throw new Error('الوردية المطلوبة غير موجودة أو مغلقة مسبقاً.');
                    }
                    const invoiceIdsResult = await client.query('select id from app_sale_invoices where shift_id = $1 order by created_at asc', [shiftId]);
                    const invoices = invoiceIdsResult.rows.length > 0
                        ? await loadInvoices(client, invoiceIdsResult.rows.map((row) => row.id))
                        : [];
                    const customerPayments = await loadShiftCustomerPayments(client, shiftId);
                    const summary = buildShiftFinancialSummary(asNumber(shift.opening_float_iqd), invoices, customerPayments);
                    const cashDifferenceIqd = roundMoney(input.closingCashIqd - summary.expectedCashIqd);
                    const revenueFund = input.closingCashIqd > 0 ? await getLockedFundAccountByCode(client, 'revenue') : null;
                    if (input.closingCashIqd > 0 && (!revenueFund || !revenueFund.is_active)) {
                        throw new Error('صندوق الإيرادات غير معرف أو غير مفعل.');
                    }
                    const remittanceMovement = input.closingCashIqd > 0 && revenueFund
                        ? await createFundMovementEntry(client, {
                            movementDate: new Date().toISOString().slice(0, 10),
                            direction: 'inflow',
                            amountIqd: input.closingCashIqd,
                            destinationFundAccountId: revenueFund.id,
                            reason: 'shift-remittance',
                            referenceType: 'shift',
                            referenceId: shiftId,
                            counterpartyName: shift.employee_name,
                            notes: input.closingNote,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        })
                        : null;
                    const result = await client.query(`
              update app_cashier_shifts
              set status = 'closed',
                  closed_at = now(),
                  closing_note = $2,
                  closing_cash_iqd = $3,
                  remitted_to_fund_account_id = $4,
                  remitted_to_fund_account_name = $5,
                  remittance_movement_id = $6,
                  invoices_count = $7,
                  returns_count = $8,
                  gross_sales_iqd = $9,
                  returns_value_iqd = $10,
                  net_sales_iqd = $11,
                  invoice_collections_iqd = $12,
                  customer_payments_count = $13,
                  customer_payments_iqd = $14,
                  collected_cash_iqd = $15,
                  credit_sales_iqd = $16,
                  expected_cash_iqd = $17,
                  cash_difference_iqd = $18
              where id = $1 and status = 'open'
              returning id, shift_no, employee_id, employee_name, terminal_name, opening_float_iqd, opening_note, opened_at, closed_at, closing_note, status,
                    closing_cash_iqd, remitted_to_fund_account_id, remitted_to_fund_account_name, remittance_movement_id, invoices_count, returns_count, gross_sales_iqd, returns_value_iqd, net_sales_iqd, invoice_collections_iqd, customer_payments_count, customer_payments_iqd, collected_cash_iqd, credit_sales_iqd, expected_cash_iqd, cash_difference_iqd
            `, [
                        shiftId,
                        input.closingNote ?? null,
                        input.closingCashIqd,
                        revenueFund?.id ?? null,
                        revenueFund?.name ?? null,
                        remittanceMovement?.id ?? null,
                        summary.invoicesCount,
                        summary.returnsCount,
                        summary.grossSalesIqd,
                        summary.returnsValueIqd,
                        summary.netSalesIqd,
                        summary.invoiceCollectionsIqd,
                        summary.customerPaymentsCount,
                        summary.customerPaymentsIqd,
                        summary.collectedCashIqd,
                        summary.creditSalesIqd,
                        summary.expectedCashIqd,
                        cashDifferenceIqd,
                    ]);
                    if (!result.rows[0]) {
                        throw new Error('الوردية المطلوبة غير موجودة أو مغلقة مسبقاً.');
                    }
                    await client.query('commit');
                    return mapShiftRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر إغلاق الوردية.');
                }
                finally {
                    client.release();
                }
            },
        },
        expenses: {
            async listCategories() {
                const result = await pool.query(`
            select id, name, code, kind, description, is_system, is_active, created_at
            from app_expense_categories
            order by is_system desc, name asc
          `);
                return result.rows.map(mapExpenseCategoryRow);
            },
            async createCategory(input) {
                if (input.kind === 'payroll') {
                    throw new Error('فئات الرواتب تُدار تلقائياً من شاشة الموظفين ولا يمكن إنشاؤها يدوياً من صفحة المصروفات.');
                }
                try {
                    const result = await pool.query(`
              insert into app_expense_categories (id, name, code, kind, description, is_system, is_active)
              values ($1, $2, lower($3), $4, $5, false, true)
              returning id, name, code, kind, description, is_system, is_active, created_at
            `, [createId('expense-cat'), input.name.trim(), input.code.trim(), input.kind, input.description ?? null]);
                    return mapExpenseCategoryRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر إنشاء فئة المصروف.');
                }
            },
            async listExpenses() {
                const result = await pool.query(`
            select id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method, beneficiary_name, notes,
                   created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name, shift_id, reference_type, reference_id, status, created_at
            from app_expenses
            order by expense_date desc, created_at desc
          `);
                return result.rows.map(mapExpenseRow);
            },
            async createExpense(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const category = await getLockedExpenseCategory(client, input.categoryId);
                    if (!category || !category.is_active) {
                        throw new Error('فئة المصروف المحددة غير موجودة أو غير مفعلة.');
                    }
                    const referenceType = input.referenceType ?? 'manual';
                    if (referenceType === 'manual' && category.kind === 'payroll') {
                        throw new Error('صرف الرواتب والسلف لم يعد متاحاً من شاشة المصروفات. استخدم شاشة الموظفين والرواتب الشهرية.');
                    }
                    const sourceFund = input.sourceFundAccountId
                        ? await getLockedFundAccount(client, input.sourceFundAccountId)
                        : null;
                    const usesFinalCash = !sourceFund && (referenceType === 'manual' || referenceType === 'supplier-payment' || referenceType === 'employee-compensation');
                    if (input.sourceFundAccountId && (!sourceFund || !sourceFund.is_active)) {
                        throw new Error('صندوق الدفع المحدد غير موجود أو غير مفعل.');
                    }
                    const expenseId = createId('expense');
                    const expenseNo = await generateExpenseNo(client);
                    await client.query(`
              insert into app_expenses (
                id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method,
                beneficiary_name, notes, created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name, shift_id, reference_type, reference_id, status
              )
              values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'posted')
            `, [
                        expenseId,
                        expenseNo,
                        input.expenseDate,
                        category.id,
                        category.name,
                        category.kind,
                        roundMoney(input.amountIqd),
                        input.paymentMethod,
                        input.beneficiaryName ?? null,
                        input.notes ?? null,
                        input.createdByEmployeeId,
                        input.createdByEmployeeName,
                        usesFinalCash ? null : (sourceFund?.id ?? null),
                        usesFinalCash ? FINAL_CASH_LABEL : (sourceFund?.name ?? null),
                        input.shiftId ?? null,
                        referenceType,
                        input.referenceId ?? null,
                    ]);
                    if (sourceFund) {
                        await createFundMovementEntry(client, {
                            movementDate: input.expenseDate,
                            direction: 'outflow',
                            amountIqd: roundMoney(input.amountIqd),
                            sourceFundAccountId: sourceFund.id,
                            reason: referenceType === 'supplier-payment' ? 'supplier-payment' : 'expense-payment',
                            referenceType: 'expense',
                            referenceId: expenseId,
                            counterpartyName: input.beneficiaryName,
                            notes: input.notes,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    else if (usesFinalCash) {
                        await createFinalCashOutflowEntry(client, {
                            movementDate: input.expenseDate,
                            amountIqd: roundMoney(input.amountIqd),
                            reason: referenceType === 'supplier-payment' ? 'supplier-payment' : 'expense-payment',
                            referenceType: 'expense',
                            referenceId: expenseId,
                            counterpartyName: input.beneficiaryName,
                            notes: input.notes,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    await client.query('commit');
                    const result = await pool.query(`
              select id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method, beneficiary_name, notes,
                     created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name, shift_id, reference_type, reference_id, status, created_at
              from app_expenses
              where id = $1
            `, [expenseId]);
                    if (!result.rows[0]) {
                        throw new Error('تعذر تحميل المصروف بعد الحفظ.');
                    }
                    return mapExpenseRow(result.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تسجيل المصروف.');
                }
                finally {
                    client.release();
                }
            },
        },
        suppliers: {
            async listSuppliers() {
                const result = await pool.query(`
            select id, name, phone, current_balance, is_active, created_at
            from app_suppliers
            order by name asc
          `);
                return result.rows.map(mapSupplierRow);
            },
            async listPayments(supplierId) {
                const supplier = await pool.query('select id from app_suppliers where id = $1', [supplierId]);
                if (!supplier.rows[0]) {
                    throw new Error('المورد المطلوب غير موجود.');
                }
                return loadSupplierPayments(pool, supplierId);
            },
            async createSupplier(input) {
                try {
                    const result = await pool.query(`
              insert into app_suppliers (id, name, phone, current_balance, is_active)
              values ($1, $2, $3, 0, true)
              returning id, name, phone, current_balance, is_active, created_at
            `, [createId('supp'), input.name, input.phone ?? null]);
                    return mapSupplierRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر إنشاء المورد.');
                }
            },
            async updateSupplier(supplierId, input) {
                try {
                    const result = await pool.query(`
              update app_suppliers
              set name = $2, phone = $3
              where id = $1
              returning id, name, phone, current_balance, is_active, created_at
            `, [supplierId, input.name, input.phone ?? null]);
                    if (!result.rows[0]) {
                        throw new Error('المورد المطلوب غير موجود.');
                    }
                    return mapSupplierRow(result.rows[0]);
                }
                catch (error) {
                    throw mapPostgresError(error, 'تعذر تعديل المورد.');
                }
            },
            async createPayment(supplierId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const supplier = await getLockedSupplier(client, supplierId);
                    if (!supplier) {
                        throw new Error('المورد المطلوب غير موجود.');
                    }
                    const amountIqd = roundMoney(input.currencyCode === 'USD' ? input.amount * input.exchangeRate : input.amount);
                    const currentBalance = asNumber(supplier.current_balance);
                    const sourceFund = input.sourceFundAccountId
                        ? await getLockedFundAccount(client, input.sourceFundAccountId)
                        : null;
                    const usesFinalCash = !sourceFund;
                    if (amountIqd - currentBalance > 0.01) {
                        throw new Error('قيمة الدفعة تتجاوز الرصيد المستحق على المورد.');
                    }
                    if (input.sourceFundAccountId && (!sourceFund || !sourceFund.is_active)) {
                        throw new Error('صندوق الدفع المحدد غير موجود أو غير مفعل.');
                    }
                    const paymentNo = await generateSupplierPaymentNo(client);
                    const paymentId = createId('supp-pay');
                    const expenseCategory = await getLockedExpenseCategoryByCode(client, 'supplier-payment');
                    if (!expenseCategory || !expenseCategory.is_active) {
                        throw new Error('فئة مصروف تسديد المورد غير معرفة في النظام.');
                    }
                    await client.query(`
              insert into app_supplier_payments (
                id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd,
                source_fund_account_id, source_fund_account_name, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                        paymentId,
                        paymentNo,
                        supplier.id,
                        supplier.name,
                        input.currencyCode,
                        input.exchangeRate,
                        roundMoney(input.amount),
                        amountIqd,
                        sourceFund?.id ?? null,
                        sourceFund?.name ?? FINAL_CASH_LABEL,
                        input.notes ?? null,
                    ]);
                    await client.query('update app_suppliers set current_balance = $1 where id = $2', [roundMoney(currentBalance - amountIqd), supplier.id]);
                    const expenseId = createId('expense');
                    const expenseNo = await generateExpenseNo(client);
                    await client.query(`
              insert into app_expenses (
                id, expense_no, expense_date, category_id, category_name, category_kind, amount_iqd, payment_method,
                beneficiary_name, notes, created_by_employee_id, created_by_employee_name, source_fund_account_id, source_fund_account_name, shift_id, reference_type, reference_id, status
              )
              values ($1, $2, now()::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, null, 'supplier-payment', $14, 'posted')
            `, [
                        expenseId,
                        expenseNo,
                        expenseCategory.id,
                        expenseCategory.name,
                        expenseCategory.kind,
                        amountIqd,
                        input.currencyCode === 'IQD' ? 'cash' : 'bank',
                        supplier.name,
                        input.notes ?? `دفعة مورد ${paymentNo}`,
                        input.createdByEmployeeId,
                        input.createdByEmployeeName,
                        sourceFund?.id ?? null,
                        sourceFund?.name ?? FINAL_CASH_LABEL,
                        paymentId,
                    ]);
                    if (sourceFund) {
                        await createFundMovementEntry(client, {
                            movementDate: new Date().toISOString().slice(0, 10),
                            direction: 'outflow',
                            amountIqd,
                            sourceFundAccountId: sourceFund.id,
                            reason: 'supplier-payment',
                            referenceType: 'supplier-payment',
                            referenceId: paymentId,
                            counterpartyName: supplier.name,
                            notes: input.notes,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    else if (usesFinalCash) {
                        await createFinalCashOutflowEntry(client, {
                            movementDate: new Date().toISOString().slice(0, 10),
                            amountIqd,
                            reason: 'supplier-payment',
                            referenceType: 'supplier-payment',
                            referenceId: paymentId,
                            counterpartyName: supplier.name,
                            notes: input.notes,
                            createdByEmployeeId: input.createdByEmployeeId,
                            createdByEmployeeName: input.createdByEmployeeName,
                        });
                    }
                    await client.query('commit');
                    const paymentResult = await pool.query(`
              select id, payment_no, supplier_id, supplier_name, currency_code, exchange_rate, amount, amount_iqd,
                     source_fund_account_id, source_fund_account_name, notes, created_at
              from app_supplier_payments
              where id = $1
            `, [paymentId]);
                    if (!paymentResult.rows[0]) {
                        throw new Error('تعذر تحميل دفعة المورد بعد الحفظ.');
                    }
                    return mapSupplierPaymentRow(paymentResult.rows[0]);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر تسجيل دفعة المورد.');
                }
                finally {
                    client.release();
                }
            },
            async deleteSupplier(supplierId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const supplier = await getLockedSupplier(client, supplierId);
                    if (!supplier) {
                        throw new Error('المورد المطلوب غير موجود.');
                    }
                    if (Math.abs(asNumber(supplier.current_balance)) > 0.01) {
                        throw new Error('لا يمكن حذف مورد لديه رصيد قائم.');
                    }
                    await client.query('delete from app_suppliers where id = $1', [supplierId]);
                    await client.query('commit');
                    return mapSupplierRow(supplier);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر حذف المورد.');
                }
                finally {
                    client.release();
                }
            },
        },
        sales: {
            async listInvoices() {
                return loadInvoices(pool);
            },
            async createInvoice(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const customer = input.customerId ? await getLockedCustomer(client, input.customerId) : null;
                    const employee = await getLockedEmployee(client, input.employeeId);
                    const shift = await getLockedShift(client, input.shiftId);
                    const paidIqd = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0));
                    const remainingAmountIqd = roundMoney(Math.max(0, input.totalAmount - paidIqd));
                    if (input.customerId && !customer) {
                        throw new Error('العميل المحدد غير موجود.');
                    }
                    if (!employee || !employee.is_active) {
                        throw new Error('الموظف المحدد غير موجود أو غير مفعل.');
                    }
                    if (!shift || shift.status !== 'open') {
                        throw new Error('لا توجد وردية مفتوحة صالحة لهذه الفاتورة.');
                    }
                    if (shift.employee_id !== employee.id) {
                        throw new Error('الوردية المفتوحة لا تخص الموظف المحدد.');
                    }
                    if (input.paymentType === 'credit' && !customer && !input.customerName) {
                        throw new Error('حدد العميل قبل حفظ فاتورة الآجل.');
                    }
                    const aggregatedByProduct = new Map();
                    for (const item of input.items) {
                        const current = aggregatedByProduct.get(item.productId) ?? { name: item.name, quantity: 0 };
                        current.quantity = roundQuantity(current.quantity + item.baseQuantity);
                        aggregatedByProduct.set(item.productId, current);
                    }
                    for (const [productId, item] of aggregatedByProduct) {
                        const product = await getLockedProduct(client, productId);
                        if (!product) {
                            throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`);
                        }
                        const currentStock = roundQuantity(asNumber(product.stock_qty));
                        if (roundQuantity(item.quantity) > currentStock) {
                            throw new Error(`الكمية المطلوبة من ${item.name} تتجاوز الرصيد المتاح حالياً.`);
                        }
                    }
                    const invoiceId = createId('sale');
                    const invoiceNo = await generateInvoiceNo(client);
                    await client.query(`
              insert into app_sale_invoices (
                id, invoice_no, payment_status, payment_type, employee_id, employee_name, shift_id, terminal_name, customer_id, customer_name, currency_code, exchange_rate, subtotal, vat_amount, total_amount, amount_paid_iqd, remaining_amount_iqd, notes
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `, [
                        invoiceId,
                        invoiceNo,
                        remainingAmountIqd <= 0.01 ? 'paid' : paidIqd > 0 ? 'partial' : 'credit',
                        input.paymentType,
                        employee.id,
                        employee.name,
                        shift.id,
                        shift.terminal_name,
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
                    ]);
                    if (customer && remainingAmountIqd > 0.01) {
                        await client.query('update app_customers set current_balance = $1 where id = $2', [roundMoney(asNumber(customer.current_balance) + remainingAmountIqd), customer.id]);
                    }
                    for (const item of input.items) {
                        const saleItemId = createId('sale-item');
                        const product = await getLockedProduct(client, item.productId);
                        if (!product) {
                            throw new Error(`الصنف ${item.name} غير موجود في كتالوج المخزون.`);
                        }
                        await consumeInventoryBatchesForSale(client, {
                            saleItemId,
                            productId: item.productId,
                            quantity: item.baseQuantity,
                        });
                        const nextStock = roundQuantity(asNumber(product.stock_qty) - item.baseQuantity);
                        await client.query('update app_products set stock_qty = $1, updated_at = now() where id = $2', [nextStock, item.productId]);
                        await insertStockMovement(client, {
                            id: createId('movement'),
                            productId: item.productId,
                            productName: item.name,
                            movementType: 'sale',
                            quantityDelta: roundQuantity(-item.baseQuantity),
                            balanceAfter: nextStock,
                            note: `خصم بيع عبر POS للصنف ${item.name}`,
                        });
                        await client.query(`
                insert into app_sale_invoice_items (
                  id, invoice_id, product_id, name, barcode, quantity, base_quantity, unit_cost, unit_price, vat_rate, line_cost, line_total, sale_unit, unit_label, source
                )
                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              `, [
                            saleItemId,
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
                        ]);
                    }
                    for (const payment of input.payments) {
                        await client.query(`
                insert into app_sale_invoice_payments (
                  id, invoice_id, payment_method, currency_code, amount_received, amount_received_iqd, exchange_rate
                )
                values ($1, $2, $3, $4, $5, $6, $7)
              `, [
                            createId('payment'),
                            invoiceId,
                            payment.paymentMethod,
                            payment.currencyCode,
                            payment.amountReceived,
                            payment.amountReceivedIqd,
                            payment.exchangeRate,
                        ]);
                    }
                    await client.query('commit');
                    const [invoice] = await loadInvoices(pool, [invoiceId]);
                    if (!invoice) {
                        throw new Error('تعذر تحميل الفاتورة بعد الحفظ.');
                    }
                    return invoice;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر حفظ الفاتورة.');
                }
                finally {
                    client.release();
                }
            },
            async createReturn(invoiceId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const invoices = await loadInvoices(client, [invoiceId]);
                    const invoice = invoices[0];
                    if (!invoice) {
                        throw new Error('الفاتورة المطلوبة غير موجودة.');
                    }
                    if (input.settlementType === 'deduct-customer-balance' && !invoice.customerId) {
                        throw new Error('تخفيض مديونية العميل يتطلب ربط الفاتورة بعميل محفوظ.');
                    }
                    for (const returnItem of input.items) {
                        const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId);
                        if (!soldItem) {
                            throw new Error('لا يمكن إرجاع صنف غير موجود في الفاتورة الأصلية.');
                        }
                        const alreadyReturned = invoice.returns.reduce((sum, saleReturn) => {
                            const existing = saleReturn.items.find((item) => item.invoiceItemId === returnItem.invoiceItemId);
                            return sum + (existing?.quantity ?? 0);
                        }, 0);
                        const remainingQty = roundMoney(soldItem.quantity - alreadyReturned);
                        if (returnItem.quantity - remainingQty > 0.001) {
                            throw new Error(`كمية المرتجع للصنف ${soldItem.name} تتجاوز الكمية المتبقية القابلة للإرجاع.`);
                        }
                    }
                    const settlement = resolveSaleReturnSettlement(invoice, {
                        ...input,
                        items: input.items,
                    });
                    if (input.settlementType === 'deduct-customer-balance' && settlement.debtReliefIqd > 0 && !invoice.customerId) {
                        throw new Error('لا يمكن تخفيض مديونية مرتجع لفاتورة غير مرتبطة بعميل محفوظ.');
                    }
                    const saleReturnId = createId('return');
                    await client.query('insert into app_sale_returns (id, invoice_id, reason, settlement_type, cash_refund_iqd, debt_relief_iqd) values ($1, $2, $3, $4, $5, $6)', [saleReturnId, invoiceId, input.reason, input.settlementType, settlement.cashRefundIqd, settlement.debtReliefIqd]);
                    for (const returnItem of input.items) {
                        const soldItem = invoice.items.find((item) => item.id === returnItem.invoiceItemId);
                        const product = await getLockedProduct(client, soldItem?.productId ?? '');
                        if (!product || !soldItem) {
                            throw new Error('تعذر استعادة مخزون أحد الأصناف في المرتجع.');
                        }
                        const retailPerSaleUnit = (soldItem.baseQuantity || soldItem.quantity) / soldItem.quantity;
                        const restoredBaseQuantity = roundQuantity(returnItem.quantity * retailPerSaleUnit);
                        const nextStock = roundQuantity(asNumber(product.stock_qty) + restoredBaseQuantity);
                        const restoredFromBatches = await restoreInventoryBatchesForSaleReturn(client, {
                            saleItemId: soldItem.id,
                            quantity: restoredBaseQuantity,
                        });
                        await client.query('update app_products set stock_qty = $1, updated_at = now() where id = $2', [nextStock, soldItem.productId]);
                        if (restoredFromBatches < restoredBaseQuantity) {
                            await syncOpeningBatch(client, {
                                id: product.id,
                                name: product.name,
                                stock_qty: nextStock,
                                purchase_price: product.purchase_price,
                            });
                        }
                        await insertStockMovement(client, {
                            id: createId('movement'),
                            productId: soldItem.productId,
                            productName: soldItem.name,
                            movementType: 'return',
                            quantityDelta: restoredBaseQuantity,
                            balanceAfter: nextStock,
                            note: `مرتجع مبيعات: ${input.reason}`,
                        });
                        await client.query('insert into app_sale_return_items (id, sale_return_id, invoice_item_id, product_id, quantity) values ($1, $2, $3, $4, $5)', [createId('return-item'), saleReturnId, soldItem.id, soldItem.productId, returnItem.quantity]);
                    }
                    await client.query(`
              update app_sale_invoices
              set payment_status = $2,
                  amount_paid_iqd = $3,
                  remaining_amount_iqd = $4
              where id = $1
            `, [invoiceId, settlement.nextPaymentStatus, settlement.nextAmountPaidIqd, settlement.nextRemainingAmountIqd]);
                    if (invoice.customerId && settlement.debtReliefIqd > 0) {
                        const customer = await getLockedCustomer(client, invoice.customerId);
                        if (!customer) {
                            throw new Error('العميل المرتبط بالفاتورة غير موجود.');
                        }
                        await client.query('update app_customers set current_balance = $1 where id = $2', [roundMoney(asNumber(customer.current_balance) - settlement.debtReliefIqd), customer.id]);
                    }
                    await client.query('commit');
                    const [updatedInvoice] = await loadInvoices(pool, [invoiceId]);
                    if (!updatedInvoice) {
                        throw new Error('تعذر تحميل الفاتورة بعد حفظ المرتجع.');
                    }
                    return updatedInvoice;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw error instanceof Error ? error : new Error('تعذر تنفيذ مرتجع المبيعات.');
                }
                finally {
                    client.release();
                }
            },
        },
        funds: {
            async listAccounts() {
                return loadFundAccounts(pool);
            },
            async listMovements() {
                return loadFundMovements(pool);
            },
            async listCapitalTransactions() {
                return loadCapitalTransactions(pool);
            },
            async createCapitalTransaction(input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const movement = await createCapitalTransactionEntry(client, input);
                    await client.query('commit');
                    return movement;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تسجيل حركة رأس المال.');
                }
                finally {
                    client.release();
                }
            },
            async updateCapitalTransaction(movementId, input) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const existingMovement = await getCapitalTransactionRowForUpdate(client, movementId);
                    if (!existingMovement) {
                        throw new Error('حركة رأس المال المطلوبة غير موجودة.');
                    }
                    const existingContributorName = existingMovement.counterparty_name?.trim() || '';
                    const nextContributorName = input.contributorName.trim();
                    const contributorChanged = existingContributorName.toLocaleLowerCase('ar') !== nextContributorName.toLocaleLowerCase('ar');
                    if (contributorChanged) {
                        const previousContributorBalance = await getCapitalContributorBalance(client, existingContributorName, existingMovement.id);
                        if (previousContributorBalance < -0.01) {
                            throw new Error('لا يمكن نقل الحركة إلى مساهم آخر لأن حذفها من المساهم الحالي سيجعل رصيده سالباً.');
                        }
                    }
                    if (input.movementType === 'repayment') {
                        const contributorBalance = await getCapitalContributorBalance(client, nextContributorName, existingMovement.id);
                        if (contributorBalance + 0.01 < input.amountIqd) {
                            throw new Error('لا يمكن سحب مبلغ أكبر من الرصيد الصافي للمساهم بعد استبعاد الحركة الحالية.');
                        }
                    }
                    await reverseFundMovementEntry(client, existingMovement);
                    await client.query('delete from app_fund_movements where id = $1', [existingMovement.id]);
                    const movement = await createCapitalTransactionEntry(client, input);
                    await client.query('commit');
                    return movement;
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر تعديل حركة رأس المال.');
                }
                finally {
                    client.release();
                }
            },
            async deleteCapitalTransaction(movementId) {
                const client = await pool.connect();
                try {
                    await client.query('begin');
                    const existingMovement = await getCapitalTransactionRowForUpdate(client, movementId);
                    if (!existingMovement) {
                        throw new Error('حركة رأس المال المطلوبة غير موجودة.');
                    }
                    const contributorName = existingMovement.counterparty_name?.trim() || '';
                    const contributorBalance = await getCapitalContributorBalance(client, contributorName, existingMovement.id);
                    if (contributorBalance < -0.01) {
                        throw new Error('لا يمكن حذف هذه الحركة لأن ذلك سيجعل رصيد المساهم سالباً بعد احتساب السحوبات السابقة.');
                    }
                    await reverseFundMovementEntry(client, existingMovement);
                    await client.query('delete from app_fund_movements where id = $1', [existingMovement.id]);
                    await client.query('commit');
                    return mapFundMovementRow(existingMovement);
                }
                catch (error) {
                    await client.query('rollback').catch(() => undefined);
                    throw mapPostgresError(error, 'تعذر حذف حركة رأس المال.');
                }
                finally {
                    client.release();
                }
            },
        },
        settings: {
            async getSettings() {
                return loadSystemSettings(pool);
            },
            async updateSettings(input) {
                const normalized = normalizeSystemSettings({
                    ...input,
                    updatedAt: new Date().toISOString(),
                });
                const result = await pool.query(`
            insert into app_system_settings (id, payload, updated_at)
            values ($1, $2::jsonb, $3)
            on conflict (id) do update
              set payload = excluded.payload,
                  updated_at = excluded.updated_at
            returning id, payload, updated_at
          `, ['system-settings', JSON.stringify({ ...normalized, updatedAt: undefined }), normalized.updatedAt]);
                return mapSystemSettingsRow(result.rows[0]);
            },
        },
        async resetAllData() {
            await pool.query(`
        truncate table
          app_sale_return_items,
          app_sale_returns,
          app_sale_invoice_payments,
          app_sale_item_batch_allocations,
          app_sale_invoice_items,
          app_sale_invoices,
          app_purchase_receipt_items,
          app_purchase_receipts,
          app_stock_movements,
          app_inventory_batches,
          app_customer_payments,
          app_supplier_payments,
          app_expenses,
          app_expense_categories,
          app_fund_movements,
          app_fund_accounts,
          app_cashier_shifts,
          app_employee_absences,
          app_employee_compensations,
          app_customers,
          app_suppliers,
          app_system_settings,
          app_daily_sequences,
          app_employees,
          app_products
        restart identity cascade
      `);
            await seedPostgresDefaults(pool);
            await ensureDefaultAdminAccount(pool);
        },
    };
}
