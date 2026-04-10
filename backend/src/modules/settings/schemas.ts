import { z } from 'zod'
import { systemPermissionKeys } from './store.js'

const optionalText = z.string().max(250).optional().or(z.literal(''))
const optionalPhone = z.string().max(40).optional().or(z.literal(''))

export const systemPermissionSchema = z.enum(systemPermissionKeys)

export const systemSettingsUpdateSchema = z.object({
  storeName: z.string().min(2).max(120),
  legalName: optionalText,
  primaryPhone: optionalPhone,
  secondaryPhone: optionalPhone,
  whatsapp: optionalPhone,
  email: z.string().email('صيغة البريد الإلكتروني غير صحيحة.').max(120).optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  invoiceFooter: z.string().max(250).optional().or(z.literal('')),
  defaultDiscountPercent: z.number().min(0).max(100),
  maxManualDiscountPercent: z.number().min(0).max(100),
  allowPriceDiscounts: z.boolean(),
  rolePermissions: z.object({
    admin: z.array(systemPermissionSchema).optional(),
    cashier: z.array(systemPermissionSchema),
    inventory: z.array(systemPermissionSchema),
    accountant: z.array(systemPermissionSchema),
  }),
}).superRefine((value, context) => {
  if (value.maxManualDiscountPercent < value.defaultDiscountPercent) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxManualDiscountPercent'],
      message: 'الحد الأعلى للخصم اليدوي يجب أن يكون أكبر من أو مساوياً للخصم الافتراضي.',
    })
  }
})

export type SystemSettingsUpdatePayload = z.infer<typeof systemSettingsUpdateSchema>