import { Router } from 'express';
import { z, ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { requireEmployeePermission } from '../middleware/employee-auth.js';
import { sendOperationError, sendValidationError } from './error-response.js';
export const productsRouter = Router();
function getSingleParam(value) {
    return Array.isArray(value) ? value[0] : value;
}
const stockAdjustmentSchema = z.object({
    productId: z.string().min(1),
    quantityDelta: z.number().refine((value) => value !== 0, {
        message: 'يجب أن تكون كمية التعديل أكبر من الصفر أو أقل منه.',
    }),
    note: z.string().min(3).max(200),
});
const productUpsertSchema = z.object({
    name: z.string().min(3).max(200),
    productFamilyName: z.string().min(3).max(200).optional().or(z.literal('')),
    variantLabel: z.string().max(120).optional().or(z.literal('')),
    barcode: z.string().min(3).max(50),
    wholesaleBarcode: z.string().min(3).max(50).optional().or(z.literal('')),
    plu: z.string().max(10).optional().or(z.literal('')),
    department: z.string().min(2).max(100),
    measurementType: z.enum(['unit', 'weight']).default('unit'),
    purchaseCostBasis: z.enum(['retail', 'wholesale']).default('retail'),
    retailUnit: z.string().min(1).max(30),
    wholesaleUnit: z.string().max(30).optional().or(z.literal('')),
    wholesaleQuantity: z.number().positive().optional(),
    retailPurchasePrice: z.number().nonnegative(),
    wholesalePurchasePrice: z.number().nonnegative().optional(),
    retailSalePrice: z.number().nonnegative(),
    wholesaleSalePrice: z.number().nonnegative().optional(),
    vatRate: z.number().min(0).max(1),
    stockQty: z.number().min(0),
    minStock: z.number().min(0),
}).superRefine((value, context) => {
    const hasWholesale = Boolean(value.wholesaleUnit && value.wholesaleQuantity && value.wholesaleQuantity > 0);
    if (value.purchaseCostBasis === 'wholesale' && !hasWholesale) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['purchaseCostBasis'],
            message: 'لا يمكن اعتماد تكلفة الجملة بدون تحديد وحدة الجملة ومحتواها.',
        });
    }
    if (hasWholesale && value.wholesaleSalePrice === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wholesaleSalePrice'],
            message: 'أدخل سعر بيع الجملة عند تفعيل وحدة الجملة.',
        });
    }
    if (value.purchaseCostBasis === 'wholesale' && value.wholesalePurchasePrice === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wholesalePurchasePrice'],
            message: 'أدخل تكلفة شراء الجملة عند اعتمادها كأساس.',
        });
    }
    if (hasWholesale && !value.wholesaleBarcode) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wholesaleBarcode'],
            message: 'أدخل باركود الجملة عند تفعيل وحدة الجملة.',
        });
    }
    if (value.wholesaleBarcode && value.wholesaleBarcode === value.barcode) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['wholesaleBarcode'],
            message: 'يجب أن يختلف باركود الجملة عن باركود المفرد.',
        });
    }
});
productsRouter.get('/', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.products.listProducts(),
    });
});
productsRouter.get('/price-check', async (_request, response) => {
    const dataAccess = getDataAccess();
    const products = await dataAccess.products.listProducts();
    response.json({
        data: products.map((product) => ({
            id: product.id,
            name: product.name,
            productFamilyName: product.productFamilyName,
            variantLabel: product.variantLabel,
            barcode: product.barcode,
            wholesaleBarcode: product.wholesaleBarcode,
            plu: product.plu,
            department: product.department,
            measurementType: product.measurementType,
            retailUnit: product.retailUnit,
            wholesaleUnit: product.wholesaleUnit,
            wholesaleQuantity: product.wholesaleQuantity,
            retailSalePrice: product.retailSalePrice,
            wholesaleSalePrice: product.wholesaleSalePrice,
            unitLabel: product.unitLabel,
        })),
    });
});
productsRouter.get('/movements', requireEmployeePermission('inventory', ['admin', 'inventory']), async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.products.listMovements(),
    });
});
productsRouter.get('/batches', requireEmployeePermission('batches', ['admin', 'inventory']), async (request, response) => {
    const dataAccess = getDataAccess();
    const productId = typeof request.query.productId === 'string' && request.query.productId.trim().length > 0
        ? request.query.productId.trim()
        : undefined;
    response.json({
        data: await dataAccess.products.listBatches(productId),
    });
});
productsRouter.post('/', requireEmployeePermission('inventory', ['admin', 'inventory']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = productUpsertSchema.parse(request.body);
        const product = await dataAccess.products.createProduct({
            ...payload,
            productFamilyName: payload.productFamilyName || undefined,
            variantLabel: payload.variantLabel || undefined,
            wholesaleBarcode: payload.wholesaleBarcode || undefined,
            plu: payload.plu || undefined,
            wholesaleUnit: payload.wholesaleUnit || undefined,
        });
        response.status(201).json({
            data: product,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الصنف الجديد غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إنشاء الصنف.');
    }
});
productsRouter.put('/:productId', requireEmployeePermission('inventory', ['admin', 'inventory']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = productUpsertSchema.parse(request.body);
        const productId = getSingleParam(request.params.productId);
        const product = await dataAccess.products.updateProduct(productId, {
            ...payload,
            productFamilyName: payload.productFamilyName || undefined,
            variantLabel: payload.variantLabel || undefined,
            wholesaleBarcode: payload.wholesaleBarcode || undefined,
            plu: payload.plu || undefined,
            wholesaleUnit: payload.wholesaleUnit || undefined,
        });
        response.json({
            data: product,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات تعديل الصنف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تعديل الصنف.');
    }
});
productsRouter.delete('/:productId', requireEmployeePermission('inventory', ['admin', 'inventory']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const productId = getSingleParam(request.params.productId);
        const product = await dataAccess.products.deleteProduct(productId);
        response.json({
            data: product,
        });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر حذف الصنف.');
    }
});
productsRouter.post('/adjustments', requireEmployeePermission('inventory', ['admin', 'inventory']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = stockAdjustmentSchema.parse(request.body);
        const updatedProduct = await dataAccess.products.adjustStock(payload);
        response.status(201).json({
            data: updatedProduct,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات تعديل المخزون غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تنفيذ تعديل المخزون.');
    }
});
