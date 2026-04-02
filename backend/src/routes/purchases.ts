import { Router } from 'express'
import { ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'
import { createPurchaseReceiptSchema } from '../modules/purchases/schemas.js'

export const purchasesRouter = Router()

purchasesRouter.get('/receipts', async (_request, response) => {
  const dataAccess = getDataAccess()

  response.json({
    data: await dataAccess.purchases.listReceipts(),
  })
})

purchasesRouter.post('/receipts', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = createPurchaseReceiptSchema.parse(request.body)
    const receipt = await dataAccess.purchases.createReceipt({
      ...payload,
      supplierName: payload.supplierName || undefined,
      notes: payload.notes || undefined,
    })

    response.status(201).json({
      data: receipt,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'بيانات سند الاستلام غير صالحة.',
        issues: error.issues,
      })
      return
    }

    response.status(400).json({
      message: error instanceof Error ? error.message : 'تعذر حفظ سند الشراء.',
    })
  }
})