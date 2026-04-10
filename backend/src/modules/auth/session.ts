import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import type { EmployeeRole } from '../employees/store.js'

export type AuthenticatedEmployee = {
  id: string
  employeeNo: string
  username?: string
  name: string
  role: EmployeeRole
}

type EmployeeSessionPayload = {
  sub: string
  employeeNo: string
  username?: string
  name: string
  role: EmployeeRole
  exp: number
}

const authSecret = env.AUTH_SECRET ?? 'super-m2-dev-secret-change-me'
const employeeSessionTtlMs = 1000 * 60 * 60 * 12

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signValue(value: string) {
  return createHmac('sha256', authSecret).update(value).digest('base64url')
}

export function createEmployeeAccessToken(employee: AuthenticatedEmployee) {
  const payload: EmployeeSessionPayload = {
    sub: employee.id,
    employeeNo: employee.employeeNo,
    username: employee.username,
    name: employee.name,
    role: employee.role,
    exp: Date.now() + employeeSessionTtlMs,
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = signValue(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyEmployeeAccessToken(token: string): AuthenticatedEmployee | null {
  const [encodedPayload, providedSignature] = token.split('.')

  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = signValue(encodedPayload)
  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as EmployeeSessionPayload

    if (!payload.sub || !payload.employeeNo || !payload.name || !payload.role || payload.exp <= Date.now()) {
      return null
    }

    return {
      id: payload.sub,
      employeeNo: payload.employeeNo,
      username: payload.username,
      name: payload.name,
      role: payload.role,
    }
  } catch {
    return null
  }
}