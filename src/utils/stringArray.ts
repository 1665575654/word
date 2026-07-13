/** 将 AI/JSON 中可能出现的字符串或混合值规范为 string[] */
export function normalizeStringArray(val: unknown): string[] {
  if (val == null) return []
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof val === 'string') {
    return val
      .split(/[、,，;；\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function formatStringArray(val: unknown): string {
  return normalizeStringArray(val).join('、')
}

export function parseStringArray(text: string): string[] {
  return text
    .split(/[、,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}
