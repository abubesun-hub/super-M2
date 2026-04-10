import type { NextFunction, Request, Response } from 'express'
import { getDataAccess } from '../data/index.js'
import { sendAuthError, sendPermissionError } from '../routes/error-response.js'
import { verifyEmployeeAccessToken, type AuthenticatedEmployee } from '../modules/auth/session.js'
import { hasSystemPermission, type SystemPermission } from '../modules/settings/store.js'

declare global {
  namespace Express {
    interface Request {
      authEmployee?: AuthenticatedEmployee
    }
  }
}

function readBearerToken(request: Request) {
  const authorizationHeader = request.headers.authorization?.trim()

  if (!authorizationHeader?.toLowerCase().startsWith('bearer ')) {
    return null
  }

  return authorizationHeader.slice(7).trim() || null
}

type AllowedRole = 'admin' | 'cashier' | 'inventory' | 'accountant'

function authenticateRequest(request: Request, response: Response) {
  const token = readBearerToken(request)

  if (!token) {
    sendAuthError(response, 'يجب تسجيل الدخول أولاً.')
    return null
  }

  const employee = verifyEmployeeAccessToken(token)

  if (!employee) {
    sendAuthError(response, 'جلسة الدخول غير صالحة أو منتهية.')
    return null
  }

  request.authEmployee = employee
  return employee
}

export function requireEmployeeAuth(allowedRoles?: AllowedRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    const employee = authenticateRequest(request, response)

    if (!employee) {
      return
    }

    if (allowedRoles && !allowedRoles.includes(employee.role)) {
      sendPermissionError(response, 'ليست لديك صلاحية للوصول إلى هذا المورد.')
      return
    }

    next()
  }
}

export function requireEmployeePermission(permission: SystemPermission, allowedRoles?: AllowedRole[]) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const employee = authenticateRequest(request, response)

    if (!employee) {
      return
    }

    if (allowedRoles?.includes(employee.role)) {
      next()
      return
    }

    const settings = await getDataAccess().settings.getSettings()

    if (!hasSystemPermission(settings, employee.role, permission)) {
      sendPermissionError(response, 'ليست لديك صلاحية للوصول إلى هذا المورد.')
      return
    }

    next()
  }
}