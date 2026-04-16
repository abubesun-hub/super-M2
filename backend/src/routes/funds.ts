import { Router } from 'express'
import { ZodError } from 'zod'
import { getDataAccess } from '../data/index.js'
import { requireEmployeeAuth, requireEmployeePermission } from '../middleware/employee-auth.js'
import { capitalTransactionCreateSchema, capitalTransactionUpdateSchema } from '../modules/funds/schemas.js'
import { sendAuthError, sendOperationError, sendValidationError } from './error-response.js'

export const fundsRouter = Router()

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

fundsRouter.get('/accounts', requireEmployeeAuth(['admin', 'accountant', 'inventory']), async (_request, response) => {
  const dataAccess = getDataAccess()
  response.json({ data: await dataAccess.funds.listAccounts() })
})

fundsRouter.get('/movements', requireEmployeePermission('expenses', ['admin', 'accountant']), async (_request, response) => {
  const dataAccess = getDataAccess()
  response.json({ data: await dataAccess.funds.listMovements() })
})

fundsRouter.get('/capital-transactions', requireEmployeePermission('expenses', ['admin', 'accountant']), async (_request, response) => {
  const dataAccess = getDataAccess()
  response.json({ data: await dataAccess.funds.listCapitalTransactions() })
})

fundsRouter.get('/contributors', requireEmployeePermission('expenses', ['admin', 'accountant']), async (_request, response) => {
  const dataAccess = getDataAccess()
  response.json({ data: await dataAccess.funds.listContributors() })
})

fundsRouter.post('/capital-transactions', requireEmployeePermission('expenses', ['admin', 'accountant']), async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = capitalTransactionCreateSchema.parse(request.body)
    const employee = request.authEmployee

    if (!employee) {
      sendAuthError(response, 'يجب تسجيل الدخول أولاً.')
      return
    }

    const movement = await dataAccess.funds.createCapitalTransaction({
      ...payload,
      notes: payload.notes || undefined,
      createdByEmployeeId: employee.id,
      createdByEmployeeName: employee.name,
    })

    response.status(201).json({ data: movement })
  } catch (error) {
    try {
      // log request and error details to help diagnose intermittent duplicate errors
      // eslint-disable-next-line no-console
      console.error('[route] POST /funds/capital-transactions error', {
        body: request.body,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: (error as any)?.code,
        constraint: (error as any)?.constraint,
      })
    } catch (logErr) {
      // ignore logging failures
    }
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات حركة رأس المال غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تسجيل حركة رأس المال.')
  }
})

fundsRouter.put('/capital-transactions/:movementId', requireEmployeePermission('expenses', ['admin', 'accountant']), async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const payload = capitalTransactionUpdateSchema.parse(request.body)
    const employee = request.authEmployee
    const movementId = getRouteParam(request.params.movementId)

    if (!employee) {
      sendAuthError(response, 'يجب تسجيل الدخول أولاً.')
      return
    }

    const movement = await dataAccess.funds.updateCapitalTransaction(movementId, {
      ...payload,
      notes: payload.notes || undefined,
      createdByEmployeeId: employee.id,
      createdByEmployeeName: employee.name,
    })

    response.json({ data: movement })
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(response, 'بيانات تعديل حركة رأس المال غير صالحة.', error.issues)
      return
    }

    sendOperationError(response, error, 'تعذر تعديل حركة رأس المال.')
  }
})

fundsRouter.delete('/capital-transactions/:movementId', requireEmployeePermission('expenses', ['admin', 'accountant']), async (request, response) => {
  try {
    const dataAccess = getDataAccess()
    const movementId = getRouteParam(request.params.movementId)
    response.json({ data: await dataAccess.funds.deleteCapitalTransaction(movementId) })
  } catch (error) {
    sendOperationError(response, error, 'تعذر حذف حركة رأس المال.')
  }
})