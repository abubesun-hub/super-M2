import { createFinalCashOutflow, createFundMovement, findFundAccountById } from '../funds/store.js';
function createDefaultExpenseCategories() {
    return [
        {
            id: 'expense-cat-salary',
            name: 'رواتب الموظفين',
            code: 'salary',
            kind: 'payroll',
            description: 'تسديد الرواتب الشهرية والسلف والمدفوعات المرتبطة برواتب الموظفين.',
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'expense-cat-utilities',
            name: 'الخدمات',
            code: 'utilities',
            kind: 'service',
            description: 'كهرباء وماء وإنترنت وخدمات تشغيلية مماثلة.',
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'expense-cat-supplier-payment',
            name: 'تسديد مورد',
            code: 'supplier-payment',
            kind: 'supplier',
            description: 'المبالغ المدفوعة للموردين لتخفيض أرصدتهم المستحقة.',
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'expense-cat-transport',
            name: 'نقل وتحميل',
            code: 'transport',
            kind: 'operating',
            description: 'مصاريف النقل والتحميل والتوصيل التشغيلي.',
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'expense-cat-maintenance',
            name: 'صيانة',
            code: 'maintenance',
            kind: 'operating',
            description: 'صيانة الطابعات والثلاجات وأجهزة الكاشير والمرافق.',
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
    ];
}
const storedExpenseCategories = createDefaultExpenseCategories();
const storedExpenses = [];
function createId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function normalizeCode(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function createExpenseNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const serial = String(sequence).padStart(4, '0');
    return `EXP-${year}${month}-${serial}`;
}
function assertUniqueCategory(input) {
    const normalizedName = input.name.trim();
    const normalizedCode = normalizeCode(input.code);
    if (storedExpenseCategories.some((category) => category.name.trim() === normalizedName)) {
        throw new Error('اسم فئة المصروف مستخدم مسبقاً.');
    }
    if (storedExpenseCategories.some((category) => category.code === normalizedCode)) {
        throw new Error('رمز فئة المصروف مستخدم مسبقاً.');
    }
}
export function listExpenseCategories() {
    return storedExpenseCategories.map((category) => ({ ...category }));
}
export function createExpenseCategory(input) {
    if (input.kind === 'payroll') {
        throw new Error('فئات الرواتب تُدار تلقائياً من شاشة الموظفين ولا يمكن إنشاؤها يدوياً من صفحة المصروفات.');
    }
    assertUniqueCategory(input);
    const category = {
        id: createId('expense-cat'),
        name: input.name.trim(),
        code: normalizeCode(input.code),
        kind: input.kind,
        description: input.description?.trim() || undefined,
        isSystem: false,
        isActive: true,
        createdAt: new Date().toISOString(),
    };
    storedExpenseCategories.unshift(category);
    return { ...category };
}
export function findExpenseCategoryById(categoryId) {
    return storedExpenseCategories.find((category) => category.id === categoryId) ?? null;
}
export function findExpenseCategoryByCode(code) {
    const normalizedCode = normalizeCode(code);
    return storedExpenseCategories.find((category) => category.code === normalizedCode) ?? null;
}
export function listExpenses() {
    return storedExpenses.map((expense) => ({ ...expense }));
}
export function createExpenseRecord(input) {
    const category = findExpenseCategoryById(input.categoryId);
    const referenceType = input.referenceType ?? 'manual';
    if (!category || !category.isActive) {
        throw new Error('فئة المصروف المحددة غير موجودة أو غير مفعلة.');
    }
    if (referenceType === 'manual' && category.kind === 'payroll') {
        throw new Error('صرف الرواتب والسلف لم يعد متاحاً من شاشة المصروفات. استخدم شاشة الموظفين والرواتب الشهرية.');
    }
    const resolvedSourceFund = input.sourceFundAccountId
        ? findFundAccountById(input.sourceFundAccountId)
        : null;
    const usesFinalCash = !resolvedSourceFund && (referenceType === 'manual' || referenceType === 'supplier-payment' || referenceType === 'employee-compensation');
    if ((resolvedSourceFund && !resolvedSourceFund.isActive) || (input.sourceFundAccountId && !resolvedSourceFund)) {
        throw new Error('صندوق الدفع المحدد غير موجود أو غير مفعل.');
    }
    const expense = {
        id: createId('expense'),
        expenseNo: createExpenseNo(storedExpenses.length + 1),
        expenseDate: input.expenseDate,
        categoryId: category.id,
        categoryName: category.name,
        categoryKind: category.kind,
        amountIqd: roundMoney(input.amountIqd),
        paymentMethod: input.paymentMethod,
        beneficiaryName: input.beneficiaryName?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
        sourceFundAccountId: usesFinalCash ? undefined : resolvedSourceFund?.id,
        sourceFundAccountName: usesFinalCash ? 'FINAL CASH' : resolvedSourceFund?.name,
        shiftId: input.shiftId,
        referenceType,
        referenceId: input.referenceId,
        status: 'posted',
        createdAt: new Date().toISOString(),
    };
    storedExpenses.unshift(expense);
    if (resolvedSourceFund) {
        createFundMovement({
            movementDate: expense.expenseDate,
            direction: 'outflow',
            amountIqd: expense.amountIqd,
            sourceFundAccountId: resolvedSourceFund.id,
            reason: referenceType === 'supplier-payment' ? 'supplier-payment' : 'expense-payment',
            referenceType: 'expense',
            referenceId: expense.id,
            counterpartyName: expense.beneficiaryName,
            notes: expense.notes,
            createdByEmployeeId: expense.createdByEmployeeId,
            createdByEmployeeName: expense.createdByEmployeeName,
        });
    }
    else if (usesFinalCash) {
        createFinalCashOutflow({
            movementDate: expense.expenseDate,
            amountIqd: expense.amountIqd,
            reason: referenceType === 'supplier-payment' ? 'supplier-payment' : 'expense-payment',
            referenceType: 'expense',
            referenceId: expense.id,
            counterpartyName: expense.beneficiaryName,
            notes: expense.notes,
            createdByEmployeeId: expense.createdByEmployeeId,
            createdByEmployeeName: expense.createdByEmployeeName,
        });
    }
    return { ...expense };
}
export function resetExpensesStore() {
    storedExpenseCategories.splice(0, storedExpenseCategories.length, ...createDefaultExpenseCategories());
    storedExpenses.splice(0, storedExpenses.length);
}
