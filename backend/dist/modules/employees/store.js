import { createHash, randomUUID } from 'node:crypto';
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PIN = '1985';
const DEFAULT_ADMIN_ID = 'emp-admin-default';
export function isEmployeeCompensationOutflow(kind) {
    return kind === 'payment' || kind === 'advance';
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function roundDays(value) {
    return Number(value.toFixed(2));
}
function createPayrollDate(value) {
    return new Date(`${value}T12:00:00`);
}
function getMonthKey(value) {
    return value.slice(0, 7);
}
function getNextMonthKey(monthKey) {
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('صيغة الشهر يجب أن تكون YYYY-MM.');
    }
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}
function listMonthKeysBetween(startDate, throughMonth) {
    if (!startDate) {
        return [];
    }
    const startMonth = getMonthKey(startDate);
    if (startMonth.localeCompare(throughMonth) > 0) {
        return [];
    }
    const months = [];
    let currentMonth = startMonth;
    while (currentMonth.localeCompare(throughMonth) <= 0) {
        months.push(currentMonth);
        currentMonth = getNextMonthKey(currentMonth);
    }
    return months;
}
function getCompensationMonthKey(compensation) {
    if (compensation.periodLabel && /^\d{4}-\d{2}$/.test(compensation.periodLabel)) {
        return compensation.periodLabel;
    }
    return getMonthKey(compensation.paymentDate);
}
function getDayOfMonth(value) {
    return createPayrollDate(value).getDate();
}
function isSameOrBefore(left, right) {
    return left.localeCompare(right) <= 0;
}
function normalizeMonthKey(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        throw new Error('صيغة الشهر يجب أن تكون YYYY-MM.');
    }
    return monthKey;
}
function getPayrollActiveDayWindow(employee, monthKey) {
    const { startDate, employmentStatus, serviceEndDate } = employee;
    if (!startDate) {
        return { payableDays: 0 };
    }
    if (getMonthKey(startDate).localeCompare(monthKey) > 0) {
        return { payableDays: 0 };
    }
    const startDay = getMonthKey(startDate) === monthKey ? Math.min(getDayOfMonth(startDate), 30) : 1;
    let endDay = 30;
    if (serviceEndDate && getMonthKey(serviceEndDate).localeCompare(monthKey) < 0) {
        return { payableDays: 0 };
    }
    if (serviceEndDate && getMonthKey(serviceEndDate) === monthKey) {
        endDay = Math.min(getDayOfMonth(serviceEndDate), 30);
    }
    if ((employmentStatus === 'suspended' || employmentStatus === 'terminated') && !serviceEndDate) {
        return { payableDays: 0 };
    }
    if (endDay < startDay) {
        return { payableDays: 0 };
    }
    return { payableDays: endDay - startDay + 1 };
}
export function resolveEmployeeCompensationInput(employee, input) {
    if (input.kind === 'payment' || input.kind === 'advance' || input.kind === 'bonus' || input.kind === 'deduction') {
        if (typeof input.amountIqd !== 'number' || !Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
            throw new Error('مبلغ الحركة يجب أن يكون أكبر من صفر.');
        }
        if ((input.kind === 'payment' || input.kind === 'advance') && !input.paymentMethod) {
            throw new Error('حدد طريقة الدفع قبل تسجيل عملية الصرف.');
        }
        return {
            amountIqd: roundMoney(input.amountIqd),
            calculationMethod: 'manual',
        };
    }
    if (input.calculationMethod === 'manual') {
        if (typeof input.amountIqd !== 'number' || !Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
            throw new Error('أدخل مبلغ الاستحقاق الشهري.');
        }
        return {
            amountIqd: roundMoney(input.amountIqd),
            calculationMethod: 'manual',
        };
    }
    const monthlySalaryIqd = employee.monthlySalaryIqd;
    if (typeof monthlySalaryIqd !== 'number' || !Number.isFinite(monthlySalaryIqd) || monthlySalaryIqd <= 0) {
        throw new Error('الراتب الشهري للموظف يجب أن يكون أكبر من صفر.');
    }
    return {
        amountIqd: roundMoney(monthlySalaryIqd),
        calculationMethod: 'monthly',
    };
}
export function buildMonthlyPayrollSummary(employee, compensations, absences, monthKey) {
    const normalizedMonthKey = normalizeMonthKey(monthKey);
    const { payableDays } = getPayrollActiveDayWindow(employee, normalizedMonthKey);
    const monthlySalaryIqd = employee.monthlySalaryIqd ?? 0;
    const dailyRateIqd = monthlySalaryIqd > 0 ? roundMoney(monthlySalaryIqd / 30) : 0;
    const monthAbsences = absences.filter((absence) => getMonthKey(absence.absenceDate) === normalizedMonthKey);
    const absenceDays = Math.min(roundDays(monthAbsences.reduce((sum, absence) => sum + absence.deductionDays, 0)), payableDays);
    const grossSalaryIqd = roundMoney(dailyRateIqd * payableDays);
    const absenceDeductionIqd = roundMoney(dailyRateIqd * absenceDays);
    const expectedNetSalaryIqd = Math.max(0, roundMoney(grossSalaryIqd - absenceDeductionIqd));
    const monthCompensations = compensations.filter((entry) => getCompensationMonthKey(entry) === normalizedMonthKey);
    const bonusIqd = roundMoney(monthCompensations.filter((entry) => entry.kind === 'bonus').reduce((sum, entry) => sum + entry.amountIqd, 0));
    const deductionIqd = roundMoney(monthCompensations.filter((entry) => entry.kind === 'deduction').reduce((sum, entry) => sum + entry.amountIqd, 0));
    const advanceIqd = roundMoney(monthCompensations.filter((entry) => entry.kind === 'advance').reduce((sum, entry) => sum + entry.amountIqd, 0));
    const paymentIqd = roundMoney(monthCompensations.filter((entry) => entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountIqd, 0));
    const existingSalaryIqd = roundMoney(monthCompensations.filter((entry) => entry.kind === 'salary').reduce((sum, entry) => sum + entry.amountIqd, 0));
    const salaryToAccrueIqd = Math.max(0, roundMoney(expectedNetSalaryIqd - existingSalaryIqd));
    const remainingPayableIqd = Math.max(0, roundMoney(expectedNetSalaryIqd + bonusIqd - deductionIqd - advanceIqd - paymentIqd));
    return {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.name,
        role: employee.role,
        monthKey: normalizedMonthKey,
        startDate: employee.startDate,
        employmentStatus: employee.employmentStatus,
        serviceEndDate: employee.serviceEndDate,
        monthlySalaryIqd,
        payableDays,
        absenceDays,
        grossSalaryIqd,
        absenceDeductionIqd,
        bonusIqd,
        deductionIqd,
        advanceIqd,
        paymentIqd,
        expectedNetSalaryIqd,
        existingSalaryIqd,
        salaryToAccrueIqd,
        remainingPayableIqd,
    };
}
export function buildEmployeeCumulativePayrollSummary(employee, compensations, absences, throughMonth) {
    const normalizedMonthKey = normalizeMonthKey(throughMonth);
    const monthKeys = listMonthKeysBetween(employee.startDate, normalizedMonthKey);
    const monthlySummaries = monthKeys.map((monthKey) => buildMonthlyPayrollSummary(employee, compensations, absences, monthKey));
    const totalPayableDays = roundDays(monthlySummaries.reduce((sum, summary) => sum + summary.payableDays, 0));
    const totalAbsenceDays = roundDays(monthlySummaries.reduce((sum, summary) => sum + summary.absenceDays, 0));
    const totalGrossSalaryIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.grossSalaryIqd, 0));
    const totalExpectedNetSalaryIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.expectedNetSalaryIqd, 0));
    const totalAbsenceDeductionIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.absenceDeductionIqd, 0));
    const totalBonusIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.bonusIqd, 0));
    const totalDeductionIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.deductionIqd, 0));
    const totalAdvanceIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.advanceIqd, 0));
    const totalPaymentIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.paymentIqd, 0));
    const totalPaidOutIqd = roundMoney(totalAdvanceIqd + totalPaymentIqd);
    const totalOutstandingIqd = roundMoney(monthlySummaries.reduce((sum, summary) => sum + summary.remainingPayableIqd, 0));
    return {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.name,
        role: employee.role,
        throughMonth: normalizedMonthKey,
        startDate: employee.startDate,
        employmentStatus: employee.employmentStatus,
        serviceEndDate: employee.serviceEndDate,
        monthsCount: monthlySummaries.filter((summary) => summary.payableDays > 0).length,
        totalPayableDays,
        totalAbsenceDays,
        totalGrossSalaryIqd,
        totalExpectedNetSalaryIqd,
        totalAbsenceDeductionIqd,
        totalBonusIqd,
        totalDeductionIqd,
        totalAdvanceIqd,
        totalPaymentIqd,
        totalPaidOutIqd,
        totalOutstandingIqd,
    };
}
const storedEmployees = [];
const storedEmployeeCompensations = [];
const storedEmployeeAbsences = [];
function createEmployeeId() {
    return `emp-${randomUUID()}`;
}
function createEmployeeNo() {
    const sequence = storedEmployees.length + 1;
    return `EMP-${String(sequence).padStart(4, '0')}`;
}
function createEmployeeCompensationNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const serial = String(storedEmployeeCompensations.length + 1).padStart(4, '0');
    return `PAY-${year}${month}-${serial}`;
}
function hashPin(pin) {
    return createHash('sha256').update(pin).digest('hex');
}
function normalizeUsername(username) {
    const normalized = username?.trim().toLowerCase();
    return normalized ? normalized : undefined;
}
function isProtectedAdminEmployee(employee) {
    return employee.role === 'admin' && employee.username === DEFAULT_ADMIN_USERNAME;
}
function normalizeServiceState(input) {
    const startDate = input.startDate?.trim() || undefined;
    const serviceEndDate = input.serviceEndDate?.trim() || undefined;
    const employmentStatus = input.employmentStatus ?? 'active';
    if (serviceEndDate && !startDate) {
        throw new Error('لا يمكن تحديد تاريخ التوقف أو إنهاء الخدمة بدون تاريخ مباشرة.');
    }
    if (startDate && serviceEndDate && !isSameOrBefore(startDate, serviceEndDate)) {
        throw new Error('تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ المباشرة.');
    }
    if ((employmentStatus === 'suspended' || employmentStatus === 'terminated') && !serviceEndDate) {
        throw new Error('حدد تاريخ التوقف أو إنهاء الخدمة.');
    }
    if (employmentStatus === 'active' && serviceEndDate) {
        throw new Error('الموظف النشط لا يجب أن يحتوي على تاريخ نهاية خدمة.');
    }
    if (typeof input.monthlySalaryIqd === 'number' && (!Number.isFinite(input.monthlySalaryIqd) || input.monthlySalaryIqd <= 0)) {
        throw new Error('الراتب الشهري يجب أن يكون أكبر من صفر.');
    }
    return {
        startDate,
        serviceEndDate,
        employmentStatus,
        monthlySalaryIqd: input.monthlySalaryIqd !== undefined ? roundMoney(input.monthlySalaryIqd) : undefined,
    };
}
export function listEmployees() {
    return storedEmployees.map(({ pinHash: _pinHash, ...employee }) => ({ ...employee }));
}
export function findEmployeeById(employeeId) {
    const employee = storedEmployees.find((entry) => entry.id === employeeId);
    if (!employee) {
        return null;
    }
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function listEmployeeCompensations(employeeId) {
    return storedEmployeeCompensations
        .filter((entry) => !employeeId || entry.employeeId === employeeId)
        .map((entry) => ({ ...entry }));
}
export function listEmployeeAbsences(employeeId) {
    return storedEmployeeAbsences
        .filter((entry) => !employeeId || entry.employeeId === employeeId)
        .map((entry) => ({ ...entry }));
}
export function createEmployeeCompensation(employee, input) {
    const resolved = resolveEmployeeCompensationInput(employee, input);
    const compensation = {
        id: `emp-pay-${randomUUID()}`,
        paymentNo: createEmployeeCompensationNo(),
        employeeId: employee.id,
        employeeName: employee.name,
        kind: input.kind,
        amountIqd: resolved.amountIqd,
        calculationMethod: resolved.calculationMethod,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        periodLabel: input.periodLabel?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
        createdAt: new Date().toISOString(),
    };
    storedEmployeeCompensations.unshift(compensation);
    return { ...compensation };
}
export function createEmployeeAbsence(employee, input) {
    const absence = {
        id: `emp-abs-${randomUUID()}`,
        employeeId: employee.id,
        employeeName: employee.name,
        absenceDate: input.absenceDate,
        deductionDays: roundDays(input.deductionDays),
        notes: input.notes?.trim() || undefined,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
        createdAt: new Date().toISOString(),
    };
    storedEmployeeAbsences.unshift(absence);
    return { ...absence };
}
export function updateEmployeeAbsence(employee, absenceId, input) {
    const absence = storedEmployeeAbsences.find((entry) => entry.id === absenceId && entry.employeeId === employee.id);
    if (!absence) {
        throw new Error('سجل الغياب المطلوب غير موجود.');
    }
    absence.employeeName = employee.name;
    absence.absenceDate = input.absenceDate;
    absence.deductionDays = roundDays(input.deductionDays);
    absence.notes = input.notes?.trim() || undefined;
    absence.createdByEmployeeId = input.createdByEmployeeId;
    absence.createdByEmployeeName = input.createdByEmployeeName;
    return { ...absence };
}
export function deleteEmployeeAbsence(employee, absenceId) {
    const absenceIndex = storedEmployeeAbsences.findIndex((entry) => entry.id === absenceId && entry.employeeId === employee.id);
    if (absenceIndex < 0) {
        throw new Error('سجل الغياب المطلوب غير موجود.');
    }
    const [absence] = storedEmployeeAbsences.splice(absenceIndex, 1);
    return { ...absence };
}
export function authenticateEmployee(employeeId, pin) {
    const normalizedLogin = employeeId.trim().toLowerCase();
    const employee = storedEmployees.find((entry) => (entry.id === employeeId
        || entry.employeeNo.toLowerCase() === normalizedLogin
        || entry.username === normalizedLogin));
    if (!employee || !employee.isActive || employee.employmentStatus !== 'active') {
        throw new Error('الموظف غير موجود أو غير مفعل.');
    }
    if (employee.pinHash !== hashPin(pin)) {
        throw new Error('PIN غير صحيح.');
    }
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function createEmployee(input) {
    const normalized = normalizeServiceState(input);
    const employee = {
        id: createEmployeeId(),
        employeeNo: createEmployeeNo(),
        username: undefined,
        name: input.name.trim(),
        role: input.role,
        startDate: normalized.startDate,
        monthlySalaryIqd: normalized.monthlySalaryIqd,
        employmentStatus: normalized.employmentStatus,
        serviceEndDate: normalized.serviceEndDate,
        notes: input.notes?.trim() || undefined,
        isActive: normalized.employmentStatus === 'active',
        createdAt: new Date().toISOString(),
        pinHash: hashPin(input.pin),
    };
    storedEmployees.unshift(employee);
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function updateEmployee(employeeId, input) {
    const employee = storedEmployees.find((entry) => entry.id === employeeId);
    if (!employee) {
        throw new Error('الموظف المطلوب غير موجود.');
    }
    if (isProtectedAdminEmployee(employee) && input.role !== 'admin') {
        throw new Error('لا يمكن تغيير صلاحيات حساب الإدارة الافتراضي.');
    }
    const normalized = normalizeServiceState(input);
    employee.name = input.name.trim();
    employee.role = input.role;
    employee.startDate = normalized.startDate;
    employee.monthlySalaryIqd = normalized.monthlySalaryIqd;
    employee.employmentStatus = normalized.employmentStatus;
    employee.serviceEndDate = normalized.serviceEndDate;
    employee.notes = input.notes?.trim() || undefined;
    employee.isActive = normalized.employmentStatus === 'active';
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function resetEmployeePin(employeeId, pin) {
    const employee = storedEmployees.find((entry) => entry.id === employeeId);
    if (!employee) {
        throw new Error('الموظف المطلوب غير موجود.');
    }
    employee.pinHash = hashPin(pin);
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function setEmployeeActive(employeeId, isActive) {
    const employee = storedEmployees.find((entry) => entry.id === employeeId);
    if (!employee) {
        throw new Error('الموظف المطلوب غير موجود.');
    }
    if (isProtectedAdminEmployee(employee) && !isActive) {
        throw new Error('لا يمكن تعطيل حساب الإدارة الافتراضي.');
    }
    employee.isActive = isActive;
    if (!isActive && employee.employmentStatus === 'active') {
        employee.employmentStatus = 'suspended';
        employee.serviceEndDate = new Date().toISOString().slice(0, 10);
    }
    if (isActive) {
        employee.employmentStatus = 'active';
        employee.serviceEndDate = undefined;
    }
    const { pinHash: _pinHash, ...publicEmployee } = employee;
    return { ...publicEmployee };
}
export function listMonthlyPayrollSummaries(monthKey) {
    const normalizedMonthKey = normalizeMonthKey(monthKey);
    return listEmployees()
        .filter((employee) => employee.monthlySalaryIqd && employee.startDate)
        .map((employee) => buildMonthlyPayrollSummary(employee, listEmployeeCompensations(employee.id), listEmployeeAbsences(employee.id), normalizedMonthKey));
}
export function settleMonthlyPayroll(monthKey, paymentDate, paymentMethod, createdByEmployeeId, createdByEmployeeName, employeeIds) {
    const normalizedMonthKey = normalizeMonthKey(monthKey);
    const summaries = listMonthlyPayrollSummaries(normalizedMonthKey)
        .filter((summary) => !employeeIds?.length || employeeIds.includes(summary.employeeId));
    const createdEntries = [];
    for (const summary of summaries) {
        const employee = findEmployeeById(summary.employeeId);
        if (!employee) {
            continue;
        }
        if (summary.salaryToAccrueIqd > 0) {
            createdEntries.push(createEmployeeCompensation(employee, {
                kind: 'salary',
                amountIqd: summary.salaryToAccrueIqd,
                calculationMethod: 'manual',
                paymentDate,
                periodLabel: normalizedMonthKey,
                notes: `استحقاق راتب شهر ${normalizedMonthKey}`,
                createdByEmployeeId,
                createdByEmployeeName,
            }));
        }
        if (summary.remainingPayableIqd > 0) {
            createdEntries.push(createEmployeeCompensation(employee, {
                kind: 'payment',
                amountIqd: summary.remainingPayableIqd,
                calculationMethod: 'manual',
                paymentMethod,
                paymentDate,
                periodLabel: normalizedMonthKey,
                notes: `تسديد راتب شهر ${normalizedMonthKey}`,
                createdByEmployeeId,
                createdByEmployeeName,
            }));
        }
    }
    return createdEntries;
}
export function ensureDefaultAdminEmployee() {
    const username = normalizeUsername(DEFAULT_ADMIN_USERNAME);
    const pinHash = hashPin(DEFAULT_ADMIN_PIN);
    const existingEmployee = storedEmployees.find((entry) => entry.username === username);
    if (existingEmployee) {
        existingEmployee.name = 'مدير النظام';
        existingEmployee.role = 'admin';
        existingEmployee.isActive = true;
        existingEmployee.employmentStatus = 'active';
        existingEmployee.serviceEndDate = undefined;
        existingEmployee.username = username;
        existingEmployee.pinHash = pinHash;
        return;
    }
    storedEmployees.unshift({
        id: DEFAULT_ADMIN_ID,
        employeeNo: 'ADM-0001',
        username,
        name: 'مدير النظام',
        role: 'admin',
        employmentStatus: 'active',
        notes: 'حساب الإدارة الافتراضي',
        isActive: true,
        createdAt: new Date().toISOString(),
        pinHash,
    });
}
ensureDefaultAdminEmployee();
export function resetEmployeesStore() {
    storedEmployees.splice(0, storedEmployees.length);
    storedEmployeeCompensations.splice(0, storedEmployeeCompensations.length);
    storedEmployeeAbsences.splice(0, storedEmployeeAbsences.length);
    ensureDefaultAdminEmployee();
}
