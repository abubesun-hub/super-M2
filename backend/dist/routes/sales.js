import { Router } from 'express';
import { ZodError } from 'zod';
import { getDataAccess } from '../data/index.js';
import { createSaleInvoiceSchema, createSaleReturnSchema } from '../modules/sales/schemas.js';
export const salesRouter = Router();
function roundMoney(value) {
    return Number(value.toFixed(2));
}
salesRouter.get('/invoices', async (_request, response) => {
    const dataAccess = getDataAccess();
    response.json({
        data: await dataAccess.sales.listInvoices(),
    });
});
salesRouter.post('/invoices', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = createSaleInvoiceSchema.parse(request.body);
        const computedVat = roundMoney(payload.items.reduce((sum, item) => sum + item.lineTotal - item.lineTotal / (1 + item.vatRate), 0));
        const computedSubtotal = roundMoney(payload.items.reduce((sum, item) => sum + item.lineTotal, 0) - computedVat);
        const computedTotal = roundMoney(payload.items.reduce((sum, item) => sum + item.lineTotal, 0));
        const paidIqd = roundMoney(payload.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0));
        if (Math.abs(computedTotal - payload.totalAmount) > 0.01) {
            response.status(400).json({
                message: 'إجمالي الفاتورة لا يطابق مجموع العناصر.',
            });
            return;
        }
        if (Math.abs(computedSubtotal - payload.subtotal) > 0.01) {
            response.status(400).json({
                message: 'الإجمالي قبل الضريبة غير متوافق مع العناصر.',
            });
            return;
        }
        if (Math.abs(computedVat - payload.vatAmount) > 0.01) {
            response.status(400).json({
                message: 'قيمة الضريبة غير متوافقة مع العناصر.',
            });
            return;
        }
        if (payload.paymentType === 'cash' && paidIqd + 0.01 < payload.totalAmount) {
            response.status(400).json({
                message: 'الدفعات المدخلة أقل من إجمالي الفاتورة.',
            });
            return;
        }
        if ((payload.paymentType === 'credit' || payload.paymentType === 'partial') && paidIqd - payload.totalAmount > 0.01) {
            response.status(400).json({
                message: 'الدفعات المدخلة تتجاوز إجمالي الفاتورة.',
            });
            return;
        }
        const invoice = await dataAccess.sales.createInvoice(payload);
        response.status(201).json({
            data: invoice,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                message: 'بيانات الفاتورة غير صالحة.',
                issues: error.issues,
            });
            return;
        }
        response.status(400).json({
            message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء حفظ الفاتورة.',
        });
    }
});
salesRouter.post('/invoices/:invoiceId/returns', async (request, response) => {
    try {
        const dataAccess = getDataAccess();
        const payload = createSaleReturnSchema.parse(request.body);
        const invoice = await dataAccess.sales.createReturn(request.params.invoiceId, payload);
        response.status(201).json({
            data: invoice,
        });
    }
    catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                message: 'بيانات المرتجع غير صالحة.',
                issues: error.issues,
            });
            return;
        }
        response.status(error instanceof Error && error.message.includes('غير موجودة') ? 404 : 400).json({
            message: error instanceof Error ? error.message : 'تعذر تنفيذ مرتجع المبيعات.',
        });
    }
});
