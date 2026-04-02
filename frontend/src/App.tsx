import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { InventoryPage } from './pages/InventoryPage'
import { PosPage } from './pages/PosPage'
import { PurchasesPage } from './pages/PurchasesPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardPage />} path="/dashboard" />
        <Route element={<CustomersPage />} path="/customers" />
        <Route element={<HomePage />} path="/" />
        <Route element={<InvoicesPage />} path="/invoices" />
        <Route element={<InventoryPage />} path="/inventory" />
        <Route element={<PosPage />} path="/pos" />
        <Route element={<PurchasesPage />} path="/purchases" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}

export default App
