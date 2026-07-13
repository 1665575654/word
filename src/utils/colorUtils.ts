/** 将 #RRGGBB 或 RRGGBB 转为 ExcelJS 使用的 ARGB（FF + RRGGBB） */
export function hexToArgb(hex: string): string {
  const h = hex.replace(/^#/, '').toUpperCase()
  if (h.length === 6) return `FF${h}`
  if (h.length === 8) return h
  return 'FF000000'
}

export function normalizeHexColor(hex: string): string {
  const h = hex.replace(/^#/, '').toUpperCase()
  return h.length === 6 || h.length === 8 ? h : '000000'
}

export function toPickerColor(hex: string): string {
  const h = normalizeHexColor(hex)
  return `#${h.slice(0, 6)}`
}

export function fromPickerColor(color: string): string {
  return normalizeHexColor(color).slice(0, 6)
}
