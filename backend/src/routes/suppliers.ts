import { Router } from 'express'
import { ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'
import { requireEmployeePermission } from '../middleware/employee-auth.js'
import { supplierPaymentSchema, supplierUpsertSchema } from '../modules/suppliers/schemas.js'
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js'

export const suppliersRouter = Router()

suppliersRouter.use(requireEmployeePermission('suppliers', ['admin', 'inventory', 'accountant']))

suppliersRouter.get('/', async (_request, response) => {
  const dataAccess = getDataAccess()

  response.json({
    data: await dataAccess.suppliers.listSuppliers(),
  })
})

// مجموع ديون الموردين
suppliersRouter.get('/total-debt', async (_request, response) => {
  const dataAccess = getDataAccess()
  const totalDebt = await dataAccess.suppliers.getSuppliersTotalDebt()
  response.json({ data: { totalDebt } })
})

suppliersRouter.post('/', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = supplierUpsertSchema.parse(request.body)
    const supplier = await dataAccess.suppliers.createSupplier({
      ...payload,
      phone: payload.phone || undefined,
    })

    response.status(201).json({ data: supplier })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات المورد غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر إنشاء المورد.')
  }
})

suppliersRouter.put('/:supplierId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = supplierUpsertSchema.parse(request.body)
    const supplier = await dataAccess.suppliers.updateSupplier(request.params.supplierId, {
      ...payload,
      phone: payload.phone || undefined,
    })

    response.json({ data: supplier })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات المورد غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تعديل المورد.')
  }
})

suppliersRouter.delete('/:supplierId', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const supplier = await dataAccess.suppliers.deleteSupplier(request.params.supplierId)
    response.json({ data: supplier })
  } catch (error) {
    sendOperationError(response, error, 'تعذر حذف المورد.')
  }
})

suppliersRouter.get('/:supplierId/payments', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payments = await dataAccess.suppliers.listPayments(request.params.supplierId)
    response.json({ data: payments })
  } catch (error) {
    sendOperationError(response, error, 'تعذر تحميل دفعات المورد.')
  }
})

suppliersRouter.post('/:supplierId/payments', async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = supplierPaymentSchema.parse(request.body)
    const employee = request.authEmployee

    if (!employee) {
      sendAuthError(response, 'يجب تسجيل الدخول أولاً.')
      return
    }

    const payment = await dataAccess.suppliers.createPayment(request.params.supplierId, {
      ...payload,
      notes: payload.notes || undefined,
      createdByEmployeeId: employee.id,
      createdByEmployeeName: employee.name,
    })

    response.status(201).json({ data: payment })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات دفعة المورد غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تسجيل دفعة المورد.')
  }
})