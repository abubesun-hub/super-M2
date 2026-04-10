const technicalMessagePattern = /failed to fetch|networkerror|load failed|unexpected token|json|html|fetch|ecconnrefused|econnrefused|timeout|timed out|postgres|database|sql|zod|validation|required|invalid|unauthorized|forbidden|not found|internal server error|bad request|cannot|undefined|null|sourceFundAccountId|movementType|amountIqd|employeeId|supplierId|productId|categoryId|referenceId|token/i

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTransportPrefixes(value: string) {
  return value
    .replace(/^error\s*:\s*/i, '')
    .replace(/^failed to fetch\s*:?\s*/i, '')
    .replace(/^network\s*error\s*:?\s*/i, '')
    .trim()
}

function mapKnownMessage(message: string, fallbackMessage: string) {
  const normalizedMessage = normalizeWhitespace(stripTransportPrefixes(message))
  const lowerMessage = normalizedMessage.toLowerCase()

  if (!normalizedMessage) {
    return fallbackMessage
  }

  if (lowerMessage.includes('failed to fetch') || lowerMessage.includes('networkerror') || lowerMessage.includes('load failed')) {
    return 'تعذر الاتصال بالخادم حالياً. تحقق من الشبكة أو من تشغيل الخادم ثم أعد المحاولة.'
  }

  if (
    lowerMessage.includes('unauthorized')
    || lowerMessage.includes('غير مصرح')
    || lowerMessage.includes('غير مخول')
    || lowerMessage.includes('انتهت الجلسة')
    || lowerMessage.includes('token')
    || lowerMessage.includes('session')
  ) {
    return 'انتهت جلسة العمل أو لم يتم تسجيل الدخول. سجل الدخول من جديد ثم أعد المحاولة.'
  }

  if (lowerMessage.includes('forbidden') || normalizedMessage.includes('ليس لديك صلاحية') || normalizedMessage.includes('لا تملك صلاحية')) {
    return 'ليس لديك صلاحية لتنفيذ هذه العملية. راجع مدير النظام إذا كنت بحاجة إلى هذا الإجراء.'
  }

  if (lowerMessage.includes('not found') || normalizedMessage.includes('غير موجود')) {
    return 'تعذر العثور على البيانات المطلوبة. قد تكون حُذفت أو تغيرت، لذا حدّث الصفحة ثم أعد المحاولة.'
  }

  if (
    lowerMessage.includes('duplicate')
    || lowerMessage.includes('already exists')
    || normalizedMessage.includes('موجود مسبق')
    || normalizedMessage.includes('موجودة مسبق')
  ) {
    return 'هذه البيانات مسجلة مسبقاً. راجع الحقول المدخلة ثم أعد المحاولة.'
  }

  if (
    lowerMessage.includes('invalid')
    || lowerMessage.includes('required')
    || lowerMessage.includes('bad request')
    || lowerMessage.includes('validation')
    || lowerMessage.includes('zod')
    || normalizedMessage.includes('حقل')
    || normalizedMessage.includes('مطلوب')
    || normalizedMessage.includes('صيغة')
    || normalizedMessage.includes('غير صالح')
    || normalizedMessage.includes('غير صحيحة')
    || normalizedMessage.includes('غير صحيح')
  ) {
    if (/sourceFundAccountId|movementType|amountIqd|employeeId|supplierId|productId|categoryId|referenceId/i.test(normalizedMessage)) {
      return 'بعض البيانات المدخلة غير مكتملة أو غير صحيحة. راجع الحقول المطلوبة ثم أعد المحاولة.'
    }

    return normalizedMessage
  }

  if (
    lowerMessage.includes('internal server error')
    || lowerMessage.includes('postgres')
    || lowerMessage.includes('database')
    || lowerMessage.includes('sql')
    || lowerMessage.includes('unexpected token')
    || lowerMessage.includes('html')
    || lowerMessage.includes('json')
  ) {
    return 'تعذر إكمال العملية بسبب مشكلة داخلية في الخادم. أعد المحاولة، وإذا تكررت المشكلة فراجع المسؤول.'
  }

  if (/[A-Za-z_]{3,}/.test(normalizedMessage) && technicalMessagePattern.test(normalizedMessage)) {
    return fallbackMessage
  }

  return normalizedMessage
}

export function getUserFacingErrorMessage(error: unknown, fallbackMessage: string) {
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  return mapKnownMessage(error.message, fallbackMessage)
}

export function getUserFacingApiErrorMessage(rawMessage: string | undefined, fallbackMessage: string) {
  return mapKnownMessage(rawMessage ?? '', fallbackMessage)
}