const baseUrl = process.argv[2] ?? 'http://localhost:4001/api'
const frontendUrl = process.argv[3] ?? 'http://localhost:4174/login'

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) }

  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()
  let body = null

  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  }
}

function push(results, test, details) {
  results.push({ test, ...details })
}

function withFailureBody(entry, body) {
  if (entry.ok) {
    return entry
  }

  return {
    ...entry,
    body,
  }
}

async function main() {
  const results = []

  const health = await request('/health')
  push(results, 'health', {
    status: health.status,
    ok: health.ok && health.body?.status === 'ok',
  })

  const active = await request('/employees/active')
  push(results, 'public active employees', withFailureBody({
    status: active.status,
    ok: active.ok,
    count: Array.isArray(active.body?.data) ? active.body.data.length : 0,
  }, active.body))

  const priceCheck = await request('/products/price-check')
  push(results, 'public price check', withFailureBody({
    status: priceCheck.status,
    ok: priceCheck.ok,
    count: Array.isArray(priceCheck.body?.data) ? priceCheck.body.data.length : 0,
  }, priceCheck.body))

  const unauthDashboard = await request('/dashboard/summary')
  push(results, 'dashboard requires auth', withFailureBody({
    status: unauthDashboard.status,
    ok: unauthDashboard.status === 401,
  }, unauthDashboard.body))

  const unauthMovements = await request('/products/movements')
  push(results, 'product movements require auth', withFailureBody({
    status: unauthMovements.status,
    ok: unauthMovements.status === 401,
  }, unauthMovements.body))

  const adminLogin = await request('/employees/authenticate', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', pin: '1985' }),
  })
  const adminToken = adminLogin.body?.data?.accessToken
  const admin = adminLogin.body?.data?.employee
  const adminHeaders = adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
  push(results, 'admin login', withFailureBody({
    status: adminLogin.status,
    ok: adminLogin.ok && Boolean(adminToken) && admin?.role === 'admin',
    employeeNo: admin?.employeeNo ?? null,
  }, adminLogin.body))

  const adminDashboard = await request('/dashboard/summary', { headers: adminHeaders })
  push(results, 'admin dashboard access', {
    status: adminDashboard.status,
    ok: adminDashboard.ok,
  })

  const cashierCreate = await request('/employees', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Cashier Test',
      role: 'cashier',
      pin: '1234',
      notes: 'auth-smoke',
    }),
  })
  const inventoryCreate = await request('/employees', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Inventory Test',
      role: 'inventory',
      pin: '1234',
      notes: 'auth-smoke',
    }),
  })
  const cashier = cashierCreate.body?.data
  const inventory = inventoryCreate.body?.data
  push(results, 'create cashier', {
    status: cashierCreate.status,
    ok: cashierCreate.status === 201 && cashier?.role === 'cashier',
    employeeNo: cashier?.employeeNo ?? null,
  })
  push(results, 'create inventory', {
    status: inventoryCreate.status,
    ok: inventoryCreate.status === 201 && inventory?.role === 'inventory',
    employeeNo: inventory?.employeeNo ?? null,
  })

  const cashierLogin = await request('/employees/authenticate', {
    method: 'POST',
    body: JSON.stringify({ login: cashier?.employeeNo ?? '', pin: '1234' }),
  })
  const inventoryLogin = await request('/employees/authenticate', {
    method: 'POST',
    body: JSON.stringify({ login: inventory?.employeeNo ?? '', pin: '1234' }),
  })
  const cashierToken = cashierLogin.body?.data?.accessToken
  const inventoryToken = inventoryLogin.body?.data?.accessToken
  const cashierHeaders = cashierToken ? { Authorization: `Bearer ${cashierToken}` } : {}
  const inventoryHeaders = inventoryToken ? { Authorization: `Bearer ${inventoryToken}` } : {}
  push(results, 'cashier login', withFailureBody({
    status: cashierLogin.status,
    ok: cashierLogin.ok && cashierLogin.body?.data?.employee?.role === 'cashier',
  }, cashierLogin.body))
  push(results, 'inventory login', withFailureBody({
    status: inventoryLogin.status,
    ok: inventoryLogin.ok && inventoryLogin.body?.data?.employee?.role === 'inventory',
  }, inventoryLogin.body))

  const cashierDashboard = await request('/dashboard/summary', { headers: cashierHeaders })
  push(results, 'cashier blocked from dashboard', withFailureBody({
    status: cashierDashboard.status,
    ok: cashierDashboard.status === 403,
  }, cashierDashboard.body))

  const inventoryDashboard = await request('/dashboard/summary', { headers: inventoryHeaders })
  push(results, 'inventory blocked from dashboard', withFailureBody({
    status: inventoryDashboard.status,
    ok: inventoryDashboard.status === 403,
  }, inventoryDashboard.body))

  const inventoryMovements = await request('/products/movements', { headers: inventoryHeaders })
  push(results, 'inventory can access movements', {
    status: inventoryMovements.status,
    ok: inventoryMovements.ok,
  })

  const cashierMovements = await request('/products/movements', { headers: cashierHeaders })
  push(results, 'cashier blocked from movements', withFailureBody({
    status: cashierMovements.status,
    ok: cashierMovements.status === 403,
  }, cashierMovements.body))

  const cashierOpenOwnShift = await request('/shifts', {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      employeeId: cashier?.id ?? '',
      terminalName: 'POS-1',
      openingFloatIqd: 50000,
      openingNote: 'self-open',
    }),
  })
  push(results, 'cashier opens own shift', {
    status: cashierOpenOwnShift.status,
    ok: cashierOpenOwnShift.status === 201,
  })

  const cashierOpenOtherShift = await request('/shifts', {
    method: 'POST',
    headers: cashierHeaders,
    body: JSON.stringify({
      employeeId: admin?.id ?? '',
      terminalName: 'POS-1',
      openingFloatIqd: 50000,
      openingNote: 'forbidden-open',
    }),
  })
  push(results, 'cashier blocked opening another employee shift', withFailureBody({
    status: cashierOpenOtherShift.status,
    ok: cashierOpenOtherShift.status === 403,
  }, cashierOpenOtherShift.body))

  const cashierShiftList = await request(`/shifts?employeeId=${encodeURIComponent(admin?.id ?? '')}`, {
    headers: cashierHeaders,
  })
  const visibleShifts = Array.isArray(cashierShiftList.body?.data) ? cashierShiftList.body.data : []
  push(results, 'cashier shift list restricted to self', withFailureBody({
    status: cashierShiftList.status,
    ok: cashierShiftList.ok && visibleShifts.every((shift) => shift.employeeId === cashier?.id),
    count: visibleShifts.length,
  }, cashierShiftList.body))

  const frontendResponse = await fetch(frontendUrl)
  push(results, 'frontend login page reachable', {
    status: frontendResponse.status,
    ok: frontendResponse.ok,
    url: frontendResponse.url,
  })

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})