const storedShifts = [];
function generateShiftId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `shift-${crypto.randomUUID()}`;
    }
    return `shift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function createShiftNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `SHIFT-${year}${month}${day}-${String(sequence).padStart(4, '0')}`;
}
export function listCashierShifts(employeeId) {
    const source = employeeId ? storedShifts.filter((shift) => shift.employeeId === employeeId) : storedShifts;
    return source.map((shift) => ({ ...shift }));
}
export function findOpenShiftByEmployee(employeeId) {
    return storedShifts.find((shift) => shift.employeeId === employeeId && shift.status === 'open') ?? null;
}
export function findShiftById(shiftId) {
    return storedShifts.find((shift) => shift.id === shiftId) ?? null;
}
export function createCashierShift(input) {
    if (findOpenShiftByEmployee(input.employeeId)) {
        throw new Error('يوجد وردية مفتوحة لهذا الموظف بالفعل.');
    }
    const shift = {
        id: generateShiftId(),
        shiftNo: createShiftNo(storedShifts.length + 1),
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        terminalName: input.terminalName.trim(),
        openingFloatIqd: Number(input.openingFloatIqd.toFixed(2)),
        openingNote: input.openingNote?.trim() || undefined,
        openedAt: new Date().toISOString(),
        status: 'open',
    };
    storedShifts.unshift(shift);
    return { ...shift };
}
export function closeCashierShift(input) {
    const shift = storedShifts.find((entry) => entry.id === input.shiftId);
    if (!shift) {
        throw new Error('الوردية المطلوبة غير موجودة.');
    }
    if (shift.status === 'closed') {
        throw new Error('تم إغلاق هذه الوردية مسبقاً.');
    }
    shift.status = 'closed';
    shift.closedAt = new Date().toISOString();
    shift.closingNote = input.closingNote?.trim() || undefined;
    shift.closingCashIqd = Number(input.closingCashIqd.toFixed(2));
    shift.closingSummary = input.summary;
    shift.cashDifferenceIqd = Number((input.closingCashIqd - input.summary.expectedCashIqd).toFixed(2));
    return { ...shift };
}
export function resetShiftsStore() {
    storedShifts.splice(0, storedShifts.length);
}
