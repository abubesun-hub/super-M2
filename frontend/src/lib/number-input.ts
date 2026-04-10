const easternArabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function normalizeLocaleDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (character) => {
    const easternIndex = easternArabicDigits.indexOf(character)

    if (easternIndex >= 0) {
      return String(easternIndex)
    }

    const persianIndex = persianDigits.indexOf(character)
    return persianIndex >= 0 ? String(persianIndex) : character
  })
}

export function sanitizeIntegerInput(value: string) {
  return normalizeLocaleDigits(value).replace(/\D/g, '')
}

export function sanitizeDecimalInput(value: string) {
  return normalizeLocaleDigits(value).replace(/[^\d.]/g, '')
}