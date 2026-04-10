function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function containsTechnicalEnglish(value) {
    return /[A-Za-z]{3,}/.test(value);
}
function getFieldLabel(path) {
    const lastPathEntry = path[path.length - 1];
    if (typeof lastPathEntry !== 'string') {
        return 'الحقل المطلوب';
    }
    const fieldLabels = {
        login: 'رقم الموظف أو اسم المستخدم',
        pin: 'PIN',
        employeeId: 'الموظف',
        employeeNo: 'رقم الموظف',
        name: 'الاسم',
        amountIqd: 'المبلغ',
        quantity: 'الكمية',
        unitPriceIqd: 'سعر الوحدة',
        priceIqd: 'السعر',
        sellingPriceIqd: 'سعر البيع',
        costPriceIqd: 'سعر الكلفة',
        categoryId: 'الفئة',
        productId: 'المنتج',
        supplierId: 'المجهز',
        customerId: 'العميل',
        shiftId: 'الوردية',
        sessionId: 'الجلسة',
        fundAccountId: 'الحساب النقدي',
        sourceFundAccountId: 'مصدر الرصيد',
        movementType: 'نوع الحركة',
        referenceId: 'المرجع',
        reason: 'السبب',
        notes: 'الملاحظات',
        description: 'الوصف',
        status: 'الحالة',
        role: 'الدور الوظيفي',
        username: 'اسم المستخدم',
        phone: 'رقم الهاتف',
        address: 'العنوان',
        date: 'التاريخ',
        startedAt: 'وقت البدء',
        endedAt: 'وقت الإغلاق',
    };
    return fieldLabels[lastPathEntry] ?? lastPathEntry;
}
function normalizeValidationIssueMessage(issue) {
    const message = normalizeWhitespace(issue.message ?? '');
    const fieldLabel = getFieldLabel(issue.path);
    if (message && !containsTechnicalEnglish(message)) {
        return message;
    }
    if (issue.code === 'invalid_type') {
        return `${fieldLabel} مطلوب أو أن قيمته غير صحيحة.`;
    }
    if (issue.code === 'too_small') {
        if (issue.origin === 'string' && issue.minimum === 1) {
            return `${fieldLabel} مطلوب.`;
        }
        if (issue.origin === 'string') {
            return `${fieldLabel} يجب أن يحتوي على ${issue.minimum} أحرف على الأقل.`;
        }
        if (issue.origin === 'number' || issue.origin === 'bigint') {
            return `${fieldLabel} يجب ألا يقل عن ${issue.minimum}.`;
        }
        return `${fieldLabel} لا يستوفي الحد الأدنى المطلوب.`;
    }
    if (issue.code === 'too_big') {
        if (issue.origin === 'string') {
            return `${fieldLabel} يجب ألا يتجاوز ${issue.maximum} أحرف.`;
        }
        if (issue.origin === 'number' || issue.origin === 'bigint') {
            return `${fieldLabel} يجب ألا يزيد على ${issue.maximum}.`;
        }
        return `${fieldLabel} تجاوز الحد المسموح به.`;
    }
    if (issue.code === 'invalid_format') {
        if (fieldLabel === 'PIN') {
            return 'يجب أن يتكون PIN من 4 إلى 8 أرقام.';
        }
        return `${fieldLabel} بصيغة غير صحيحة.`;
    }
    if (issue.code === 'invalid_value') {
        return `${fieldLabel} يحتوي على قيمة غير مقبولة.`;
    }
    if (issue.code === 'unrecognized_keys') {
        return 'تم إرسال بيانات إضافية غير مدعومة لهذه العملية.';
    }
    return fieldLabel === 'الحقل المطلوب'
        ? 'بعض البيانات المدخلة غير صحيحة. راجع الحقول المطلوبة ثم أعد المحاولة.'
        : `${fieldLabel} غير صالح. راجع قيمته ثم أعد المحاولة.`;
}
function normalizeValidationIssues(issues) {
    return issues.map((issue) => ({
        ...issue,
        message: normalizeValidationIssueMessage(issue),
    }));
}
function normalizeRouteErrorMessage(rawMessage, fallbackMessage) {
    const message = normalizeWhitespace(rawMessage ?? '');
    if (!message) {
        return fallbackMessage;
    }
    if (message === 'PIN غير صحيح.') {
        return 'بيانات الدخول غير صحيحة. تحقق من رقم الموظف أو اسم المستخدم وPIN ثم أعد المحاولة.';
    }
    if (message === 'الموظف غير موجود أو غير مفعل.') {
        return 'تعذر العثور على الموظف المطلوب أو أن حسابه غير نشط حالياً.';
    }
    if (message === 'جلسة الدخول غير صالحة أو منتهية.') {
        return 'انتهت جلسة العمل أو أصبحت غير صالحة. سجل الدخول من جديد ثم أعد المحاولة.';
    }
    if (message === 'يجب تسجيل الدخول أولاً.') {
        return 'يجب تسجيل الدخول أولاً قبل تنفيذ هذه العملية.';
    }
    if (message === 'ليست لديك صلاحية للوصول إلى هذا المورد.') {
        return 'ليس لديك صلاحية لتنفيذ هذه العملية. راجع مدير النظام إذا كنت بحاجة إلى هذا الإجراء.';
    }
    if (message.includes('اتصال PostgreSQL غير مهيأ') || message.includes('database') || message.includes('PostgreSQL')) {
        return 'تعذر إكمال العملية بسبب مشكلة داخلية في قاعدة البيانات. أعد المحاولة، وإذا تكررت المشكلة فراجع المسؤول.';
    }
    if (message.includes('الرصيد النقدي النهائي الحالي هو')) {
        return message.replace('ولا يكفي لإتمام العملية.', 'وهو غير كافٍ لإتمام العملية حالياً.');
    }
    if (message.includes('الرصيد المتاح في') && message.includes('غير كاف')) {
        return `${message} راجع الرصيد المتاح ثم أعد المحاولة.`;
    }
    if (message.includes('تعذر تحميل') && message.includes('بعد الحفظ')) {
        return 'تم تنفيذ العملية، لكن تعذر تحميل النتيجة النهائية مباشرة. حدّث الصفحة للتأكد من آخر البيانات.';
    }
    return message;
}
export function sendValidationError(response, message, issues) {
    response.status(400).json({
        message,
        issues: normalizeValidationIssues(issues),
    });
}
export function sendOperationError(response, error, fallbackMessage, status = 400) {
    response.status(status).json({
        message: normalizeRouteErrorMessage(error instanceof Error ? error.message : undefined, fallbackMessage),
    });
}
export function sendAuthError(response, message, status = 401) {
    response.status(status).json({
        message: normalizeRouteErrorMessage(message, message),
    });
}
export function sendPermissionError(response, message, status = 403) {
    response.status(status).json({
        message: normalizeRouteErrorMessage(message, message),
    });
}
