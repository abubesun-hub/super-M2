import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { requireEmployeePermission } from '../middleware/employee-auth.js';
import { expenseCategoryCreateSchema, expenseCreateSchema } from '../modules/expenses/schemas.js';
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js';
export const expensesRouter = Router();
expensesRouter.use(requireEmployeePermission('expenses', ['admin', 'accountant']));
expensesRouter.get('/categories', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({ data: await dataAccess.expenses.listCategories() });
});
expensesRouter.post('/categories', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = expenseCategoryCreateSchema.parse(request.body);
        const category = await dataAccess.expenses.createCategory({
            ...payload,
            description: payload.description || undefined,
        });
        response.status(201).json({ data: category });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات فئة المصروف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إنشاء فئة المصروف.');
    }
});
expensesRouter.get('/', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({ data: await dataAccess.expenses.listExpenses() });
});
expensesRouter.post('/', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = expenseCreateSchema.parse(request.body);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const expense = await dataAccess.expenses.createExpense({
            ...payload,
            beneficiaryName: payload.beneficiaryName || undefined,
            notes: payload.notes || undefined,
            shiftId: payload.shiftId || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.status(201).json({ data: expense });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات المصروف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسجيل المصروف.');
    }
});
