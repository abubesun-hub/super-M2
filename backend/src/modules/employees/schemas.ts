import { z } from 'zod'

export const employeeRoleSchema = z.enum(['admin', 'cashier', 'inventory', 'accountant'])
export const employeeEmploymentStatusSchema = z.enum(['active', 'suspended', 'terminated'])

const optionalNotesSchema = z.string().max(500).optional().or(z.literal(''))
const optionalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD.').optional().or(z.literal(''))
const optionalMonthlySalarySchema = z.number().positive().max(1_000_000_000).optional()

export const employeeCreateSchema = z.object({
  name: z.string().min(2).max(200),
  role: employeeRoleSchema,
  pin: z.string().regex(/^\d{4,8}$/, 'يجب أن يتكون PIN من 4 إلى 8 أرقام.'),
  startDate: optionalDateSchema,
  monthlySalaryIqd: optionalMonthlySalarySchema,
  employmentStatus: employeeEmploymentStatusSchema.optional(),
  serviceEndDate: optionalDateSchema,
  notes: optionalNotesSchema,
}).superRefine((value, context) => {
  if (value.serviceEndDate && !value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'حدد تاريخ المباشرة أولاً.',
    })
  }

  if (value.startDate && value.serviceEndDate && value.startDate > value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ المباشرة.',
    })
  }

  if ((value.employmentStatus === 'suspended' || value.employmentStatus === 'terminated') && !value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'حدد تاريخ التوقف أو إنهاء الخدمة.',
    })
  }

  if (value.employmentStatus === 'active' && value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'الموظف النشط لا يجب أن يحتوي على تاريخ نهاية خدمة.',
    })
  }
})

export const employeeUpdateSchema = z.object({
  name: z.string().min(2).max(200),
  role: employeeRoleSchema,
  startDate: optionalDateSchema,
  monthlySalaryIqd: optionalMonthlySalarySchema,
  employmentStatus: employeeEmploymentStatusSchema.optional(),
  serviceEndDate: optionalDateSchema,
  notes: optionalNotesSchema,
}).superRefine((value, context) => {
  if (value.serviceEndDate && !value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'حدد تاريخ المباشرة أولاً.',
    })
  }

  if (value.startDate && value.serviceEndDate && value.startDate > value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'تاريخ نهاية الخدمة يجب أن يكون بعد تاريخ المباشرة.',
    })
  }

  if ((value.employmentStatus === 'suspended' || value.employmentStatus === 'terminated') && !value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'حدد تاريخ التوقف أو إنهاء الخدمة.',
    })
  }

  if (value.employmentStatus === 'active' && value.serviceEndDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceEndDate'],
      message: 'الموظف النشط لا يجب أن يحتوي على تاريخ نهاية خدمة.',
    })
  }
})

export const employeePinResetSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, 'يجب أن يتكون PIN من 4 إلى 8 أرقام.'),
})

export const employeeAuthSchema = z.object({
  login: z.string().trim().min(1),
  pin: z.string().regex(/^\d{4,8}$/, 'يجب أن يتكون PIN من 4 إلى 8 أرقام.'),
})

export const employeeStatusSchema = z.object({
  isActive: z.boolean(),
})

export const employeeCompensationKindSchema = z.enum(['salary', 'payment', 'advance', 'bonus', 'deduction'])
export const employeeCompensationPaymentMethodSchema = z.enum(['cash', 'bank'])
export const employeeCompensationCalculationMethodSchema = z.enum(['manual', 'monthly'])

export const employeeCompensationCreateSchema = z.object({
  kind: employeeCompensationKindSchema,
  amountIqd: z.number().positive().max(1_000_000_000).optional(),
  calculationMethod: employeeCompensationCalculationMethodSchema.optional(),
  paymentMethod: employeeCompensationPaymentMethodSchema.optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الحركة يجب أن يكون بصيغة YYYY-MM-DD.'),
  periodLabel: z.string().regex(/^\d{4}-\d{2}$/, 'شهر القيد يجب أن يكون بصيغة YYYY-MM.').optional().or(z.literal('')),
  notes: optionalNotesSchema,
}).superRefine((value, context) => {
  if (value.kind === 'payment' || value.kind === 'advance') {
    if (typeof value.amountIqd !== 'number') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountIqd'],
        message: 'أدخل مبلغ الصرف.',
      })
    }

    if (!value.paymentMethod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'حدد طريقة الدفع.',
      })
    }

    return
  }

  if (value.kind === 'bonus' || value.kind === 'deduction') {
    if (typeof value.amountIqd !== 'number') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountIqd'],
        message: 'أدخل مبلغ الحركة.',
      })
    }

    return
  }
})

export const employeeAbsenceCreateSchema = z.object({
  absenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الغياب يجب أن يكون بصيغة YYYY-MM-DD.'),
  deductionDays: z.number().positive().max(30),
  notes: optionalNotesSchema,
})

export const employeeAbsenceUpdateSchema = employeeAbsenceCreateSchema

export const monthlyPayrollQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة الشهر يجب أن تكون YYYY-MM.'),
})

export const monthlyPayrollSettlementSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'صيغة الشهر يجب أن تكون YYYY-MM.'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الصرف يجب أن يكون بصيغة YYYY-MM-DD.'),
  paymentMethod: employeeCompensationPaymentMethodSchema,
  employeeIds: z.array(z.string().min(1)).optional(),
})

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>
export type EmployeeAuthInput = z.infer<typeof employeeAuthSchema>
export type EmployeeCompensationCreateInput = z.infer<typeof employeeCompensationCreateSchema>
export type EmployeeAbsenceCreateInput = z.infer<typeof employeeAbsenceCreateSchema>
export type EmployeeAbsenceUpdateInput = z.infer<typeof employeeAbsenceUpdateSchema>
export type MonthlyPayrollSettlementInput = z.infer<typeof monthlyPayrollSettlementSchema>
