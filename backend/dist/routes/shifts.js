import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { requireEmployeePermission } from '../middleware/employee-auth.js';
import { closeShiftSchema, createShiftSchema } from '../modules/shifts/schemas.js';
import { sendAuthError, sendOperationError, sendPermissionError, sendValidationError } from './error-response.js';
export const shiftsRouter = Router();
shiftsRouter.use(requireEmployeePermission('shifts', ['admin', 'cashier']));
shiftsRouter.get('/', async (request, response) => {
    const dataAccess = getDataAccess();
    const requestedEmployeeId = typeof request.query.employeeId === 'string' ? request.query.employeeId : undefined;
    const employeeId = request.authEmployee?.role === 'cashier' ? request.authEmployee.id : requestedEmployeeId;
    response.json({ data: await dataAccess.shifts.listShifts(employeeId) });
});
shiftsRouter.post('/', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = createShiftSchema.parse(request.body);
        if (request.authEmployee?.role === 'cashier' && payload.employeeId !== request.authEmployee.id) {
            sendPermissionError(response, 'لا يمكنك فتح وردية لموظف آخر.');
            return;
        }
        const shift = await dataAccess.shifts.createShift({
            ...payload,
            openingNote: payload.openingNote || undefined,
        });
        response.status(201).json({ data: shift });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الوردية غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر فتح الوردية.');
    }
});
shiftsRouter.patch('/:shiftId/close', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = closeShiftSchema.parse(request.body);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const shifts = await dataAccess.shifts.listShifts(request.authEmployee?.role === 'cashier' ? request.authEmployee.id : undefined);
        const targetShift = shifts.find((shift) => shift.id === request.params.shiftId);
        if (!targetShift) {
            response.status(404).json({ message: 'الوردية المطلوبة غير موجودة أو غير متاحة لهذا المستخدم.' });
            return;
        }
        const shift = await dataAccess.shifts.closeShift(request.params.shiftId, {
            closingCashIqd: payload.closingCashIqd,
            closingNote: payload.closingNote || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.json({ data: shift });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات إغلاق الوردية غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إغلاق الوردية.');
    }
});
