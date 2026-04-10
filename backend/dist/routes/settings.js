import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess, getStorageInfo } from '../data/index.js';
import { requireEmployeeAuth } from '../middleware/employee-auth.js';
import { systemSettingsUpdateSchema } from '../modules/settings/schemas.js';
import { resolvePermissionsForRole } from '../modules/settings/store.js';
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js';
export const settingsRouter = Router();
settingsRouter.get('/me', requireEmployeeAuth(), async (request, response) => {
    const employee = request.authEmployee;
    if (!employee) {
        sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
        return;
    }
    const settings = await getDataAccess().settings.getSettings();
    response.json({
        data: {
            storeName: settings.storeName,
            legalName: settings.legalName,
            primaryPhone: settings.primaryPhone,
            secondaryPhone: settings.secondaryPhone,
            whatsapp: settings.whatsapp,
            email: settings.email,
            address: settings.address,
            invoiceFooter: settings.invoiceFooter,
            defaultDiscountPercent: settings.defaultDiscountPercent,
            maxManualDiscountPercent: settings.maxManualDiscountPercent,
            allowPriceDiscounts: settings.allowPriceDiscounts,
            permissions: resolvePermissionsForRole(settings, employee.role),
            updatedAt: settings.updatedAt,
        },
    });
});
settingsRouter.get('/', requireEmployeeAuth(['admin']), async (_request, response) => {
    response.json({ data: await getDataAccess().settings.getSettings() });
});
settingsRouter.get('/storage', requireEmployeeAuth(['admin']), async (_request, response) => {
    response.json({ data: getStorageInfo() });
});
settingsRouter.put('/', requireEmployeeAuth(['admin']), async (request, response) => {
    try {
        const payload = systemSettingsUpdateSchema.parse(request.body);
        const settings = await getDataAccess().settings.updateSettings({
            storeName: payload.storeName,
            legalName: payload.legalName || undefined,
            primaryPhone: payload.primaryPhone || undefined,
            secondaryPhone: payload.secondaryPhone || undefined,
            whatsapp: payload.whatsapp || undefined,
            email: payload.email || undefined,
            address: payload.address || undefined,
            invoiceFooter: payload.invoiceFooter || undefined,
            defaultDiscountPercent: payload.defaultDiscountPercent,
            maxManualDiscountPercent: payload.maxManualDiscountPercent,
            allowPriceDiscounts: payload.allowPriceDiscounts,
            rolePermissions: {
                admin: payload.rolePermissions.admin ?? [],
                cashier: payload.rolePermissions.cashier,
                inventory: payload.rolePermissions.inventory,
                accountant: payload.rolePermissions.accountant,
            },
        });
        response.json({ data: settings });
    }
    catch (error) {
        if (error instanceof ZodError) {
            sendValidationError(response, 'بيانات الإعدادات غير صالحة.', error.issues);
            return;
        }
        sendOperationError(response, error, 'تعذر حفظ إعدادات النظام.');
    }
});
settingsRouter.delete('/data', requireEmployeeAuth(['admin']), async (_request, response) => {
    try {
        await getDataAccess().resetAllData();
        response.json({
            data: {
                storage: getStorageInfo(),
                message: 'تم مسح جميع البيانات وإعادة تهيئة النظام بالقيم الأساسية.',
            },
        });
    }
    catch (error) {
        sendOperationError(response, error, 'تعذر مسح جميع البيانات.');
    }
});
