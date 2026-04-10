import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { requireEmployeeAuth, requireEmployeePermission } from '../middleware/employee-auth.js';
import { createEmployeeAccessToken } from '../modules/auth/session.js';
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js';
import { employeeAuthSchema, employeeAbsenceCreateSchema, employeeAbsenceUpdateSchema, employeeCompensationCreateSchema, employeeCreateSchema, employeePinResetSchema, employeeStatusSchema, employeeUpdateSchema, monthlyPayrollQuerySchema, monthlyPayrollSettlementSchema, } from '../modules/employees/schemas.js';
export const employeesRouter = Router();
function getSingleParam(value) {
    return Array.isArray(value) ? value[0] : value;
}
employeesRouter.get('/active', async (_request, response) => {
    const dataAccess = getDataAccess();
    const employees = await dataAccess.employees.listEmployees();
    response.json({
        data: employees
            .filter((employee) => employee.isActive)
            .map((employee) => ({
            id: employee.id,
            employeeNo: employee.employeeNo,
            name: employee.name,
            role: employee.role,
            isActive: employee.isActive,
        })),
    });
});
employeesRouter.get('/', requireEmployeePermission('employees', ['admin', 'accountant']), async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.employees.listEmployees(),
    });
});
employeesRouter.post('/', requireEmployeeAuth(['admin']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeCreateSchema.parse(request.body);
        const employee = await dataAccess.employees.createEmployee({
            ...payload,
            startDate: payload.startDate || undefined,
            serviceEndDate: payload.serviceEndDate || undefined,
            notes: payload.notes || undefined,
        });
        response.status(201).json({ data: employee });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الموظف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إنشاء الموظف.');
    }
});
employeesRouter.post('/authenticate', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeAuthSchema.parse(request.body);
        const employee = await dataAccess.employees.authenticate(payload.login, payload.pin);
        const accessToken = createEmployeeAccessToken({
            id: employee.id,
            employeeNo: employee.employeeNo,
            username: employee.username,
            name: employee.name,
            role: employee.role,
        });
        response.json({ data: { employee, accessToken } });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات تسجيل الدخول غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسجيل الدخول.', 401);
    }
});
employeesRouter.get('/:employeeId/compensations', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const employeeId = getSingleParam(request.params.employeeId);
        response.json({
            data: await dataAccess.employees.listCompensations(employeeId),
        });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر تحميل سجل صرف الموظف.');
    }
});
employeesRouter.get('/:employeeId/absences', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const employeeId = getSingleParam(request.params.employeeId);
        response.json({
            data: await dataAccess.employees.listAbsences(employeeId),
        });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر تحميل سجل غياب الموظف.');
    }
});
employeesRouter.post('/:employeeId/absences', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeAbsenceCreateSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const absence = await dataAccess.employees.createAbsence(employeeId, {
            ...payload,
            notes: payload.notes || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.status(201).json({ data: absence });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الغياب غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسجيل غياب الموظف.');
    }
});
employeesRouter.put('/:employeeId/absences/:absenceId', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeAbsenceUpdateSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const absenceId = getSingleParam(request.params.absenceId);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const absence = await dataAccess.employees.updateAbsence(employeeId, absenceId, {
            ...payload,
            notes: payload.notes || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.json({ data: absence });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الغياب غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تعديل غياب الموظف.');
    }
});
employeesRouter.delete('/:employeeId/absences/:absenceId', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const employeeId = getSingleParam(request.params.employeeId);
        const absenceId = getSingleParam(request.params.absenceId);
        response.json({
            data: await dataAccess.employees.deleteAbsence(employeeId, absenceId),
        });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر حذف غياب الموظف.');
    }
});
employeesRouter.get('/payroll/monthly', requireEmployeePermission('payroll', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = monthlyPayrollQuerySchema.parse({ month: request.query.month });
        response.json({
            data: await dataAccess.employees.listMonthlyPayroll(payload.month),
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الشهر غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تحميل ملخص الرواتب الشهري.');
    }
});
employeesRouter.get('/payroll/cumulative', requireEmployeePermission('payroll', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = monthlyPayrollQuerySchema.parse({ month: request.query.month });
        response.json({
            data: await dataAccess.employees.listCumulativePayroll(payload.month),
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الشهر غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تحميل ملخص الاستحقاقات التراكمية.');
    }
});
employeesRouter.post('/payroll/monthly/settle', requireEmployeePermission('payroll', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = monthlyPayrollSettlementSchema.parse(request.body);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const settled = await dataAccess.employees.settleMonthlyPayroll({
            ...payload,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.status(201).json({ data: settled });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات تسديد الرواتب غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسديد الرواتب الشهرية.');
    }
});
employeesRouter.post('/:employeeId/compensations', requireEmployeePermission('employees', ['admin', 'accountant']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeCompensationCreateSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const employee = request.authEmployee;
        if (!employee) {
            sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
            return;
        }
        const compensation = await dataAccess.employees.createCompensation(employeeId, {
            ...payload,
            periodLabel: payload.periodLabel || undefined,
            notes: payload.notes || undefined,
            createdByEmployeeId: employee.id,
            createdByEmployeeName: employee.name,
        });
        response.status(201).json({ data: compensation });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات صرف الموظف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تسجيل صرف الموظف.');
    }
});
employeesRouter.put('/:employeeId', requireEmployeeAuth(['admin']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeUpdateSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const employee = await dataAccess.employees.updateEmployee(employeeId, {
            ...payload,
            startDate: payload.startDate || undefined,
            serviceEndDate: payload.serviceEndDate || undefined,
            notes: payload.notes || undefined,
        });
        response.json({ data: employee });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الموظف غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تعديل الموظف.');
    }
});
employeesRouter.patch('/:employeeId/pin', requireEmployeeAuth(['admin']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeePinResetSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const employee = await dataAccess.employees.resetPin(employeeId, payload.pin);
        response.json({ data: employee });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات PIN غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر إعادة تعيين PIN.');
    }
});
employeesRouter.patch('/:employeeId/status', requireEmployeeAuth(['admin']), async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = employeeStatusSchema.parse(request.body);
        const employeeId = getSingleParam(request.params.employeeId);
        const employee = await dataAccess.employees.setActive(employeeId, payload.isActive);
        response.json({ data: employee });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الحالة غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر تحديث حالة الموظف.');
    }
});
