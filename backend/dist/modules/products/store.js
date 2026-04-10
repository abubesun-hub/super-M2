function createSeedCatalogProducts() {
    return [
        {
            id: 'prod-water',
            name: 'مياه معدنية 600 مل',
            productFamilyName: 'مياه معدنية 600 مل',
            barcode: '6281000010012',
            wholesaleBarcode: '6281000011019',
            department: 'المشروبات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'عبوة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 24,
            retailPurchasePrice: 340,
            wholesalePurchasePrice: 8160,
            retailSalePrice: 500,
            wholesaleSalePrice: 10800,
            purchasePrice: 340,
            unitPrice: 500,
            vatRate: 0.15,
            stockQty: 48,
            minStock: 12,
            soldByWeight: false,
            unitLabel: 'عبوة',
        },
        {
            id: 'prod-bread',
            name: 'خبز عربي كبير',
            productFamilyName: 'خبز عربي كبير',
            barcode: '6281000010029',
            department: 'المخبوزات',
            measurementType: 'unit',
            purchaseCostBasis: 'retail',
            retailUnit: 'ربطة',
            retailPurchasePrice: 950,
            retailSalePrice: 1500,
            purchasePrice: 950,
            unitPrice: 1500,
            vatRate: 0.15,
            stockQty: 14,
            minStock: 10,
            soldByWeight: false,
            unitLabel: 'ربطة',
        },
        {
            id: 'prod-cheese',
            name: 'جبنة بيضاء ميزان',
            productFamilyName: 'جبنة بيضاء ميزان',
            barcode: '2400150000000',
            wholesaleBarcode: '6281000012016',
            plu: '0015',
            department: 'الأجبان',
            measurementType: 'weight',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'كجم',
            wholesaleUnit: 'تنكة',
            wholesaleQuantity: 16,
            retailPurchasePrice: 12400,
            wholesalePurchasePrice: 198400,
            retailSalePrice: 18000,
            wholesaleSalePrice: 272000,
            purchasePrice: 12400,
            unitPrice: 18000,
            vatRate: 0.15,
            stockQty: 22.4,
            minStock: 6,
            soldByWeight: true,
            unitLabel: 'كجم',
        },
        {
            id: 'prod-meat',
            name: 'لحم مفروم طازج',
            productFamilyName: 'لحم مفروم طازج',
            barcode: '2400210000000',
            plu: '0021',
            department: 'اللحوم',
            measurementType: 'weight',
            purchaseCostBasis: 'retail',
            retailUnit: 'كجم',
            retailPurchasePrice: 11250,
            retailSalePrice: 16000,
            purchasePrice: 11250,
            unitPrice: 16000,
            vatRate: 0.15,
            stockQty: 17.2,
            minStock: 5,
            soldByWeight: true,
            unitLabel: 'كجم',
        },
        {
            id: 'prod-detergent',
            name: 'منظف أرضيات 1 لتر',
            productFamilyName: 'منظف أرضيات 1 لتر',
            barcode: '6281000010036',
            wholesaleBarcode: '6281000011033',
            department: 'المنظفات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'عبوة',
            wholesaleUnit: 'شدة',
            wholesaleQuantity: 12,
            retailPurchasePrice: 3000,
            wholesalePurchasePrice: 36000,
            retailSalePrice: 4500,
            wholesaleSalePrice: 50400,
            purchasePrice: 3000,
            unitPrice: 4500,
            vatRate: 0.15,
            stockQty: 9,
            minStock: 8,
            soldByWeight: false,
            unitLabel: 'عبوة',
        },
        {
            id: 'prod-dates',
            name: 'تمر فاخر 500 جم',
            productFamilyName: 'تمر فاخر 500 جم',
            barcode: '6281000010043',
            wholesaleBarcode: '6281000011040',
            department: 'التمور',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'علبة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 20,
            retailPurchasePrice: 4100,
            wholesalePurchasePrice: 82000,
            retailSalePrice: 6000,
            wholesaleSalePrice: 110000,
            purchasePrice: 4100,
            unitPrice: 6000,
            vatRate: 0.15,
            stockQty: 31,
            minStock: 7,
            soldByWeight: false,
            unitLabel: 'علبة',
        },
        {
            id: 'prod-tea-jasmine-100',
            name: 'شاي السبع حدائق 100 جم - ياسمين',
            productFamilyName: 'شاي السبع حدائق 100 جم',
            variantLabel: 'ياسمين',
            barcode: '6281000101001',
            wholesaleBarcode: '6281000101100',
            department: 'المشروبات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'علبة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 24,
            retailPurchasePrice: 1350,
            wholesalePurchasePrice: 32400,
            retailSalePrice: 2000,
            wholesaleSalePrice: 43200,
            purchasePrice: 1350,
            unitPrice: 2000,
            vatRate: 0.15,
            stockQty: 36,
            minStock: 8,
            soldByWeight: false,
            unitLabel: 'علبة',
        },
        {
            id: 'prod-tea-cardamom-100',
            name: 'شاي السبع حدائق 100 جم - هيل',
            productFamilyName: 'شاي السبع حدائق 100 جم',
            variantLabel: 'هيل',
            barcode: '6281000101002',
            wholesaleBarcode: '6281000101101',
            department: 'المشروبات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'علبة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 24,
            retailPurchasePrice: 1420,
            wholesalePurchasePrice: 34080,
            retailSalePrice: 2100,
            wholesaleSalePrice: 45600,
            purchasePrice: 1420,
            unitPrice: 2100,
            vatRate: 0.15,
            stockQty: 28,
            minStock: 8,
            soldByWeight: false,
            unitLabel: 'علبة',
        },
        {
            id: 'prod-tea-mint-100',
            name: 'شاي السبع حدائق 100 جم - نعناع',
            productFamilyName: 'شاي السبع حدائق 100 جم',
            variantLabel: 'نعناع',
            barcode: '6281000101003',
            wholesaleBarcode: '6281000101102',
            department: 'المشروبات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'علبة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 24,
            retailPurchasePrice: 1380,
            wholesalePurchasePrice: 33120,
            retailSalePrice: 2050,
            wholesaleSalePrice: 44400,
            purchasePrice: 1380,
            unitPrice: 2050,
            vatRate: 0.15,
            stockQty: 24,
            minStock: 8,
            soldByWeight: false,
            unitLabel: 'علبة',
        },
        {
            id: 'prod-chips-ketchup-40',
            name: 'شيبس كرنش 40 جم - كتشب',
            productFamilyName: 'شيبس كرنش 40 جم',
            variantLabel: 'كتشب',
            barcode: '6281000202001',
            wholesaleBarcode: '6281000202100',
            department: 'السناكات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'كيس',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 30,
            retailPurchasePrice: 430,
            wholesalePurchasePrice: 12900,
            retailSalePrice: 750,
            wholesaleSalePrice: 18000,
            purchasePrice: 430,
            unitPrice: 750,
            vatRate: 0.15,
            stockQty: 60,
            minStock: 15,
            soldByWeight: false,
            unitLabel: 'كيس',
        },
        {
            id: 'prod-chips-cheese-40',
            name: 'شيبس كرنش 40 جم - جبنة',
            productFamilyName: 'شيبس كرنش 40 جم',
            variantLabel: 'جبنة',
            barcode: '6281000202002',
            wholesaleBarcode: '6281000202101',
            department: 'السناكات',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'كيس',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 30,
            retailPurchasePrice: 430,
            wholesalePurchasePrice: 12900,
            retailSalePrice: 750,
            wholesaleSalePrice: 18000,
            purchasePrice: 430,
            unitPrice: 750,
            vatRate: 0.15,
            stockQty: 52,
            minStock: 15,
            soldByWeight: false,
            unitLabel: 'كيس',
        },
        {
            id: 'prod-shampoo-rose-400',
            name: 'شامبو لافندر 400 مل - ورد',
            productFamilyName: 'شامبو لافندر 400 مل',
            variantLabel: 'ورد',
            barcode: '6281000303001',
            wholesaleBarcode: '6281000303100',
            department: 'العناية الشخصية',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'عبوة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 12,
            retailPurchasePrice: 2850,
            wholesalePurchasePrice: 34200,
            retailSalePrice: 4250,
            wholesaleSalePrice: 46800,
            purchasePrice: 2850,
            unitPrice: 4250,
            vatRate: 0.15,
            stockQty: 18,
            minStock: 6,
            soldByWeight: false,
            unitLabel: 'عبوة',
        },
        {
            id: 'prod-shampoo-argan-400',
            name: 'شامبو لافندر 400 مل - أركان',
            productFamilyName: 'شامبو لافندر 400 مل',
            variantLabel: 'أركان',
            barcode: '6281000303002',
            wholesaleBarcode: '6281000303101',
            department: 'العناية الشخصية',
            measurementType: 'unit',
            purchaseCostBasis: 'wholesale',
            retailUnit: 'عبوة',
            wholesaleUnit: 'كارتونة',
            wholesaleQuantity: 12,
            retailPurchasePrice: 2920,
            wholesalePurchasePrice: 35040,
            retailSalePrice: 4350,
            wholesaleSalePrice: 48000,
            purchasePrice: 2920,
            unitPrice: 4350,
            vatRate: 0.15,
            stockQty: 16,
            minStock: 6,
            soldByWeight: false,
            unitLabel: 'عبوة',
        },
    ];
}
const catalogProducts = createSeedCatalogProducts();
const stockMovements = [];
const inventoryBatches = [];
const saleItemBatchAllocations = [];
function createMovementId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `movement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function createBatchId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function recordStockMovement(input) {
    const movement = {
        ...input,
        id: createMovementId(),
        createdAt: new Date().toISOString(),
    };
    stockMovements.unshift(movement);
    return movement;
}
function sumBatchQuantity(batches) {
    return roundQuantity(batches.reduce((sum, batch) => sum + batch.remainingQuantity, 0));
}
function getProductBatches(productId) {
    return inventoryBatches.filter((batch) => batch.productId === productId);
}
function syncOpeningBatch(product) {
    const purchaseBatches = getProductBatches(product.id).filter((batch) => batch.source === 'purchase');
    const trackedQuantity = sumBatchQuantity(purchaseBatches);
    const desiredQuantity = roundQuantity(Math.max(0, product.stockQty - trackedQuantity));
    const openingBatch = inventoryBatches.find((batch) => batch.productId === product.id && batch.source === 'opening');
    if (!openingBatch && desiredQuantity <= 0) {
        return;
    }
    if (!openingBatch) {
        inventoryBatches.unshift({
            id: createBatchId(),
            productId: product.id,
            productName: product.name,
            source: 'opening',
            receivedQuantity: desiredQuantity,
            remainingQuantity: desiredQuantity,
            retailUnitCost: product.purchasePrice,
            createdAt: new Date().toISOString(),
        });
        return;
    }
    if (desiredQuantity > openingBatch.remainingQuantity) {
        openingBatch.receivedQuantity = roundQuantity(openingBatch.receivedQuantity + (desiredQuantity - openingBatch.remainingQuantity));
    }
    openingBatch.productName = product.name;
    openingBatch.retailUnitCost = product.purchasePrice;
    openingBatch.remainingQuantity = desiredQuantity;
}
function compareBatchesByFefo(left, right) {
    if (left.expiryDate && right.expiryDate) {
        return left.expiryDate.localeCompare(right.expiryDate) || left.createdAt.localeCompare(right.createdAt);
    }
    if (left.expiryDate) {
        return -1;
    }
    if (right.expiryDate) {
        return 1;
    }
    return left.createdAt.localeCompare(right.createdAt);
}
function getConsumableBatches(product) {
    syncOpeningBatch(product);
    return getProductBatches(product.id)
        .filter((batch) => batch.remainingQuantity > 0)
        .sort(compareBatchesByFefo);
}
export function listCatalogProducts() {
    return catalogProducts.map((product) => ({ ...product }));
}
export function listStockMovements() {
    return stockMovements.map((movement) => ({ ...movement }));
}
export function listInventoryBatches() {
    return inventoryBatches.map((batch) => ({ ...batch }));
}
function getPurchaseBatchByReceiptItemId(receiptItemId) {
    if (!receiptItemId) {
        return null;
    }
    return inventoryBatches.find((batch) => batch.source === 'purchase' && batch.purchaseReceiptItemId === receiptItemId) ?? null;
}
function syncProductPurchasePricesFromLatestBatch(product) {
    const latestPurchaseBatch = inventoryBatches
        .filter((batch) => batch.productId === product.id && batch.source === 'purchase')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!latestPurchaseBatch) {
        return;
    }
    product.purchasePrice = Number(latestPurchaseBatch.retailUnitCost.toFixed(2));
    product.retailPurchasePrice = Number(latestPurchaseBatch.retailUnitCost.toFixed(2));
    if (product.wholesaleQuantity && product.wholesaleQuantity > 0) {
        product.wholesalePurchasePrice = Number((latestPurchaseBatch.retailUnitCost * product.wholesaleQuantity).toFixed(2));
    }
}
export function assertPurchaseReceiptCanBeReversed(lines, actionLabel) {
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`);
        }
        const batch = getPurchaseBatchByReceiptItemId(line.receiptItemId);
        if (!batch) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن دفعة الصنف ${line.name} لم تعد متاحة في المخزون.`);
        }
        const consumedQuantity = roundQuantity(batch.receivedQuantity - batch.remainingQuantity);
        if (consumedQuantity > 0.001) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن الصنف ${line.name} خرجت منه كمية ${consumedQuantity} من المخزون.`);
        }
    }
}
export function reversePurchaseFromInventory(lines, note, actionLabel) {
    assertPurchaseReceiptCanBeReversed(lines, actionLabel);
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        const batch = getPurchaseBatchByReceiptItemId(line.receiptItemId);
        if (!product || !batch) {
            continue;
        }
        const nextBalance = roundQuantity(product.stockQty - line.retailQuantity);
        if (nextBalance < 0) {
            throw new Error(`لا يمكن ${actionLabel} السند لأن رصيد ${line.name} سيصبح سالباً.`);
        }
        product.stockQty = nextBalance;
        const batchIndex = inventoryBatches.findIndex((entry) => entry.id === batch.id);
        if (batchIndex >= 0) {
            inventoryBatches.splice(batchIndex, 1);
        }
        syncProductPurchasePricesFromLatestBatch(product);
        syncOpeningBatch(product);
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'purchase',
            quantityDelta: roundQuantity(-line.retailQuantity),
            balanceAfter: product.stockQty,
            note,
        });
    }
}
function roundQuantity(value) {
    return Number(value.toFixed(3));
}
function generateProductId() {
    return `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeOptionalText(value) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}
export function buildProductDisplayName(productFamilyName, variantLabel) {
    const normalizedFamilyName = productFamilyName.trim();
    const normalizedVariantLabel = normalizeOptionalText(variantLabel);
    return normalizedVariantLabel ? `${normalizedFamilyName} - ${normalizedVariantLabel}` : normalizedFamilyName;
}
function normalizeCatalogProduct(id, input) {
    const wholesaleEnabled = Boolean(input.wholesaleUnit && input.wholesaleQuantity && input.wholesaleQuantity > 0);
    const retailPurchasePrice = Number(input.retailPurchasePrice.toFixed(2));
    const retailSalePrice = Number(input.retailSalePrice.toFixed(2));
    const productFamilyName = normalizeOptionalText(input.productFamilyName) ?? input.name.trim();
    const variantLabel = normalizeOptionalText(input.variantLabel);
    return {
        id,
        name: buildProductDisplayName(productFamilyName, variantLabel),
        productFamilyName,
        variantLabel,
        barcode: input.barcode,
        wholesaleBarcode: wholesaleEnabled ? input.wholesaleBarcode : undefined,
        plu: input.plu,
        department: input.department,
        measurementType: input.measurementType,
        purchaseCostBasis: wholesaleEnabled ? input.purchaseCostBasis : 'retail',
        retailUnit: input.retailUnit,
        wholesaleUnit: wholesaleEnabled ? input.wholesaleUnit : undefined,
        wholesaleQuantity: wholesaleEnabled ? roundQuantity(input.wholesaleQuantity ?? 0) : undefined,
        retailPurchasePrice,
        wholesalePurchasePrice: wholesaleEnabled && input.wholesalePurchasePrice !== undefined ? Number(input.wholesalePurchasePrice.toFixed(2)) : undefined,
        retailSalePrice,
        wholesaleSalePrice: wholesaleEnabled && input.wholesaleSalePrice !== undefined ? Number(input.wholesaleSalePrice.toFixed(2)) : undefined,
        purchasePrice: retailPurchasePrice,
        unitPrice: retailSalePrice,
        vatRate: input.vatRate,
        stockQty: roundQuantity(input.stockQty),
        minStock: roundQuantity(input.minStock),
        soldByWeight: input.measurementType === 'weight',
        unitLabel: input.retailUnit,
    };
}
function assertUniqueBarcode(barcode, excludedProductId) {
    const existingProduct = catalogProducts.find((product) => {
        if (product.id === excludedProductId) {
            return false;
        }
        return product.barcode === barcode || product.wholesaleBarcode === barcode;
    });
    if (existingProduct) {
        throw new Error('الباركود مستخدم مسبقاً لصنف آخر.');
    }
}
function assertUniqueWholesaleBarcode(wholesaleBarcode, excludedProductId) {
    if (!wholesaleBarcode) {
        return;
    }
    const existingProduct = catalogProducts.find((product) => {
        if (product.id === excludedProductId) {
            return false;
        }
        return product.barcode === wholesaleBarcode || product.wholesaleBarcode === wholesaleBarcode;
    });
    if (existingProduct) {
        throw new Error('باركود الجملة مستخدم مسبقاً لصنف آخر.');
    }
}
function assertUniquePlu(plu, excludedProductId) {
    if (!plu) {
        return;
    }
    const existingProduct = catalogProducts.find((product) => product.plu === plu && product.id !== excludedProductId);
    if (existingProduct) {
        throw new Error('رمز PLU مستخدم مسبقاً لصنف آخر.');
    }
}
export function applySaleToInventory(lines) {
    const requestedByProduct = new Map();
    for (const line of lines) {
        const current = requestedByProduct.get(line.productId) ?? { name: line.name, quantity: 0 };
        current.quantity = roundQuantity(current.quantity + line.quantity);
        requestedByProduct.set(line.productId, current);
    }
    for (const [productId, requested] of requestedByProduct) {
        const product = catalogProducts.find((entry) => entry.id === productId);
        if (!product) {
            throw new Error(`الصنف ${requested.name} غير موجود في كتالوج المخزون.`);
        }
        if (roundQuantity(requested.quantity) > roundQuantity(product.stockQty)) {
            throw new Error(`الكمية المطلوبة من ${requested.name} تتجاوز الرصيد المتاح حالياً.`);
        }
        const batches = getConsumableBatches(product);
        const availableFromBatches = sumBatchQuantity(batches);
        if (roundQuantity(requested.quantity) > availableFromBatches) {
            throw new Error(`تعذر توزيع الكمية المباعة من ${requested.name} على الدفعات المتاحة.`);
        }
    }
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            continue;
        }
        const batches = getConsumableBatches(product);
        let remainingToConsume = roundQuantity(line.quantity);
        for (const batch of batches) {
            if (remainingToConsume <= 0) {
                break;
            }
            const consumedQuantity = roundQuantity(Math.min(batch.remainingQuantity, remainingToConsume));
            if (consumedQuantity <= 0) {
                continue;
            }
            batch.remainingQuantity = roundQuantity(batch.remainingQuantity - consumedQuantity);
            if (line.saleItemId) {
                saleItemBatchAllocations.push({
                    saleItemId: line.saleItemId,
                    productId: line.productId,
                    batchId: batch.id,
                    quantity: consumedQuantity,
                    returnedQuantity: 0,
                });
            }
            remainingToConsume = roundQuantity(remainingToConsume - consumedQuantity);
        }
        product.stockQty = roundQuantity(product.stockQty - line.quantity);
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'sale',
            quantityDelta: roundQuantity(-line.quantity),
            balanceAfter: product.stockQty,
            note: `خصم بيع عبر POS للصنف ${line.name}`,
        });
    }
}
export function adjustProductStock(input) {
    const product = catalogProducts.find((entry) => entry.id === input.productId);
    if (!product) {
        throw new Error('الصنف المطلوب غير موجود.');
    }
    const nextBalance = roundQuantity(product.stockQty + input.quantityDelta);
    if (nextBalance < 0) {
        throw new Error(`لا يمكن أن يصبح رصيد ${product.name} أقل من الصفر.`);
    }
    product.stockQty = nextBalance;
    syncOpeningBatch(product);
    recordStockMovement({
        productId: product.id,
        productName: product.name,
        movementType: 'adjustment',
        quantityDelta: roundQuantity(input.quantityDelta),
        balanceAfter: product.stockQty,
        note: input.note,
    });
    return { ...product };
}
export function restoreSaleToInventory(lines, reason) {
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`);
        }
    }
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            continue;
        }
        let remainingToRestore = roundQuantity(line.quantity);
        if (line.saleItemId) {
            const allocations = saleItemBatchAllocations.filter((allocation) => allocation.saleItemId === line.saleItemId && allocation.returnedQuantity < allocation.quantity);
            for (const allocation of allocations) {
                if (remainingToRestore <= 0) {
                    break;
                }
                const batch = inventoryBatches.find((entry) => entry.id === allocation.batchId);
                if (!batch) {
                    continue;
                }
                const remainingAllocation = roundQuantity(allocation.quantity - allocation.returnedQuantity);
                const restoredQuantity = roundQuantity(Math.min(remainingAllocation, remainingToRestore));
                if (restoredQuantity <= 0) {
                    continue;
                }
                batch.remainingQuantity = roundQuantity(batch.remainingQuantity + restoredQuantity);
                allocation.returnedQuantity = roundQuantity(allocation.returnedQuantity + restoredQuantity);
                remainingToRestore = roundQuantity(remainingToRestore - restoredQuantity);
            }
        }
        product.stockQty = roundQuantity(product.stockQty + line.quantity);
        syncOpeningBatch(product);
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'return',
            quantityDelta: roundQuantity(line.quantity),
            balanceAfter: product.stockQty,
            note: `مرتجع مبيعات: ${reason}`,
        });
    }
}
export function receivePurchaseToInventory(lines, note) {
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            throw new Error(`الصنف ${line.name} غير موجود في كتالوج المخزون.`);
        }
        if (roundQuantity(line.retailQuantity) <= 0) {
            throw new Error(`كمية الاستلام للصنف ${line.name} يجب أن تكون أكبر من الصفر.`);
        }
    }
    for (const line of lines) {
        const product = catalogProducts.find((entry) => entry.id === line.productId);
        if (!product) {
            continue;
        }
        product.stockQty = roundQuantity(product.stockQty + line.retailQuantity);
        product.purchasePrice = Number(line.retailUnitCost.toFixed(2));
        product.retailPurchasePrice = Number(line.retailUnitCost.toFixed(2));
        if (line.wholesaleUnitCost !== undefined) {
            product.wholesalePurchasePrice = Number(line.wholesaleUnitCost.toFixed(2));
        }
        else if (product.wholesaleQuantity && product.wholesaleQuantity > 0) {
            product.wholesalePurchasePrice = Number((line.retailUnitCost * product.wholesaleQuantity).toFixed(2));
        }
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'purchase',
            quantityDelta: roundQuantity(line.retailQuantity),
            balanceAfter: product.stockQty,
            note,
        });
        inventoryBatches.unshift({
            id: createBatchId(),
            productId: product.id,
            productName: product.name,
            source: 'purchase',
            purchaseReceiptItemId: line.purchaseReceiptItemId,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
            purchaseDate: line.purchaseDate,
            supplierName: line.supplierName,
            receivedQuantity: roundQuantity(line.retailQuantity),
            remainingQuantity: roundQuantity(line.retailQuantity),
            retailUnitCost: Number(line.retailUnitCost.toFixed(2)),
            createdAt: new Date().toISOString(),
        });
        syncOpeningBatch(product);
    }
}
export function createCatalogProduct(input) {
    assertUniqueBarcode(input.barcode);
    assertUniqueWholesaleBarcode(input.wholesaleBarcode);
    assertUniquePlu(input.plu);
    const product = normalizeCatalogProduct(generateProductId(), input);
    catalogProducts.unshift(product);
    if (product.stockQty > 0) {
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'adjustment',
            quantityDelta: product.stockQty,
            balanceAfter: product.stockQty,
            note: 'رصيد افتتاحي عند إنشاء الصنف',
        });
        syncOpeningBatch(product);
    }
    return { ...product };
}
export function updateCatalogProduct(productId, input) {
    const product = catalogProducts.find((entry) => entry.id === productId);
    if (!product) {
        throw new Error('الصنف المطلوب غير موجود.');
    }
    assertUniqueBarcode(input.barcode, productId);
    assertUniqueWholesaleBarcode(input.wholesaleBarcode, productId);
    assertUniquePlu(input.plu, productId);
    const previousStockQty = product.stockQty;
    Object.assign(product, normalizeCatalogProduct(productId, input));
    const stockDelta = roundQuantity(product.stockQty - previousStockQty);
    if (stockDelta !== 0) {
        recordStockMovement({
            productId: product.id,
            productName: product.name,
            movementType: 'adjustment',
            quantityDelta: stockDelta,
            balanceAfter: product.stockQty,
            note: 'تعديل بيانات الصنف وتحديث الرصيد',
        });
    }
    syncOpeningBatch(product);
    for (const batch of inventoryBatches) {
        if (batch.productId === product.id) {
            batch.productName = product.name;
            if (batch.source === 'opening') {
                batch.retailUnitCost = product.purchasePrice;
            }
        }
    }
    return { ...product };
}
export function deleteCatalogProduct(productId) {
    const productIndex = catalogProducts.findIndex((entry) => entry.id === productId);
    if (productIndex < 0) {
        throw new Error('الصنف المطلوب غير موجود.');
    }
    const product = catalogProducts[productIndex];
    if (product.stockQty > 0) {
        throw new Error('لا يمكن حذف صنف لا يزال لديه رصيد مخزني. صفّر الرصيد أولاً.');
    }
    catalogProducts.splice(productIndex, 1);
    for (let index = inventoryBatches.length - 1; index >= 0; index -= 1) {
        if (inventoryBatches[index]?.productId === productId) {
            inventoryBatches.splice(index, 1);
        }
    }
    for (let index = saleItemBatchAllocations.length - 1; index >= 0; index -= 1) {
        if (saleItemBatchAllocations[index]?.productId === productId) {
            saleItemBatchAllocations.splice(index, 1);
        }
    }
    return { ...product };
}
export function resetProductsStore() {
    catalogProducts.splice(0, catalogProducts.length, ...createSeedCatalogProducts());
    stockMovements.splice(0, stockMovements.length);
    inventoryBatches.splice(0, inventoryBatches.length);
    saleItemBatchAllocations.splice(0, saleItemBatchAllocations.length);
}
