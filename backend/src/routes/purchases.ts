import { Router } from 'express'
import { ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'
import { requireEmployeePermission } from '../middleware/employee-auth.js'
import { createPurchaseReceiptSchema } from '../modules/purchases/schemas.js'
import { sendOperationError, sendValidationError } from './error-response.js'

export const purchasesRouter = Router()

purchasesRouter.use(requireEmployeePermission('purchases', ['admin', 'inventory']))

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
      sendValidationError(response, 'بيانات سند الاستلام غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر حفظ سند الشراء.')
  }
})

purchasesRouter.put('/receipts/:receiptId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = createPurchaseReceiptSchema.parse(request.body)
    const receipt = await dataAccess.purchases.updateReceipt(request.params.receiptId, {
      ...payload,
      supplierName: payload.supplierName || undefined,
      notes: payload.notes || undefined,
    })

    response.json({
      data: receipt,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات تعديل سند الاستلام غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تعديل سند الشراء.')
  }
})

purchasesRouter.delete('/receipts/:receiptId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const receipt = await dataAccess.purchases.deleteReceipt(request.params.receiptId)

    response.json({
      data: receipt,
    })
  } catch (error) {
    sendOperationError(response, error, 'تعذر حذف سند الشراء.')
  }
})