import { Router } from 'express'
import { ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'
import { requireEmployeePermission } from '../middleware/employee-auth.js'
import { createSaleInvoiceSchema, createSaleReturnSchema } from '../modules/sales/schemas.js'
import { sendOperationError, sendValidationError } from './error-response.js'

export const salesRouter = Router()

salesRouter.use(requireEmployeePermission('sales', ['admin', 'cashier']))

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

salesRouter.get('/invoices', async (request, response) => {
  const dataAccess = getDataAccess()
  // إذا كان المستخدم كاشير، أعد فقط فواتيره
  const employeeId = request.authEmployee?.role === 'cashier' ? request.authEmployee.id : undefined
  response.json({
    data: await dataAccess.sales.listInvoices(employeeId),
  })
})

salesRouter.post('/invoices', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = createSaleInvoiceSchema.parse(request.body)
    const computedVat = roundMoney(
      payload.items.reduce((sum, item) => sum + item.lineTotal - item.lineTotal / (1 + item.vatRate), 0),
    )
    const computedSubtotal = roundMoney(payload.items.reduce((sum, item) => sum + item.lineTotal, 0) - computedVat)
    const computedTotal = roundMoney(payload.items.reduce((sum, item) => sum + item.lineTotal, 0))
    const paidIqd = roundMoney(payload.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0))

    if (Math.abs(computedTotal - payload.totalAmount) > 0.01) {
      response.status(400).json({
        message: 'إجمالي الفاتورة لا يطابق مجموع العناصر.',
      })
      return
    }

    if (Math.abs(computedSubtotal - payload.subtotal) > 0.01) {
      response.status(400).json({
        message: 'الإجمالي قبل الضريبة غير متوافق مع العناصر.',
      })
      return
    }

    if (Math.abs(computedVat - payload.vatAmount) > 0.01) {
      response.status(400).json({
        message: 'قيمة الضريبة غير متوافقة مع العناصر.',
      })
      return
    }

    if (payload.paymentType === 'cash' && paidIqd + 0.01 < payload.totalAmount) {
      response.status(400).json({
        message: 'الدفعات المدخلة أقل من إجمالي الفاتورة.',
      })
      return
    }

    if (payload.paymentType === 'credit' && paidIqd - payload.totalAmount > 0.01) {
      response.status(400).json({
        message: 'الدفعات المدخلة تتجاوز إجمالي الفاتورة.',
      })
      return
    }

    const invoice = await dataAccess.sales.createInvoice(payload)

    response.status(201).json({
      data: invoice,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات الفاتورة غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'حدث خطأ غير متوقع أثناء حفظ الفاتورة.')
  }
})

salesRouter.post('/invoices/:invoiceId/returns', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = createSaleReturnSchema.parse(request.body)
    const invoice = await dataAccess.sales.createReturn(request.params.invoiceId, payload)

    response.status(201).json({
      data: invoice,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات المرتجع غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تنفيذ مرتجع المبيعات.', error instanceof Error && error.message.includes('غير موجودة') ? 404 : 400)
  }
})
