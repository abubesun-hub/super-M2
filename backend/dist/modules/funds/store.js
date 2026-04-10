function createDefaultFundAccounts() {
    return [
        {
            id: 'fund-revenue',
            name: 'صندوق الإيرادات',
            code: 'revenue',
            type: 'revenue',
            currentBalanceIqd: 0,
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
        {
            id: 'fund-capital',
            name: 'صندوق رأس المال',
            code: 'capital',
            type: 'capital',
            currentBalanceIqd: 0,
            isSystem: true,
            isActive: true,
            createdAt: new Date().toISOString(),
        },
    ];
}
const storedFundAccounts = createDefaultFundAccounts();
const storedFundMovements = [];
const FINAL_CASH_LABEL = 'FINAL CASH';
function createId(prefix) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function roundMoney(value) {
    return Number(value.toFixed(2));
}
function createMovementNo(sequence) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const serial = String(sequence).padStart(4, '0');
    return `FUND-${year}${month}-${serial}`;
}
function normalizeContributorName(value) {
    return value.trim().toLocaleLowerCase('ar');
}
function getOperationalFundAccounts() {
    return storedFundAccounts.filter((account) => account.isActive && (account.code === 'revenue' || account.code === 'capital'));
}
export function getFinalCashBalanceIqd() {
    return roundMoney(getOperationalFundAccounts().reduce((sum, account) => sum + account.currentBalanceIqd, 0));
}
function resolveFinalCashAllocations(amountIqd) {
    const operationalAccounts = getOperationalFundAccounts();
    const totalBalanceIqd = operationalAccounts.reduce((sum, account) => sum + account.currentBalanceIqd, 0);
    if (totalBalanceIqd + 0.01 < amountIqd) {
        throw new Error(`الرصيد النقدي النهائي الحالي هو ${totalBalanceIqd.toFixed(2)} د.ع فقط، ولا يكفي لإتمام العملية.`);
    }
    let remainingIqd = roundMoney(amountIqd);
    const allocations = [];
    for (const account of operationalAccounts.sort((left, right) => left.code.localeCompare(right.code))) {
        if (remainingIqd <= 0.01 || account.currentBalanceIqd <= 0.01) {
            continue;
        }
        const allocatedAmountIqd = roundMoney(Math.min(account.currentBalanceIqd, remainingIqd));
        if (allocatedAmountIqd <= 0.01) {
            continue;
        }
        allocations.push({
            fundAccountId: account.id,
            fundAccountName: account.name,
            amountIqd: allocatedAmountIqd,
        });
        remainingIqd = roundMoney(remainingIqd - allocatedAmountIqd);
    }
    if (remainingIqd > 0.01) {
        throw new Error('تعذر توزيع مبلغ الصرف على الرصيد النقدي النهائي المتاح.');
    }
    return allocations;
}
function requireFundAccount(accountId, fieldLabel) {
    const account = storedFundAccounts.find((entry) => entry.id === accountId && entry.isActive);
    if (!account) {
        throw new Error(`${fieldLabel} غير موجود أو غير مفعل.`);
    }
    return account;
}
function assertMovementShape(input) {
    if (!Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
        throw new Error('مبلغ حركة الصندوق يجب أن يكون أكبر من صفر.');
    }
    if (input.direction === 'inflow' && !input.destinationFundAccountId) {
        throw new Error('يجب تحديد الصندوق المستلم لحركة القبض.');
    }
    if (input.direction === 'outflow' && !input.sourceFundAccountId) {
        throw new Error('يجب تحديد الصندوق المصدر لحركة الصرف.');
    }
    if (input.direction === 'transfer') {
        if (!input.sourceFundAccountId || !input.destinationFundAccountId) {
            throw new Error('التحويل بين الصناديق يتطلب تحديد الصندوق المصدر والوجهة.');
        }
        if (input.sourceFundAccountId === input.destinationFundAccountId) {
            throw new Error('لا يمكن التحويل إلى نفس الصندوق.');
        }
    }
}
export function listFundAccounts() {
    return storedFundAccounts.map((account) => ({ ...account }));
}
export function listFundMovements() {
    return storedFundMovements.map((movement) => ({ ...movement }));
}
export function listCapitalTransactions() {
    return storedFundMovements
        .filter((movement) => movement.referenceType === 'capital-transaction')
        .map((movement) => ({ ...movement }));
}
export function findFundAccountById(accountId) {
    return storedFundAccounts.find((account) => account.id === accountId) ?? null;
}
export function findFundAccountByCode(code) {
    const normalizedCode = code.trim().toLowerCase();
    return storedFundAccounts.find((account) => account.code.toLowerCase() === normalizedCode) ?? null;
}
export function findFundMovementById(movementId) {
    return storedFundMovements.find((movement) => movement.id === movementId) ?? null;
}
export function getCapitalContributorBalance(contributorName, excludedMovementId) {
    const normalizedContributorName = normalizeContributorName(contributorName);
    return roundMoney(storedFundMovements.reduce((sum, movement) => {
        if (movement.referenceType !== 'capital-transaction' || !movement.counterpartyName) {
            return sum;
        }
        if (excludedMovementId && movement.id === excludedMovementId) {
            return sum;
        }
        if (normalizeContributorName(movement.counterpartyName) !== normalizedContributorName) {
            return sum;
        }
        if (movement.reason === 'capital-contribution') {
            return sum + movement.amountIqd;
        }
        if (movement.reason === 'capital-repayment') {
            return sum - movement.amountIqd;
        }
        return sum;
    }, 0));
}
function reverseFundMovementBalanceEffect(movement) {
    if (!movement.sourceFundAccountId && movement.sourceFundAccountName === FINAL_CASH_LABEL && movement.allocationBreakdown?.length) {
        for (const allocation of movement.allocationBreakdown) {
            const account = requireFundAccount(allocation.fundAccountId, 'الصندوق التشغيلي');
            account.currentBalanceIqd = roundMoney(account.currentBalanceIqd + allocation.amountIqd);
        }
        return;
    }
    const sourceAccount = movement.sourceFundAccountId
        ? requireFundAccount(movement.sourceFundAccountId, 'الصندوق المصدر')
        : null;
    const destinationAccount = movement.destinationFundAccountId
        ? requireFundAccount(movement.destinationFundAccountId, 'الصندوق المستلم')
        : null;
    if (destinationAccount && destinationAccount.currentBalanceIqd + 0.01 < movement.amountIqd) {
        throw new Error(`لا يمكن حذف أو تعديل الحركة لأن رصيد ${destinationAccount.name} الحالي لا يسمح بعكسها.`);
    }
    if (sourceAccount) {
        sourceAccount.currentBalanceIqd = roundMoney(sourceAccount.currentBalanceIqd + movement.amountIqd);
    }
    if (destinationAccount) {
        destinationAccount.currentBalanceIqd = roundMoney(destinationAccount.currentBalanceIqd - movement.amountIqd);
    }
}
export function createFundMovement(input) {
    assertMovementShape(input);
    const amountIqd = roundMoney(input.amountIqd);
    const sourceAccount = input.sourceFundAccountId
        ? requireFundAccount(input.sourceFundAccountId, 'الصندوق المصدر')
        : null;
    const destinationAccount = input.destinationFundAccountId
        ? requireFundAccount(input.destinationFundAccountId, 'الصندوق المستلم')
        : null;
    if (sourceAccount && sourceAccount.currentBalanceIqd + 0.01 < amountIqd) {
        throw new Error(`الرصيد المتاح في ${sourceAccount.name} غير كافٍ لإتمام العملية.`);
    }
    if (sourceAccount) {
        sourceAccount.currentBalanceIqd = roundMoney(sourceAccount.currentBalanceIqd - amountIqd);
    }
    if (destinationAccount) {
        destinationAccount.currentBalanceIqd = roundMoney(destinationAccount.currentBalanceIqd + amountIqd);
    }
    const movement = {
        id: createId('fund-movement'),
        movementNo: createMovementNo(storedFundMovements.length + 1),
        movementDate: input.movementDate,
        direction: input.direction,
        amountIqd,
        sourceFundAccountId: sourceAccount?.id,
        sourceFundAccountName: sourceAccount?.name,
        destinationFundAccountId: destinationAccount?.id,
        destinationFundAccountName: destinationAccount?.name,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        counterpartyName: input.counterpartyName?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
        createdAt: new Date().toISOString(),
    };
    storedFundMovements.unshift(movement);
    return { ...movement };
}
export function createFinalCashOutflow(input) {
    if (!Number.isFinite(input.amountIqd) || input.amountIqd <= 0) {
        throw new Error('مبلغ حركة الصندوق يجب أن يكون أكبر من صفر.');
    }
    const amountIqd = roundMoney(input.amountIqd);
    const allocations = resolveFinalCashAllocations(amountIqd);
    for (const allocation of allocations) {
        const account = requireFundAccount(allocation.fundAccountId, 'الصندوق التشغيلي');
        account.currentBalanceIqd = roundMoney(account.currentBalanceIqd - allocation.amountIqd);
    }
    const movement = {
        id: createId('fund-movement'),
        movementNo: createMovementNo(storedFundMovements.length + 1),
        movementDate: input.movementDate,
        direction: 'outflow',
        amountIqd,
        sourceFundAccountName: FINAL_CASH_LABEL,
        destinationFundAccountId: undefined,
        destinationFundAccountName: undefined,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        counterpartyName: input.counterpartyName?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
        createdAt: new Date().toISOString(),
        allocationBreakdown: allocations,
    };
    storedFundMovements.unshift(movement);
    return { ...movement };
}
export function createCapitalTransaction(input) {
    const capitalAccount = findFundAccountByCode('capital');
    if (!capitalAccount) {
        throw new Error('الصناديق الأساسية غير معرفة في النظام.');
    }
    if (input.movementType === 'repayment') {
        const contributorBalanceIqd = getCapitalContributorBalance(input.contributorName);
        if (contributorBalanceIqd + 0.01 < input.amountIqd) {
            throw new Error('لا يمكن سحب مبلغ أكبر من الرصيد الصافي للمساهم داخل حساب رأس المال.');
        }
    }
    if (input.movementType === 'contribution') {
        return createFundMovement({
            movementDate: input.movementDate,
            direction: 'inflow',
            amountIqd: input.amountIqd,
            destinationFundAccountId: capitalAccount.id,
            reason: 'capital-contribution',
            referenceType: 'capital-transaction',
            counterpartyName: input.contributorName,
            notes: input.notes,
            createdByEmployeeId: input.createdByEmployeeId,
            createdByEmployeeName: input.createdByEmployeeName,
        });
    }
    return createFinalCashOutflow({
        movementDate: input.movementDate,
        amountIqd: input.amountIqd,
        reason: 'capital-repayment',
        referenceType: 'capital-transaction',
        counterpartyName: input.contributorName,
        notes: input.notes,
        createdByEmployeeId: input.createdByEmployeeId,
        createdByEmployeeName: input.createdByEmployeeName,
    });
}
export function resetFundsStore() {
    storedFundAccounts.splice(0, storedFundAccounts.length, ...createDefaultFundAccounts());
    storedFundMovements.splice(0, storedFundMovements.length);
}
export function deleteCapitalTransaction(movementId) {
    const movementIndex = storedFundMovements.findIndex((movement) => movement.id === movementId && movement.referenceType === 'capital-transaction');
    if (movementIndex < 0) {
        throw new Error('حركة رأس المال المطلوبة غير موجودة.');
    }
    const movement = storedFundMovements[movementIndex];
    if (!movement.counterpartyName) {
        throw new Error('الحركة المختارة لا تحتوي على اسم مساهم صالح.');
    }
    const nextContributorBalance = getCapitalContributorBalance(movement.counterpartyName, movement.id);
    if (nextContributorBalance < -0.01) {
        throw new Error('لا يمكن حذف هذه الحركة لأن ذلك سيجعل رصيد المساهم سالباً بعد احتساب السحوبات السابقة.');
    }
    reverseFundMovementBalanceEffect(movement);
    storedFundMovements.splice(movementIndex, 1);
    return { ...movement };
}
export function updateCapitalTransaction(movementId, input) {
    const previousAccountsSnapshot = storedFundAccounts.map((account) => ({ ...account }));
    const previousMovementsSnapshot = storedFundMovements.map((movement) => ({ ...movement }));
    const existingMovement = findFundMovementById(movementId);
    if (!existingMovement || existingMovement.referenceType !== 'capital-transaction') {
        throw new Error('حركة رأس المال المطلوبة غير موجودة.');
    }
    const existingContributorName = existingMovement.counterpartyName?.trim();
    const nextContributorName = input.contributorName.trim();
    try {
        if (existingContributorName && normalizeContributorName(existingContributorName) !== normalizeContributorName(nextContributorName)) {
            const balanceWithoutExisting = getCapitalContributorBalance(existingContributorName, existingMovement.id);
            if (balanceWithoutExisting < -0.01) {
                throw new Error('لا يمكن نقل الحركة إلى مساهم آخر لأن حذفها من المساهم الحالي سيجعل رصيده سالباً.');
            }
        }
        if (input.movementType === 'repayment') {
            const nextContributorBalance = getCapitalContributorBalance(nextContributorName, existingMovement.id);
            if (nextContributorBalance + 0.01 < input.amountIqd) {
                throw new Error('لا يمكن سحب مبلغ أكبر من الرصيد الصافي للمساهم بعد استبعاد الحركة الحالية.');
            }
        }
        reverseFundMovementBalanceEffect(existingMovement);
        const movementIndex = storedFundMovements.findIndex((movement) => movement.id === existingMovement.id);
        storedFundMovements.splice(movementIndex, 1);
        return createCapitalTransaction(input);
    }
    catch (error) {
        storedFundAccounts.splice(0, storedFundAccounts.length, ...previousAccountsSnapshot);
        storedFundMovements.splice(0, storedFundMovements.length, ...previousMovementsSnapshot);
        throw error;
    }
}
