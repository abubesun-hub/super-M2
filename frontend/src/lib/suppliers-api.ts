import { apiFetch } from './api'

export async function fetchSuppliersTotalDebt() {
  const response = await apiFetch('/suppliers/total-debt')
  if (!response.ok) {
    throw new Error('تعذر تحميل مجموع ديون الموردين.')
  }
  const body = await response.json()
  return body.data.totalDebt as number
}
