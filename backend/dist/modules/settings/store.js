export const systemPermissionKeys = [
    'dashboard',
    'inventory',
    'batches',
    'purchases',
    'expenses',
    'payroll',
    'employees',
    'customers',
    'sales',
    'shifts',
    'suppliers',
    'system-settings',
];
function uniqPermissions(permissions) {
    return [...new Set(permissions)].filter((permission) => systemPermissionKeys.includes(permission));
}
export function createDefaultRolePermissions() {
    return {
        admin: [...systemPermissionKeys],
        cashier: ['customers', 'sales', 'shifts'],
        inventory: ['inventory', 'batches', 'purchases', 'suppliers'],
        accountant: ['expenses', 'payroll', 'employees'],
    };
}
export function createDefaultSystemSettings() {
    return {
        storeName: 'Super M2',
        legalName: 'سوبر ماركت Super M2',
        primaryPhone: '',
        secondaryPhone: '',
        whatsapp: '',
        email: '',
        address: '',
        invoiceFooter: 'شكراً لتسوقكم معنا',
        defaultDiscountPercent: 0,
        maxManualDiscountPercent: 15,
        allowPriceDiscounts: false,
        rolePermissions: createDefaultRolePermissions(),
        updatedAt: new Date().toISOString(),
    };
}
export function normalizeSystemSettings(input) {
    const defaults = createDefaultSystemSettings();
    const rolePermissionsInput = input?.rolePermissions;
    return {
        storeName: input?.storeName?.trim() || defaults.storeName,
        legalName: input?.legalName?.trim() || undefined,
        primaryPhone: input?.primaryPhone?.trim() || undefined,
        secondaryPhone: input?.secondaryPhone?.trim() || undefined,
        whatsapp: input?.whatsapp?.trim() || undefined,
        email: input?.email?.trim() || undefined,
        address: input?.address?.trim() || undefined,
        invoiceFooter: input?.invoiceFooter?.trim() || defaults.invoiceFooter,
        defaultDiscountPercent: typeof input?.defaultDiscountPercent === 'number' ? Math.max(0, Math.min(100, Number(input.defaultDiscountPercent.toFixed(2)))) : defaults.defaultDiscountPercent,
        maxManualDiscountPercent: typeof input?.maxManualDiscountPercent === 'number' ? Math.max(0, Math.min(100, Number(input.maxManualDiscountPercent.toFixed(2)))) : defaults.maxManualDiscountPercent,
        allowPriceDiscounts: typeof input?.allowPriceDiscounts === 'boolean' ? input.allowPriceDiscounts : defaults.allowPriceDiscounts,
        rolePermissions: {
            admin: [...systemPermissionKeys],
            cashier: uniqPermissions(rolePermissionsInput?.cashier ?? defaults.rolePermissions.cashier),
            inventory: uniqPermissions(rolePermissionsInput?.inventory ?? defaults.rolePermissions.inventory),
            accountant: uniqPermissions(rolePermissionsInput?.accountant ?? defaults.rolePermissions.accountant),
        },
        updatedAt: input?.updatedAt || defaults.updatedAt,
    };
}
export function resolvePermissionsForRole(settings, role) {
    if (role === 'admin') {
        return [...systemPermissionKeys];
    }
    return uniqPermissions(settings.rolePermissions[role] ?? []);
}
export function hasSystemPermission(settings, role, permission) {
    return resolvePermissionsForRole(settings, role).includes(permission);
}
