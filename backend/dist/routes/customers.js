import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { customerPaymentSchema, customerUpsertSchema } from '../modules/customers/schemas.js';
export const customersRouter = Router();
customersRouter.get('/', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.customers.listCustomers(),
    });
});
customersRouter.post('/', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = customerUpsertSchema.parse(request.body);
        const customer = await dataAccess.customers.createCustomer({
            ...payload,
            phone: payload.phone || undefined,
            address: payload.address || undefined,
            notes: payload.notes || undefined,
        });
        response.status(201).json({ data: customer });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات العميل غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر إنشاء العميل.' });
    }
});
customersRouter.put('/:customerId', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = customerUpsertSchema.parse(request.body);
        const customer = await dataAccess.customers.updateCustomer(request.params.customerId, {
            ...payload,
            phone: payload.phone || undefined,
            address: payload.address || undefined,
            notes: payload.notes || undefined,
        });
        response.json({ data: customer });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات العميل غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تعديل العميل.' });
    }
});
customersRouter.delete('/:customerId', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const customer = await dataAccess.customers.deleteCustomer(request.params.customerId);
        response.json({ data: customer });
    }
    catch (error) {
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر حذف العميل.' });
    }
});
customersRouter.get('/:customerId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payments = await dataAccess.customers.listPayments(request.params.customerId);
        response.json({ data: payments });
    }
    catch (error) {
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تحميل تسديدات العميل.' });
    }
});
customersRouter.post('/:customerId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = customerPaymentSchema.parse(request.body);
        const payment = await dataAccess.customers.createPayment(request.params.customerId, {
            ...payload,
            notes: payload.notes || undefined,
        });
        response.status(201).json({ data: payment });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({ message: 'بيانات تسديد العميل غير صالحة.', issues: error.issues });
            return;
        }
        response.status(400).json({ message: error instanceof Error ? error.message : 'تعذر تسجيل تسديد العميل.' });
    }
});
