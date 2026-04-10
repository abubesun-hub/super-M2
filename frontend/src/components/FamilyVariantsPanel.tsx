import { formatMoney } from '../lib/currency'
import type { Product } from '../lib/pos'

type FamilyVariantsPanelProps = {
  familyName: string
  products: Product[]
  title: string
  helperText: string
  activeVariantLabel?: string
  actionLabel?: string
  onAction?: () => void
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

export function FamilyVariantsPanel({
  familyName,
  products,
  title,
  helperText,
  activeVariantLabel,
  actionLabel,
  onAction,
}: FamilyVariantsPanelProps) {
  const normalizedFamilyName = familyName.trim()
  const hasFamily = normalizedFamilyName.length > 0

  return (
    <div className="rounded-[26px] border border-white/10 bg-black/20 px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black tracking-[0.18em] text-teal-200/80">FAMILY VARIANTS</p>
          <h3 className="mt-2 text-lg font-black text-white">{title}</h3>
          <p className="mt-2 text-sm font-bold text-stone-300">{helperText}</p>
        </div>
        {onAction && actionLabel && hasFamily ? (
          <button
            className="rounded-full border border-teal-400/40 bg-teal-500/10 px-4 py-2 text-sm font-black text-teal-100 transition hover:border-teal-300 hover:bg-teal-500/20"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>

      {!hasFamily ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm font-bold text-stone-400">
          اختر أو اكتب اسم العائلة أولاً لتظهر لك الأصناف الموجودة تحتها.
        </div>
      ) : products.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-teal-400/30 bg-teal-500/5 px-4 py-6 text-center text-sm font-bold text-teal-100">
          لا توجد أصناف محفوظة بعد تحت هذه العائلة. سيتم اعتبارها عائلة جديدة عند الحفظ.
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {products.map((product) => {
            const variantName = product.variantLabel?.trim() || 'النسخة الأساسية'
            const isActiveVariant = activeVariantLabel?.trim() && product.variantLabel?.trim() === activeVariantLabel.trim()

            return (
              <article
                key={product.id}
                className={`rounded-2xl border px-4 py-4 text-right ${isActiveVariant ? 'border-teal-400/50 bg-teal-500/10' : 'border-white/10 bg-slate-950/35'}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black text-white">{variantName}</p>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-stone-200">
                        {product.department}
                      </span>
                      {product.variantLabel ? (
                        <span className="rounded-full bg-sky-500/15 px-3 py-1 text-[11px] font-black text-sky-100">
                          Variant
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-black text-amber-100">
                          أصل العائلة
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold text-stone-300">
                      باركود: {product.barcode}
                      {product.wholesaleBarcode ? ` | جملة: ${product.wholesaleBarcode}` : ''}
                    </p>
                    <p className="mt-2 text-xs font-bold text-stone-400">
                      الوحدة: {product.retailUnit}
                      {product.wholesaleUnit && product.wholesaleQuantity ? ` | ${product.wholesaleUnit} = ${formatQuantity(product.wholesaleQuantity)} ${product.retailUnit}` : ''}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:min-w-[220px] sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left">
                      <p className="text-[11px] font-black tracking-[0.12em] text-stone-400">STOCK</p>
                      <p className="mt-1 text-lg font-black text-white">{formatQuantity(product.stockQty)}</p>
                      <p className="text-xs font-bold text-stone-400">{product.retailUnit}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left">
                      <p className="text-[11px] font-black tracking-[0.12em] text-stone-400">LAST COST</p>
                      <p className="mt-1 text-lg font-black text-white">{formatMoney(product.retailPurchasePrice, 'IQD')}</p>
                      <p className="text-xs font-bold text-stone-400">سعر مفرد</p>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}