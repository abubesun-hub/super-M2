export function exportRowsToCsv(input: {
  fileName: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null | undefined>>
}) {
  const escapeCell = (value: string | number | boolean | null | undefined) => {
    const normalized = value == null ? '' : String(value)
    const escaped = normalized.replace(/"/g, '""')
    return `"${escaped}"`
  }

  const lines = [input.headers, ...input.rows].map((row) => row.map(escapeCell).join(','))
  const csv = `\uFEFF${lines.join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = input.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
