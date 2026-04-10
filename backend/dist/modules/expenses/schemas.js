import { z } from 'zod';
export const expenseCategoryKindSchema = z.enum(['operating', 'service', 'payroll', 'supplier', 'other']);
export const expensePaymentMethodSchema = z.enum(['cash', 'bank']);
export const expenseCategoryCreateSchema = z.object({
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(60),
    kind: expenseCategoryKindSchema,
    description: z.string().max(250).optional().or(z.literal('')),
});
export const expenseCreateSchema = z.object({
    expenseDate: z.string().min(10).max(10),
    categoryId: z.string().min(1),
    amountIqd: z.number().positive(),
    paymentMethod: expensePaymentMethodSchema,
    sourceFundAccountId: z.string().min(1).optional().or(z.literal('')),
    beneficiaryName: z.string().max(120).optional().or(z.literal('')),
    notes: z.string().max(500).optional().or(z.literal('')),
    shiftId: z.string().optional().or(z.literal('')),
});
