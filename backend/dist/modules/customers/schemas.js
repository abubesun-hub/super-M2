import { z } from 'zod';
export const customerUpsertSchema = z.object({
    name: z.string().min(2).max(200),
    phone: z.string().max(30).optional().or(z.literal('')),
    address: z.string().max(300).optional().or(z.literal('')),
    notes: z.string().max(500).optional().or(z.literal('')),
});
export const customerPaymentSchema = z.object({
    currencyCode: z.enum(['IQD', 'USD']).default('IQD'),
    exchangeRate: z.number().positive(),
    amount: z.number().positive(),
    notes: z.string().max(500).optional().or(z.literal('')),
});
