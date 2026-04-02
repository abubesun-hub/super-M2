import { Router } from 'express'
import { z, ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'

export const productsRouter = Router()

const stockAdjustmentSchema = z.object({
  productId: z.string().min(1),
  quantityDelta: z.number().refine((value) => value !== 0, {
    message: 'يجب أن تكون كمية التعديل أكبر من الصفر أو أقل منه.',
  }),
  note: z.string().min(3).max(200),
})

const productUpsertSchema = z.object({
  name: z.string().min(3).max(200),
  barcode: z.string().min(3).max(50),
  wholesaleBarcode: z.string().min(3).max(50).optional().or(z.literal('')),
  plu: z.string().max(10).optional().or(z.literal('')),
  department: z.string().min(2).max(100),
  measurementType: z.enum(['unit', 'weight']).default('unit'),
  purchaseCostBasis: z.enum(['retail', 'wholesale']).default('retail'),
  retailUnit: z.string().min(1).max(30),
  wholesaleUnit: z.string().max(30).optional().or(z.literal('')),
  wholesaleQuantity: z.number().positive().optional(),
  retailPurchasePrice: z.number().nonnegative(),
  wholesalePurchasePrice: z.number().nonnegative().optional(),
  retailSalePrice: z.number().nonnegative(),
  wholesaleSalePrice: z.number().nonnegative().optional(),
  vatRate: z.number().min(0).max(1),
  stockQty: z.number().min(0),
  minStock: z.number().min(0),
}).superRefine((value, context) => {
  const hasWholesale = Boolean(value.wholesaleUnit && value.wholesaleQuantity && value.wholesaleQuantity > 0)

  if (value.purchaseCostBasis === 'wholesale' && !hasWholesale) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['purchaseCostBasis'],
      message: 'لا يمكن اعتماد تكلفة الجملة بدون تحديد وحدة الجملة ومحتواها.',
    })
  }

  if (hasWholesale && value.wholesaleSalePrice === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wholesaleSalePrice'],
      message: 'أدخل سعر بيع الجملة عند تفعيل وحدة الجملة.',
    })
  }

  if (value.purchaseCostBasis === 'wholesale' && value.wholesalePurchasePrice === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wholesalePurchasePrice'],
      message: 'أدخل تكلفة شراء الجملة عند اعتمادها كأساس.',
    })
  }

  if (hasWholesale && !value.wholesaleBarcode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wholesaleBarcode'],
      message: 'أدخل باركود الجملة عند تفعيل وحدة الجملة.',
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

productsRouter.get('/', async (_request, response) => {
  const dataAccess = getDataAccess()

  response.json({
    data: await dataAccess.products.listProducts(),
  })
})

productsRouter.get('/movements', async (_request, response) => {
  const dataAccess = getDataAccess()

  response.json({
    data: await dataAccess.products.listMovements(),
  })
})

productsRouter.post('/', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = productUpsertSchema.parse(request.body)
    const product = await dataAccess.products.createProduct({
      ...payload,
      wholesaleBarcode: payload.wholesaleBarcode || undefined,
      plu: payload.plu || undefined,
      wholesaleUnit: payload.wholesaleUnit || undefined,
    })

    response.status(201).json({
      data: product,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'بيانات الصنف الجديد غير صالحة.',
        issues: error.issues,
      })
      return
    }

    response.status(400).json({
      message: error instanceof Error ? error.message : 'تعذر إنشاء الصنف.',
    })
  }
})

productsRouter.put('/:productId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = productUpsertSchema.parse(request.body)
    const product = await dataAccess.products.updateProduct(request.params.productId, {
      ...payload,
      wholesaleBarcode: payload.wholesaleBarcode || undefined,
      plu: payload.plu || undefined,
      wholesaleUnit: payload.wholesaleUnit || undefined,
    })

    response.json({
      data: product,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'بيانات تعديل الصنف غير صالحة.',
        issues: error.issues,
      })
      return
    }

    response.status(400).json({
      message: error instanceof Error ? error.message : 'تعذر تعديل الصنف.',
    })
  }
})

productsRouter.delete('/:productId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const product = await dataAccess.products.deleteProduct(request.params.productId)

    response.json({
      data: product,
    })
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'تعذر حذف الصنف.',
    })
  }
})

productsRouter.post('/adjustments', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = stockAdjustmentSchema.parse(request.body)
    const updatedProduct = await dataAccess.products.adjustStock(payload)

    response.status(201).json({
      data: updatedProduct,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'بيانات تعديل المخزون غير صالحة.',
        issues: error.issues,
      })
      return
    }

    response.status(400).json({
      message: error instanceof Error ? error.message : 'تعذر تنفيذ تعديل المخزون.',
    })
  }
})
