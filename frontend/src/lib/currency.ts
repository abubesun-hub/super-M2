export const IQD_PER_USD = 1310

export type CurrencyCode = 'IQD' | 'USD'

export type PaymentAmounts = Record<CurrencyCode, number>

export const supportedCurrencies = [
  { code: 'IQD', label: 'دينار عراقي', symbol: 'د.ع' },
  { code: 'USD', label: 'دولار أمريكي', symbol: '$' },
] as const satisfies ReadonlyArray<{
  code: CurrencyCode
  label: string
  symbol: string
}>

export function convertFromIqd(
  amountInIqd: number,
  currency: CurrencyCode,
  exchangeRate = IQD_PER_USD,
) {
  if (currency === 'USD') {
    return roundCurrency(amountInIqd / exchangeRate)
  }

  return roundCurrency(amountInIqd)
}

export function convertToIqd(amount: number, currency: CurrencyCode, exchangeRate = IQD_PER_USD) {
  if (currency === 'USD') {
    return roundCurrency(amount * exchangeRate)
  }

  return roundCurrency(amount)
}

export function getSecondaryCurrency(currency: CurrencyCode): CurrencyCode {
  return currency === 'IQD' ? 'USD' : 'IQD'
}

export function formatMoney(
  amountInIqd: number,
  currency: CurrencyCode,
  exchangeRate = IQD_PER_USD,
) {
  const converted = convertFromIqd(amountInIqd, currency, exchangeRate)

  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(converted)
  }

  return `${new Intl.NumberFormat('ar-IQ', {
    maximumFractionDigits: 0,
  }).format(converted)} د.ع`
}

export function formatDualMoney(
  amountInIqd: number,
  primaryCurrency: CurrencyCode,
  exchangeRate = IQD_PER_USD,
) {
  const secondaryCurrency = getSecondaryCurrency(primaryCurrency)

  return {
    primary: formatMoney(amountInIqd, primaryCurrency, exchangeRate),
    secondary: formatMoney(amountInIqd, secondaryCurrency, exchangeRate),
  }
}

export function calculateMixedPayment(
  totalAmountIqd: number,
  payments: PaymentAmounts,
  exchangeRate = IQD_PER_USD,
) {
  const totalPaidIqd = roundCurrency(
    convertToIqd(payments.IQD, 'IQD', exchangeRate) +
      convertToIqd(payments.USD, 'USD', exchangeRate),
  )
  const balanceIqd = roundCurrency(totalAmountIqd - totalPaidIqd)

  return {
    totalPaidIqd,
    dueIqd: balanceIqd > 0 ? balanceIqd : 0,
    changeIqd: balanceIqd < 0 ? Math.abs(balanceIqd) : 0,
    isSettled: balanceIqd <= 0,
  }
}

export function roundCurrency(value: number) {
  return Number(value.toFixed(2))
}
