import { z } from 'zod'

export const capitalTransactionCreateSchema = z.object({
  movementDate: z.string().min(10).max(10),
  movementType: z.enum(['contribution', 'repayment']),
  contributorName: z.string().min(2).max(150),
  amountIqd: z.number().positive(),
  sourceFundAccountId: z.string().min(1).optional(),
  notes: z.string().max(500).optional().or(z.literal('')),
})

export type CapitalTransactionCreatePayload = z.infer<typeof capitalTransactionCreateSchema>
export const capitalTransactionUpdateSchema = capitalTransactionCreateSchema
export type CapitalTransactionUpdatePayload = z.infer<typeof capitalTransactionUpdateSchema>