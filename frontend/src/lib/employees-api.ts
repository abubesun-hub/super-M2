import { apiFetch } from './api'
import { getUserFacingApiErrorMessage } from './user-facing-errors'

export type EmployeeRole = 'admin' | 'cashier' | 'inventory' | 'accountant'
export type EmployeeEmploymentStatus = 'active' | 'suspended' | 'terminated'
export type EmployeeCompensationKind = 'salary' | 'payment' | 'advance' | 'bonus' | 'deduction'
export type EmployeeCompensationPaymentMethod = 'cash' | 'bank'
export type EmployeeCompensationCalculationMethod = 'manual' | 'monthly'

export type Employee = {
  id: string
  employeeNo: string
  username?: string
  name: string
  role: EmployeeRole
  startDate?: string
  monthlySalaryIqd?: number
  employmentStatus: EmployeeEmploymentStatus
  serviceEndDate?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

export type EmployeeCreatePayload = {
  name: string
  role: EmployeeRole
  startDate?: string
  monthlySalaryIqd?: number
  employmentStatus?: EmployeeEmploymentStatus
  serviceEndDate?: string
  pin: string
  notes?: string
}

export type EmployeeUpdatePayload = {
  name: string
  role: EmployeeRole
  startDate?: string
  monthlySalaryIqd?: number
  employmentStatus?: EmployeeEmploymentStatus
  serviceEndDate?: string
  notes?: string
}

export type EmployeeCompensation = {
  id: string
  paymentNo: string
  employeeId: string
  employeeName: string
  kind: EmployeeCompensationKind
  amountIqd: number
  calculationMethod: EmployeeCompensationCalculationMethod
  paymentMethod?: EmployeeCompensationPaymentMethod
  paymentDate: string
  periodLabel?: string
  notes?: string
  createdByEmployeeId: string
  createdByEmployeeName: string
  createdAt: string
}

export type EmployeeCompensationPayload = {
  kind: EmployeeCompensationKind
  amountIqd?: number
  calculationMethod?: EmployeeCompensationCalculationMethod
  paymentMethod?: EmployeeCompensationPaymentMethod
  paymentDate: string
  periodLabel?: string
  notes?: string
}

export type EmployeeAbsence = {
  id: string
  employeeId: string
  employeeName: string
  absenceDate: string
  deductionDays: number
  notes?: string
  createdByEmployeeId: string
  createdByEmployeeName: string
  createdAt: string
}

export type EmployeeAbsencePayload = {
  absenceDate: string
  deductionDays: number
  notes?: string
}

export type MonthlyPayrollSummary = {
  employeeId: string
  employeeNo: string
  employeeName: string
  role: EmployeeRole
  monthKey: string
  startDate?: string
  employmentStatus: EmployeeEmploymentStatus
  serviceEndDate?: string
  monthlySalaryIqd: number
  payableDays: number
  absenceDays: number
  grossSalaryIqd: number
  absenceDeductionIqd: number
  bonusIqd: number
  deductionIqd: number
  advanceIqd: number
  paymentIqd: number
  expectedNetSalaryIqd: number
  existingSalaryIqd: number
  salaryToAccrueIqd: number
  remainingPayableIqd: number
}

export type EmployeeCumulativePayrollSummary = {
  employeeId: string
  employeeNo: string
  employeeName: string
  role: EmployeeRole
  throughMonth: string
  startDate?: string
  employmentStatus: EmployeeEmploymentStatus
  serviceEndDate?: string
  monthsCount: number
  totalPayableDays: number
  totalAbsenceDays: number
  totalGrossSalaryIqd: number
  totalExpectedNetSalaryIqd: number
  totalAbsenceDeductionIqd: number
  totalBonusIqd: number
  totalDeductionIqd: number
  totalAdvanceIqd: number
  totalPaymentIqd: number
  totalPaidOutIqd: number
  totalOutstandingIqd: number
}

export type MonthlyPayrollSettlementPayload = {
  month: string
  paymentDate: string
  paymentMethod: EmployeeCompensationPaymentMethod
  employeeIds?: string[]
}

export type EmployeeAuthPayload = {
  login: string
  pin: string
}

export type ActiveEmployee = Pick<Employee, 'id' | 'employeeNo' | 'name' | 'role' | 'isActive'>

export type EmployeeAuthenticationResult = {
  employee: Employee
  accessToken: string
}

async function parseError(response: Response, fallbackMessage: string) {
  const errorBody = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message?: string }> } | null
  throw new Error(getUserFacingApiErrorMessage(errorBody?.issues?.[0]?.message ?? errorBody?.message, fallbackMessage))
}

