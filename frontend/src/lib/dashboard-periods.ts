import type { DashboardSummaryPeriodPreset } from './dashboard-api'

export type DashboardFilterState = {
  preset: DashboardSummaryPeriodPreset
  startDate: string
  endDate: string
}

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

export function createDefaultDashboardFilter(): DashboardFilterState {
  const today = getTodayDateValue()

  return {
    preset: 'today',
    startDate: today,
    endDate: today,
  }
}

export function buildDashboardSummaryRequest(filter: DashboardFilterState) {
  return {
    preset: filter.preset,
    startDate: filter.preset === 'custom' ? filter.startDate : undefined,
    endDate: filter.preset === 'custom' ? filter.endDate : undefined,
  }
}

export function getDashboardFilterLabel(preset: DashboardSummaryPeriodPreset) {
  if (preset === 'today') {
    return 'اليوم'
  }

  if (preset === 'month') {
    return 'هذا الشهر'
  }

  if (preset === 'year') {
    return 'هذه السنة'
  }

  if (preset === 'all') {
    return 'تراكمي'
  }

  return 'فترة مخصصة'
}