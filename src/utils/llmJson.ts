/** 将 LLM 常见的中文/弯引号标点替换为合法 JSON 标点 */
const FULLWIDTH_TO_ASCII: Record<string, string> = {
  '，': ',',
  '：': ':',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '\u201c': '"',
  '\u201d': '"',
  '\u2018': "'",
  '\u2019': "'",
}

/** 模型偶发用中文字段名，映射回约定英文字段 */
const KEY_ALIASES: Record<string, string> = {
  字: 'char',
  拼音: 'pinyin',
  部首: 'radical',
  结构: 'structure',
  组词: 'words',
  造句: 'sentences',
  读音: 'readings',
  词语: 'word',
  拓展组词: 'relatedWords',
  相关词语: 'relatedWords',
}

export function sanitizeLLMJsonText(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, '')

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()

  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  const startCandidates = [objStart, arrStart].filter((i) => i >= 0)
  if (startCandidates.length > 0) {
    const start = Math.min(...startCandidates)
    const endObj = s.lastIndexOf('}')
    const endArr = s.lastIndexOf(']')
    const end = Math.max(endObj, endArr)
    if (end > start) s = s.slice(start, end + 1)
  }

  return s.replace(/[，：【】「」『』\u201c\u201d\u2018\u2019]/g, (ch) => FULLWIDTH_TO_ASCII[ch] ?? ch)
}

export function normalizeLLMJsonKeys<T>(value: T): T {
  return normalizeKeysDeep(value) as T
}

function normalizeKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeysDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const mapped = KEY_ALIASES[key] ?? key
      out[mapped] = normalizeKeysDeep(child)
    }
    return out
  }
  return value
}

export function parseLLMJson<T>(content: string): T {
  const sanitized = sanitizeLLMJsonText(content)
  try {
    return normalizeLLMJsonKeys(JSON.parse(sanitized) as T)
  } catch {
    throw new Error('AI 返回的内容不是有效 JSON')
  }
}