export async function fetchEmployees() {
  const response = await apiFetch('/employees')

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل الموظفين.')
  }

  const body = (await response.json()) as { data: Employee[] }
  return body.data
}

export async function fetchActiveEmployees() {
  const response = await apiFetch('/employees/active', {}, { auth: false })

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل الموظفين النشطين.')
  }

  const body = (await response.json()) as { data: ActiveEmployee[] }
  return body.data
}

export async function createEmployee(payload: EmployeeCreatePayload) {
  const response = await apiFetch('/employees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر إنشاء الموظف.')
  }

  const body = (await response.json()) as { data: Employee }
  return body.data
}

export async function updateEmployee(employeeId: string, payload: EmployeeUpdatePayload) {
  const response = await apiFetch(`/employees/${employeeId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تعديل الموظف.')
  }

  const body = (await response.json()) as { data: Employee }
  return body.data
}

export async function fetchEmployeeCompensations(employeeId: string) {
  const response = await apiFetch(`/employees/${employeeId}/compensations`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل سجل قيود الموظف.')
  }

  const body = (await response.json()) as { data: EmployeeCompensation[] }
  return body.data
}

export async function createEmployeeCompensation(employeeId: string, payload: EmployeeCompensationPayload) {
  const response = await apiFetch(`/employees/${employeeId}/compensations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل قيد الموظف.')
  }

  const body = (await response.json()) as { data: EmployeeCompensation }
  return body.data
}

export async function fetchEmployeeAbsences(employeeId: string) {
  const response = await apiFetch(`/employees/${employeeId}/absences`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل سجل الغيابات.')
  }

  const body = (await response.json()) as { data: EmployeeAbsence[] }
  return body.data
}

export async function createEmployeeAbsence(employeeId: string, payload: EmployeeAbsencePayload) {
  const response = await apiFetch(`/employees/${employeeId}/absences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل الغياب.')
  }

  const body = (await response.json()) as { data: EmployeeAbsence }
  return body.data
}

export async function updateEmployeeAbsence(employeeId: string, absenceId: string, payload: EmployeeAbsencePayload) {
  const response = await apiFetch(`/employees/${employeeId}/absences/${absenceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تعديل الغياب.')
  }

  const body = (await response.json()) as { data: EmployeeAbsence }
  return body.data
}

export async function deleteEmployeeAbsence(employeeId: string, absenceId: string) {
  const response = await apiFetch(`/employees/${employeeId}/absences/${absenceId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    await parseError(response, 'تعذر حذف الغياب.')
  }

  const body = (await response.json()) as { data: EmployeeAbsence }
  return body.data
}

export async function fetchMonthlyPayroll(month: string) {
  const response = await apiFetch(`/employees/payroll/monthly?month=${encodeURIComponent(month)}`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل ملخص الرواتب الشهري.')
  }

  const body = (await response.json()) as { data: MonthlyPayrollSummary[] }
  return body.data
}

export async function fetchCumulativePayroll(month: string) {
  const response = await apiFetch(`/employees/payroll/cumulative?month=${encodeURIComponent(month)}`)

  if (!response.ok) {
    await parseError(response, 'تعذر تحميل ملخص الاستحقاقات التراكمية.')
  }

  const body = (await response.json()) as { data: EmployeeCumulativePayrollSummary[] }
  return body.data
}

export async function settleMonthlyPayroll(payload: MonthlyPayrollSettlementPayload) {
  const response = await apiFetch('/employees/payroll/monthly/settle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تسديد الرواتب الشهرية.')
  }

  const body = (await response.json()) as { data: EmployeeCompensation[] }
  return body.data
}

export async function resetEmployeePin(employeeId: string, pin: string) {
  const response = await apiFetch(`/employees/${employeeId}/pin`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pin }),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر إعادة تعيين PIN.')
  }

  const body = (await response.json()) as { data: Employee }
  return body.data
}

export async function updateEmployeeStatus(employeeId: string, isActive: boolean) {
  const response = await apiFetch(`/employees/${employeeId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isActive }),
  })

  if (!response.ok) {
    await parseError(response, 'تعذر تحديث حالة الموظف.')
  }

  const body = (await response.json()) as { data: Employee }
  return body.data
}

export async function authenticateEmployee(payload: EmployeeAuthPayload) {
  const response = await apiFetch('/employees/authenticate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, { auth: false })

  if (!response.ok) {
    await parseError(response, 'تعذر تسجيل الدخول.')
  }

  const body = (await response.json()) as { data: EmployeeAuthenticationResult }
  return body.data
}
