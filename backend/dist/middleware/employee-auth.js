import { getDataAccess } from '../data/index.js';
import { sendAuthError, sendPermissionError } from '../routes/error-response.js';
import { verifyEmployeeAccessToken } from '../modules/auth/session.js';
import { hasSystemPermission } from '../modules/settings/store.js';
function readBearerToken(request) {
    const authorizationHeader = request.headers.authorization?.trim();
    if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) {
        return null;
    }
    return authorizationHeader.slice(7).trim() || null;
}
function authenticateRequest(request, response) {
    const token = readBearerToken(request);
    if (!token) {
        sendAuthError(response, 'يجب تسجيل الدخول أولاً.');
        return null;
    }
    const employee = verifyEmployeeAccessToken(token);
    if (!employee) {
        sendAuthError(response, 'جلسة الدخول غير صالحة أو منتهية.');
        return null;
    }
    request.authEmployee = employee;
    return employee;
}
export function requireEmployeeAuth(allowedRoles) {
    return (request, response, next) => {
        const employee = authenticateRequest(request, response);
        if (!employee) {
            return;
        }
        if (allowedRoles && !allowedRoles.includes(employee.role)) {
            sendPermissionError(response, 'ليست لديك صلاحية للوصول إلى هذا المورد.');
            return;
        }
        next();
    };
}
export function requireEmployeePermission(permission, allowedRoles) {
    return async (request, response, next) => {
        const employee = authenticateRequest(request, response);
        if (!employee) {
            return;
        }
        if (allowedRoles?.includes(employee.role)) {
            next();
            return;
        }
        const settings = await getDataAccess().settings.getSettings();
        if (!hasSystemPermission(settings, employee.role, permission)) {
            sendPermissionError(response, 'ليست لديك صلاحية للوصول إلى هذا المورد.');
            return;
        }
        next();
    };
}
