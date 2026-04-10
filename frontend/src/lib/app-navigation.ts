import type { SystemPermission } from './system-settings-api'

export type NavigationItem = {
  to: string
  label: string
  description: string
  permission?: SystemPermission
}

export const navigationItems: NavigationItem[] = [
  { to: '/', label: 'الرئيسية', description: 'المدخل العام للنظام' },
  { to: '/quick-navigation', label: 'التنقل السريع', description: 'بطاقات دخول سريعة إلى شاشات النظام.' },
  { to: '/dashboard', label: 'لوحة التشغيل', description: 'مؤشرات المبيعات والتنبيهات', permission: 'dashboard' },
  { to: '/pos', label: 'نقطة البيع', description: 'شاشة البيع والكاشير', permission: 'sales' },
  { to: '/invoices', label: 'سجل الفواتير', description: 'مراجعة البيع والمرتجعات', permission: 'sales' },
  { to: '/inventory', label: 'المخزون', description: 'الأصناف والحركات', permission: 'inventory' },
  { to: '/batches', label: 'الدفعات', description: 'الصلاحية والتالف المتوقع', permission: 'batches' },
  { to: '/purchases', label: 'المشتريات', description: 'استلام الموردين وتحديث التكلفة', permission: 'purchases' },
  { to: '/customers', label: 'العملاء', description: 'الأرصدة والتسديدات', permission: 'customers' },
  { to: '/cash-revenues', label: 'الايرادات النقدية', description: 'حركة صندوق الإيرادات', permission: 'expenses' },
  { to: '/expenses', label: 'المصروفات', description: 'السجل المالي اليومي', permission: 'expenses' },
  { to: '/payroll-report', label: 'الرواتب', description: 'التقرير المجمع للرواتب', permission: 'payroll' },
  { to: '/employees', label: 'الموظفون', description: 'الملفات والقيود الوظيفية', permission: 'employees' },
  { to: '/shifts', label: 'الورديات', description: 'فتح وإغلاق الوردية', permission: 'shifts' },
  { to: '/settings', label: 'الإعدادات', description: 'الصلاحيات وبيانات المتجر', permission: 'system-settings' },
]