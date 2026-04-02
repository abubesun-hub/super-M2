import { z } from 'zod'

export const purchaseReceiptProductDraftSchema = z.object({
  name: z.string().min(3).max(200),
  barcode: z.string().min(3).max(50),
  wholesaleBarcode: z.string().min(3).max(50).optional().or(z.literal('')),
  plu: z.string().max(10).optional().or(z.literal('')),
  department: z.string().min(2).max(100),
  measurementType: z.enum(['unit', 'weight']).default('unit'),
  retailUnit: z.string().min(1).max(30),
  wholesaleUnit: z.string().max(30).optional().or(z.literal('')),
  wholesaleQuantity: z.number().positive().optional(),
  vatRate: z.number().min(0).max(1).default(0.15),
}).superRefine((value, context) => {
  const hasWholesale = Boolean(value.wholesaleUnit && value.wholesaleQuantity && value.wholesaleQuantity > 0)

  if (hasWholesale && !value.wholesaleBarcode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wholesaleBarcode'],
      message: 'أدخل باركود الجملة عند تعريف تعبئة الجملة.',
    })
  }

  if (value.wholesaleBarcode && value.wholesaleBarcode === value.barcode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wholesaleBarcode'],
      message: 'يجب أن يختلف باركود الجملة عن باركود المفرد.',
    })
  }
})

export const purchaseReceiptItemSchema = z.object({
  productId: z.string().min(1).optional(),
  productDraft: purchaseReceiptProductDraftSchema.optional(),
  entryUnit: z.enum(['retail', 'wholesale']).default('retail'),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  batchNo: z.string().max(50).optional().or(z.literal('')),
  expiryDate: z.string().max(10).optional().or(z.literal('')),
}).superRefine((value, context) => {
  const hasProductId = Boolean(value.productId)
  const hasProductDraft = Boolean(value.productDraft)

  if (hasProductId === hasProductDraft) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['productId'],
      message: 'يجب اختيار صنف موجود أو إدخال صنف جديد في كل سطر شراء.',
    })
  }

  if (value.entryUnit === 'wholesale' && value.productDraft) {
    const hasWholesale = Boolean(
      value.productDraft.wholesaleUnit &&
      value.productDraft.wholesaleQuantity &&
      value.productDraft.wholesaleQuantity > 0,
    )

    if (!hasWholesale) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productDraft', 'wholesaleQuantity'],
        message: 'عند استلام الصنف الجديد بالجملة يجب تحديد تعبئة الجملة ومحتواها.',
      })
    }
  }

  if (value.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.expiryDate)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiryDate'],
      message: 'تاريخ النفاذ يجب أن يكون بصيغة YYYY-MM-DD.',
    })
  }
})

export const createPurchaseReceiptSchema = z.object({
  supplierId: z.string().min(1).optional().or(z.literal('')),
  supplierName: z.string().min(2).max(200).optional().or(z.literal('')),
  purchaseDate: z.string().min(1).max(10).optional().or(z.literal('')),
  supplierInvoiceNo: z.string().min(1).max(50).optional().or(z.literal('')),
  currencyCode: z.enum(['IQD', 'USD']).default('IQD'),
  exchangeRate: z.number().positive(),
  notes: z.string().max(500).optional().or(z.literal('')),
  items: z.array(purchaseReceiptItemSchema).min(1),
})

export type CreatePurchaseReceiptInput = z.infer<typeof createPurchaseReceiptSchema>