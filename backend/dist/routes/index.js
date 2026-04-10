import { Router } from 'express';
import { getStorageInfo } from '../data/index.js';
import { customersRouter } from './customers.js';
import { dashboardRouter } from './dashboard.js';
import { employeesRouter } from './employees.js';
import { expensesRouter } from './expenses.js';
import { fundsRouter } from './funds.js';
import { purchasesRouter } from './purchases.js';
import { productsRouter } from './products.js';
import { salesRouter } from './sales.js';
import { settingsRouter } from './settings.js';
import { shiftsRouter } from './shifts.js';
import { suppliersRouter } from './suppliers.js';
export const apiRouter = Router();
apiRouter.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        service: 'super-m2-api',
        timestamp: new Date().toISOString(),
        storage: getStorageInfo(),
    });
});
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/purchases', purchasesRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/expenses', expensesRouter);
apiRouter.use('/funds', fundsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/shifts', shiftsRouter);
apiRouter.use('/suppliers', suppliersRouter);
