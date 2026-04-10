import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { requireEmployeePermission } from '../middleware/employee-auth.js';
import { customerPaymentSchema, customerUpsertSchema } from '../modules/customers/schemas.js';
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js';
export const customersRouter = Router();
customersRouter.use(requireEmployeePermission('customers', ['admin', 'cashier']));
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
            sendValidationError(response, 'بيانات العميل غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إنشاء العميل.');
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
            sendValidationError(response, 'بيانات العميل غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تعديل العميل.');
    }
});
customersRouter.delete('/:customerId', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const customer = await dataAccess.customers.deleteCustomer(request.params.customerId);
        response.json({ data: customer });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر حذف العميل.');
    }
});
customersRouter.get('/:customerId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payments = await dataAccess.customers.listPayments(request.params.customerId);
        response.json({ data: payments });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر تحميل تسديدات العميل.');
    }
});
customersRouter.post('/:customerId/payments', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = customerPaymentSchema.parse(request.body);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const payment = await dataAccess.customers.createPayment(request.params.customerId, {
            ...payload,
            notes: payload.notes || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.status(201).json({ data: payment });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات تسديد العميل غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسجيل تسديد العميل.');
    }
});
