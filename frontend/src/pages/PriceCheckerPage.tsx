import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeedbackMessage } from '../components/FeedbackMessage'
import { formatMoney } from '../lib/currency'
import { useSystemSettings } from '../lib/system-settings'
import { buildProductDisplayName } from '../lib/pos'
import { fetchPriceCheckerProducts, findPriceCheckerProductByScan, type PriceCheckerProduct } from '../lib/products-api'
import { getUserFacingErrorMessage } from '../lib/user-facing-errors'

const scannerHint = 'امسح الباركود أو اكتب اسم الصنف أو باركود المفرد'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getProductDisplayParts(product: Pick<PriceCheckerProduct, 'productFamilyName' | 'variantLabel' | 'name'>) {
  return {
    title: product.productFamilyName || product.name,
    subtitle: product.variantLabel?.trim() || null,
    displayName: buildProductDisplayName(product.productFamilyName || product.name, product.variantLabel),
  }
}

export function PriceCheckerPage() {
  const { viewerSettings } = useSystemSettings()
  const [products, setProducts] = useState<PriceCheckerProduct[]>([])
  const [query, setQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<PriceCheckerProduct | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lastLookupAt, setLastLookupAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function loadProducts() {
    setIsLoading(true)

    try {
      const data = await fetchPriceCheckerProducts()
      setProducts(data)
      setMessage(null)
    } catch (error) {
      setMessage(getUserFacingErrorMessage(error, 'تعذر تحميل بيانات الأصناف.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim()

    if (!normalizedQuery) {
      return products.slice(0, 8)
    }

    return products.filter((product) =>
      product.name.includes(normalizedQuery) ||
      product.productFamilyName.includes(normalizedQuery) ||
      product.variantLabel?.includes(normalizedQuery) ||
      product.barcode.includes(normalizedQuery) ||
      product.plu?.includes(normalizedQuery),
    ).slice(0, 8)
  }, [products, query])

  function lookupProduct(rawValue: string) {
    const normalized = rawValue.trim()

    if (!normalized) {
      setSelectedProduct(null)
      setMessage('اكتب اسم الصنف أو امسح باركود المفرد للتحقق من السعر.')
      return
    }

    const scannedMatch = findPriceCheckerProductByScan(products, normalized)

    if (scannedMatch) {
      setSelectedProduct(scannedMatch)
      setLastLookupAt(new Date().toISOString())
      setMessage(null)
      return
    }

    const byName = products.find((product) =>
      product.name.includes(normalized)
      || product.productFamilyName.includes(normalized)
      || product.variantLabel?.includes(normalized),
    ) ?? null

    if (byName) {
      setSelectedProduct(byName)
      setLastLookupAt(new Date().toISOString())
      setMessage(null)
      return
    }

    setSelectedProduct(null)
    setMessage('لم يتم العثور على الصنف. تحقق من باركود المفرد أو اسم الصنف.')
  }

  function handleLookupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    lookupProduct(query)
  }

  const selectedProductDisplay = selectedProduct ? getProductDisplayParts(selectedProduct) : null

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(13,148,136,0.18),transparent_35%),linear-gradient(180deg,#f7f3ea_0%,#efe7d8_45%,#f9f7f1_100%)] px-4 py-5 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[30px] border border-white/75 bg-white/82 px-5 py-5 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.2em] text-teal-700">PRICE CHECKER</p>
              <h1 className="mt-2 font-display text-3xl font-black text-stone-950">شاشة السعارات</h1>
              <p className="mt-2 text-sm text-stone-600">
                {viewerSettings?.storeName ? `شاشة مخصصة لزبائن ${viewerSettings.storeName} لقراءة سعر المفرد فقط من البيانات المركزية دون فتح الكاشير.` : 'شاشة مخصصة للزبون أو موظف الخدمة لقراءة سعر المفرد فقط من البيانات المركزية دون فتح الكاشير.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-stone-500"
                onClick={() => void loadProducts()}
                type="button"
              >
                تحديث الأسعار
              </button>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-teal-500 hover:text-teal-700" to="/dashboard">
                الإدارة
              </Link>
              <Link className="rounded-full border border-stone-300 px-4 py-2 text-sm font-black text-stone-700 transition hover:border-amber-500 hover:text-amber-700" to="/pos">
                الكاشير
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[34px] border border-white/75 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <form className="space-y-4" onSubmit={handleLookupSubmit}>
              <label className="block text-sm font-black text-stone-800">
                ابحث أو امسح الباركود
                <input
                  autoFocus
                  className="mt-2 h-14 w-full rounded-2xl border border-stone-300 bg-white px-4 text-right text-lg text-stone-900 outline-none placeholder:text-stone-400 focus:border-teal-500"
                  placeholder={scannerHint}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-2xl bg-teal-700 px-5 py-3 text-base font-black text-white transition hover:bg-teal-600"
                  type="submit"
                >
                  عرض السعر
                </button>
                <button
                  className="rounded-2xl border border-stone-300 px-5 py-3 text-base font-black text-stone-700 transition hover:border-stone-500"
                  onClick={() => {
                    setQuery('')
                    setSelectedProduct(null)
                    setMessage(null)
                    setLastLookupAt(null)
                  }}
                  type="button"
                >
                  مسح البحث
                </button>
              </div>
            </form>

            <FeedbackMessage message={message} onClear={() => setMessage(null)} successClassName="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" />

            {viewerSettings?.allowPriceDiscounts && viewerSettings.defaultDiscountPercent > 0 ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-bold text-emerald-900">
                يوجد خصم افتراضي مفعّل على الأسعار بنسبة {viewerSettings.defaultDiscountPercent}% ويمكن الرجوع للإدارة عند الحاجة إلى تعديل السياسة السعرية.
              </div>
            ) : null}

            <div className="mt-6 rounded-[30px] border border-stone-200 bg-[linear-gradient(180deg,#0f172a_0%,#162233_100%)] p-6 text-white shadow-[0_28px_90px_rgba(17,24,39,0.18)]">
              {isLoading ? (
                <div className="py-12 text-center text-stone-300">جارٍ تحميل الأسعار...</div>
              ) : selectedProduct ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-black tracking-[0.2em] text-teal-200/80">RETAIL PRICE</p>
                    <h2 className="mt-2 font-display text-4xl font-black">{selectedProductDisplay?.title}</h2>
                    {selectedProductDisplay?.subtitle ? <p className="mt-2 text-lg font-black text-teal-100">{selectedProductDisplay.subtitle}</p> : null}
                    <p className="mt-2 text-sm text-stone-300">{selectedProduct.department}</p>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/6 px-5 py-5">
                    <p className="text-sm font-black tracking-[0.18em] text-stone-300">سعر المفرد فقط</p>
                    <p className="mt-3 font-display text-5xl font-black text-emerald-300">{formatMoney(selectedProduct.retailSalePrice, 'IQD')}</p>
                    <p className="mt-3 text-sm text-stone-300">الوحدة: {selectedProduct.retailUnit}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                      <p className="text-xs font-black tracking-[0.18em] text-stone-400">BARCODE</p>
                      <p className="mt-2 text-base font-bold text-white">{selectedProduct.barcode}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                      <p className="text-xs font-black tracking-[0.18em] text-stone-400">LAST LOOKUP</p>
                      <p className="mt-2 text-base font-bold text-white">{lastLookupAt ? formatDate(lastLookupAt) : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-stone-300">
                  <p className="font-display text-3xl font-black">امسح الباركود</p>
                  <p className="mt-3 text-sm">أو اكتب اسم الصنف لعرض سعر المفرد فقط.</p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[34px] border border-white/75 bg-white/82 p-6 shadow-[0_24px_80px_rgba(77,60,27,0.10)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black tracking-[0.2em] text-amber-700">QUICK PICKS</p>
                <h2 className="mt-2 font-display text-3xl font-black text-stone-950">اقتراحات سريعة</h2>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">{suggestions.length} صنف</span>
            </div>

            <div className="mt-5 space-y-3">
              {suggestions.length ? (
                suggestions.map((product) => (
                  <button
                    key={product.id}
                    className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-stone-50/90 px-4 py-4 text-right transition hover:border-teal-400 hover:bg-white"
                    onClick={() => {
                      setQuery(getProductDisplayParts(product).displayName)
                      setSelectedProduct(product)
                      setLastLookupAt(new Date().toISOString())
                      setMessage(null)
                    }}
                    type="button"
                  >
                    <div>
                      <p className="font-bold text-stone-950">{getProductDisplayParts(product).title}</p>
                      {getProductDisplayParts(product).subtitle ? <p className="mt-1 text-sm font-bold text-teal-700">{getProductDisplayParts(product).subtitle}</p> : null}
                      <p className="mt-1 text-sm text-stone-600">{product.department}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-display text-2xl font-black text-teal-700">{formatMoney(product.retailSalePrice, 'IQD')}</p>
                      <p className="text-xs font-bold text-stone-500">{product.retailUnit}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-stone-500">لا توجد اقتراحات حالياً.</div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}