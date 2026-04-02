import { z } from 'zod'

export const supplierUpsertSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().max(30).optional().or(z.literal('')),
})

export const supplierPaymentSchema = z.object({
  currencyCode: z.enum(['IQD', 'USD']).default('IQD'),
  exchangeRate: z.number().positive(),
  amount: z.number().positive(),
  notes: z.string().max(500).optional().or(z.literal('')),
})

export type SupplierUpsertInput = z.infer<typeof supplierUpsertSchema>
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>