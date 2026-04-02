import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { supplierPaymentSchema, supplierUpsertSchema } from '../modules/suppliers/schemas.js';
export const suppliersRouter = Router();
suppliersRouter.get('/', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.suppliers.listSuppliers(),
    });
});
suppliersRouter.post('/', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = supplierUpsertSchema.parse(request.body);
        const supplier = await dataAccess.suppliers.createSupplier({
            ...payload,
            phone: payload.phone || undefined,
        });
        response.status(201).json({ data: supplier });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات المورد غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر إنشاء المورد.' });
    }
});
suppliersRouter.put('/:supplierId', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = supplierUpsertSchema.parse(request.body);
        const supplier = await dataAccess.suppliers.updateSupplier(request.params.supplierId, {
            ...payload,
            phone: payload.phone || undefined,
        });
        response.json({ data: supplier });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات المورد غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تعديل المورد.' });
    }
});
suppliersRouter.delete('/:supplierId', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const supplier = await dataAccess.suppliers.deleteSupplier(request.params.supplierId);
        response.json({ data: supplier });
    }
    catch (error) {
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر حذف المورد.' });
    }
});
suppliersRouter.get('/:supplierId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payments = await dataAccess.suppliers.listPayments(request.params.supplierId);
        response.json({ data: payments });
    }
    catch (error) {
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تحميل دفعات المورد.' });
    }
});
suppliersRouter.post('/:supplierId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = supplierPaymentSchema.parse(request.body);
        const payment = await dataAccess.suppliers.createPayment(request.params.supplierId, {
            ...payload,
            notes: payload.notes || undefined,
        });
        response.status(201).json({ data: payment });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات دفعة المورد غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تسجيل دفعة المورد.' });
    }
});
