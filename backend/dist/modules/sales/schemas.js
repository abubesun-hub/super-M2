import { z } from 'zod';
export const saleInvoiceItemSchema = z.object({
    productId: z.string().min(1),
    name: z.string().min(1),
    barcode: z.string().min(1),
    quantity: z.number().positive(),
    baseQuantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    vatRate: z.number().min(0),
    lineTotal: z.number().nonnegative(),
    saleUnit: z.enum(['retail', 'wholesale']).default('retail'),
    unitLabel: z.string().min(1),
    source: z.enum(['barcode', 'scale', 'manual']),
});
export const saleInvoicePaymentSchema = z.object({
    paymentMethod: z.enum(['cash']).default('cash'),
    currencyCode: z.enum(['IQD', 'USD']),
    amountReceived: z.number().nonnegative(),
    amountReceivedIqd: z.number().nonnegative(),
    exchangeRate: z.number().positive(),
});
export const createSaleInvoiceSchema = z.object({
    paymentType: z.enum(['cash', 'credit', 'partial']).default('cash'),
    customerId: z.string().min(1).optional(),
    customerName: z.string().min(2).max(200).optional(),
    currencyCode: z.enum(['IQD', 'USD']).default('IQD'),
    exchangeRate: z.number().positive(),
    subtotal: z.number().nonnegative(),
    vatAmount: z.number().nonnegative(),
    totalAmount: z.number().nonnegative(),
    items: z.array(saleInvoiceItemSchema).min(1),
    payments: z.array(saleInvoicePaymentSchema).default([]),
    notes: z.string().max(500).optional(),
}).superRefine((value, context) => {
    const hasCustomer = Boolean(value.customerId || value.customerName);
    const paidIqd = value.payments.reduce((sum, payment) => sum + payment.amountReceivedIqd, 0);
    if (value.paymentType === 'cash' && value.payments.length === 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payments'],
            message: 'الفاتورة النقدية تحتاج إلى دفعة واحدة على الأقل.',
        });
    }
    if ((value.paymentType === 'credit' || value.paymentType === 'partial') && !hasCustomer) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['customerId'],
            message: 'حدد العميل أو أدخل اسمه عند البيع بالآجل أو الجزئي.',
        });
    }
    if (value.paymentType === 'credit' && paidIqd > value.totalAmount + 0.01) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payments'],
            message: 'المبلغ المقبوض لا يمكن أن يتجاوز إجمالي الفاتورة الآجلة.',
        });
    }
    if (value.paymentType === 'partial' && paidIqd <= 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payments'],
            message: 'البيع الجزئي يتطلب دفعة أولية أكبر من صفر.',
        });
    }
    if (value.paymentType === 'partial' && paidIqd + 0.01 >= value.totalAmount) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payments'],
            message: 'إذا تم دفع كامل المبلغ فاستخدم نوع الدفع النقدي بدلاً من الجزئي.',
        });
    }
});
export const saleReturnItemSchema = z.object({
    invoiceItemId: z.string().min(1),
    quantity: z.number().positive(),
});
export const createSaleReturnSchema = z.object({
    reason: z.string().min(3).max(300),
    items: z.array(saleReturnItemSchema).min(1),
});
