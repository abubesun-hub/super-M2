import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { EmployeeSessionProvider, useEmployeeSession } from './lib/auth'
import { SystemSettingsProvider, useSystemSettings } from './lib/system-settings'
import type { SystemPermission } from './lib/system-settings-api'
import { BatchesPage } from './pages/BatchesPage'
import { CashRevenuesPage } from './pages/CashRevenuesPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeeLoginPage } from './pages/EmployeeLoginPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { HomePage } from './pages/HomePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { InventoryPage } from './pages/InventoryPage'
import { PosPage } from './pages/PosPage'
import { PriceCheckerPage } from './pages/PriceCheckerPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { PayrollReportPage } from './pages/PayrollReportPage'
import { QuickNavigationPage } from './pages/QuickNavigationPage'
import { SettingsPage } from './pages/SettingsPage'
import { ShiftsPage } from './pages/ShiftsPage'

function getDefaultRoute(role: 'admin' | 'cashier' | 'inventory' | 'accountant', permissions: SystemPermission[]) {
  if (permissions.includes('dashboard')) {
    return '/dashboard'
  }

  if (permissions.includes('expenses')) {
    return '/expenses'
  }

  if (permissions.includes('inventory')) {
    return '/inventory'
  }

  if (permissions.includes('sales')) {
    return role === 'cashier' ? '/pos' : '/invoices'
  }

  if (permissions.includes('purchases')) {
    return '/purchases'
  }

  if (permissions.includes('customers')) {
    return '/customers'
  }

  if (role === 'cashier') {
    return '/pos'
  }

  if (role === 'inventory') {
    return '/inventory'
  }

  if (role === 'accountant') {
    return '/expenses'
  }

  return '/'
}

function RequireEmployeeSession({
  requiredPermission,
  children,
}: {
  requiredPermission?: SystemPermission
  children: ReactElement
}) {
  const { session } = useEmployeeSession()
  const { permissions, isLoading } = useSystemSettings()

  if (!session) {
    return <Navigate replace to="/login" />
  }

  if (requiredPermission && isLoading) {
    return <main className="min-h-screen bg-[linear-gradient(180deg,#f4efe3_0%,#efe7d8_45%,#f8f5ef_100%)] px-4 py-12 text-center text-stone-700">جارٍ تحميل صلاحيات الجلسة...</main>
  }

  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return <Navigate replace to={getDefaultRoute(session.employee.role, permissions)} />
  }

  return <AppShell>{children}</AppShell>
}

function App() {
  return (
    <EmployeeSessionProvider>
      <SystemSettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RequireEmployeeSession requiredPermission="batches"><BatchesPage /></RequireEmployeeSession>} path="/batches" />
            <Route element={<RequireEmployeeSession requiredPermission="expenses"><CashRevenuesPage /></RequireEmployeeSession>} path="/cash-revenues" />
            <Route element={<RequireEmployeeSession requiredPermission="dashboard"><DashboardPage /></RequireEmployeeSession>} path="/dashboard" />
            <Route element={<RequireEmployeeSession requiredPermission="employees"><EmployeesPage /></RequireEmployeeSession>} path="/employees" />
            <Route element={<RequireEmployeeSession requiredPermission="expenses"><ExpensesPage /></RequireEmployeeSession>} path="/expenses" />
            <Route element={<RequireEmployeeSession requiredPermission="payroll"><PayrollReportPage /></RequireEmployeeSession>} path="/payroll-report" />
            <Route element={<RequireEmployeeSession requiredPermission="customers"><CustomersPage /></RequireEmployeeSession>} path="/customers" />
            <Route element={<RequireEmployeeSession><HomePage /></RequireEmployeeSession>} path="/" />
            <Route element={<RequireEmployeeSession><QuickNavigationPage /></RequireEmployeeSession>} path="/quick-navigation" />
            <Route element={<RequireEmployeeSession requiredPermission="sales"><InvoicesPage /></RequireEmployeeSession>} path="/invoices" />
            <Route element={<RequireEmployeeSession requiredPermission="inventory"><InventoryPage /></RequireEmployeeSession>} path="/inventory" />
            <Route element={<EmployeeLoginPage />} path="/login" />
            <Route element={<RequireEmployeeSession requiredPermission="sales"><PosPage /></RequireEmployeeSession>} path="/pos" />
            <Route element={<PriceCheckerPage />} path="/price-checker" />
            <Route element={<RequireEmployeeSession requiredPermission="purchases"><PurchasesPage /></RequireEmployeeSession>} path="/purchases" />
            <Route element={<RequireEmployeeSession requiredPermission="system-settings"><SettingsPage /></RequireEmployeeSession>} path="/settings" />
            <Route element={<RequireEmployeeSession requiredPermission="shifts"><ShiftsPage /></RequireEmployeeSession>} path="/shifts" />
            <Route element={<Navigate replace to="/login" />} path="*" />
          </Routes>
        </BrowserRouter>
      </SystemSettingsProvider>
    </EmployeeSessionProvider>
  )
}

export default App
