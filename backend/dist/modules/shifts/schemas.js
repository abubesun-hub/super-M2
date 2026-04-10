import { z } from 'zod';
export const createShiftSchema = z.object({
    employeeId: z.string().min(1),
    terminalName: z.string().min(2).max(100),
    openingFloatIqd: z.number().min(0).default(0),
    openingNote: z.string().max(300).optional().or(z.literal('')),
});
export const closeShiftSchema = z.object({
    closingCashIqd: z.number().min(0),
    closingNote: z.string().max(300).optional().or(z.literal('')),
});
