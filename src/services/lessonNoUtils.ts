import type { LessonMeta } from '@/types'

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

const GARDEN_PREFIX = '语文园地'

export function cnOrdinal(n: number): string {
  return CN_NUMS[n - 1] ?? String(n)
}

export function isGardenTitle(title: string): boolean {
  return /语文园地/.test(title.trim())
}

export function gardenTitleHasOrdinal(title: string): boolean {
  return /语文园地\s*[（(]?[一二三四五六七八九十\d]+[)）]?/.test(title.trim())
}

export function normalizeGardenTitleWithOrdinal(title: string): string {
  const t = title.trim()
  if (!isGardenTitle(t)) return t
  const m = t.match(/语文园地\s*[（(]?([一二三四五六七八九十\d]+)[)）]?/)
  if (m) return `语文园地${m[1]}`
  return t
}

/** 规范化单元类型标识：仅保留非空类型（阅读/识字/汉语拼音等） */
export function normalizeUnitLabel(value: unknown): string {
  const s = String(value ?? '')
    .trim()
    .replace(/^第[一二三四五六七八九十\d]+单元\s*[·•．.\-—–]?\s*/u, '')
    .replace(/^[·•．.\-—–\s]+/u, '')
    .trim()
  if (!s) return ''
  if (/^第?[一二三四五六七八九十\d]+单元$/.test(s)) return ''
  return s
}

/** 课文课次："1"、"阅读-1"；语文园地："语文园地-1"（兼容旧格式 "1.1"） */
export function formatIntegerLessonNo(n: number): string {
  return String(Math.floor(n))
}

export function formatGardenLessonNo(unitSeq: number): string {
  return `${GARDEN_PREFIX}-${Math.floor(unitSeq)}`
}

export function formatPrefixedLessonNo(unitLabel: string, printedNo: number): string {
  const label = normalizeUnitLabel(unitLabel)
  const n = Math.floor(printedNo)
  if (n <= 0) return ''
  return label ? `${label}-${n}` : formatIntegerLessonNo(n)
}

/**
 * 显示用课次标签：「识字-2」→「识字-第2课」；「2」→「第2课」。
 * 存储仍为 `识字-2` / `2`，仅展示时把「第…课」套在数字上，避免「第识字-2课」。
 */
export function formatLessonOrdinalLabel(lessonNo: unknown): string {
  const parts = parseLessonNoParts(lessonNo)
  if (!parts) {
    const s = String(lessonNo ?? '').trim()
    return s ? `第${s}课` : ''
  }
  if (parts.prefix) return `${parts.prefix}-第${parts.number}课`
  return `第${parts.number}课`
}

export interface LessonNoParts {
  prefix: string
  number: number
  isGarden: boolean
}

/** 统一各类横线为 ASCII `-`，便于解析 AI 返回的全角课次 */
function normalizeLessonNoDashes(s: string): string {
  return s.replace(/[－—–−﹣]/g, '-')
}

/** 解析课次各部分；兼容旧园地格式 N.1，以及「阅读－5」「阅读5」等变体 */
export function parseLessonNoParts(value: unknown): LessonNoParts | null {
  if (value === null || value === undefined) return null
  let s = normalizeLessonNoDashes(String(value).trim().replace(/[*＊]/g, ''))
  if (!s) return null

  const gardenPrefixed = s.match(/^语文园地-(\d+)$/)
  if (gardenPrefixed) {
    return { prefix: GARDEN_PREFIX, number: Number(gardenPrefixed[1]), isGarden: true }
  }

  const legacyGarden = s.match(/^(\d+)\.1$/)
  if (legacyGarden) {
    return { prefix: GARDEN_PREFIX, number: Number(legacyGarden[1]), isGarden: true }
  }

  // 「阅读-5」「识字-1」「汉语拼音-3」；也接受无横线「阅读5」
  const prefixed = s.match(/^([^\d]+?)-(\d+)$/) ?? s.match(/^([\u4e00-\u9fff]+?)(\d+)$/)
  if (prefixed) {
    const prefix = normalizeUnitLabel(prefixed[1].replace(/-+$/g, ''))
    const number = Number(prefixed[2])
    if (prefix && number > 0) {
      if (prefix === GARDEN_PREFIX) return { prefix, number, isGarden: true }
      return { prefix, number, isGarden: false }
    }
  }

  const num = Number(s)
  if (!Number.isNaN(num) && num > 0) {
    if (Number.isInteger(num)) return { prefix: '', number: num, isGarden: false }
    const parts = s.split('.')
    if (parts.length === 2 && parts[1] === '1') {
      return { prefix: GARDEN_PREFIX, number: Number(parts[0]), isGarden: true }
    }
    if (parts.length === 2 && /^0+$/.test(parts[1])) {
      return { prefix: '', number: Number(parts[0]), isGarden: false }
    }
  }

  const intMatch = s.match(/^(\d+)/)
  if (intMatch) return { prefix: '', number: Number(intMatch[1]), isGarden: false }
  return null
}

/** 将任意输入规范为 string 课次号 */
export function normalizeLessonNo(value: unknown): string {
  const parts = parseLessonNoParts(value)
  if (!parts) return ''
  if (parts.isGarden) return formatGardenLessonNo(parts.number)
  return formatPrefixedLessonNo(parts.prefix, parts.number)
}

export function isValidLessonNo(value: unknown): boolean {
  return normalizeLessonNo(value).length > 0
}

export function isGardenLessonNo(lessonNo: string): boolean {
  const parts = parseLessonNoParts(lessonNo)
  return Boolean(parts?.isGarden)
}

export function compareLessonNo(a: string, b: string): number {
  const pa = parseLessonNoParts(a)
  const pb = parseLessonNoParts(b)
  if (!pa || !pb) {
    return normalizeLessonNo(a).localeCompare(normalizeLessonNo(b), 'zh')
  }

  // 无前缀纯数字课次：按数字排；园地排在同序号课文后
  if (!pa.prefix && !pb.prefix) {
    if (pa.number !== pb.number) return pa.number - pb.number
    if (pa.isGarden !== pb.isGarden) return pa.isGarden ? 1 : -1
    return 0
  }

  // 有前缀时：先比前缀，再比数字；同前缀下园地靠后
  const prefixCmp = pa.prefix.localeCompare(pb.prefix, 'zh')
  if (prefixCmp !== 0) {
    if (!pa.prefix) return -1
    if (!pb.prefix) return 1
    return prefixCmp
  }
  if (pa.number !== pb.number) return pa.number - pb.number
  if (pa.isGarden !== pb.isGarden) return pa.isGarden ? 1 : -1
  return 0
}

export function sortByLessonNo<T extends { lessonNo: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareLessonNo(a.lessonNo, b.lessonNo))
}

/** 目录合并续编时的数值（语文园地-1 → 1.1，阅读-2 → 2） */
export function lessonNoToMergeValue(lessonNo: string): number {
  const parts = parseLessonNoParts(lessonNo)
  if (!parts) return 0
  if (parts.isGarden) return parts.number + 0.1
  return parts.number
}

export function mergeValueToLessonNo(value: number, prefix = ''): string {
  const int = Math.floor(value)
  if (Math.abs(value - int - 0.1) < 0.001) return formatGardenLessonNo(int)
  return formatPrefixedLessonNo(prefix, int)
}

export function shiftLessonNoForMerge(
  lessonNo: string,
  maxExisting: number,
  minIncoming: number
): string {
  const parts = parseLessonNoParts(lessonNo)
  const value = lessonNoToMergeValue(lessonNo)
  const shifted = maxExisting + (value - minIncoming + 1)
  if (!parts) return mergeValueToLessonNo(shifted)
  if (parts.isGarden) return formatGardenLessonNo(Math.floor(shifted))
  return formatPrefixedLessonNo(parts.prefix, Math.floor(shifted))
}

export interface RawCatalogRow {
  index?: number
  lessonNo?: number | string
  title?: string
  /** 单元类型标识：阅读 / 识字 / 汉语拼音 等；仅「第N单元」时为空 */
  unitLabel?: string
  /** 目录页码，用于升序排列 */
  page?: number | string
}

export function parsePrintedLessonNo(value: unknown): number {
  const parts = parseLessonNoParts(value)
  return parts?.number ?? 0
}

export function splitLessonNoFromTitle(title: string): { lessonNo: number; title: string } {
  const t = title.trim()
  const withTitle = t.match(/^(\d+)[*＊]?\s+(.+)$/)
  if (withTitle) {
    return { lessonNo: Number(withTitle[1]), title: withTitle[2].trim() }
  }
  const numOnly = t.match(/^(\d+)[*＊]?$/)
  if (numOnly) return { lessonNo: Number(numOnly[1]), title: '' }
  return { lessonNo: 0, title: t }
}

/** 从 AI 分组字段提取图片上的印刷序号（优先 lessonNo，其次 title 前缀数字） */
export function resolveGroupedPrintedNo(raw: {
  lessonNo?: number | string
  title?: string
}): { printedNo: number; title: string } {
  let title = String(raw.title ?? '').trim()
  let printed = parsePrintedLessonNo(raw.lessonNo)

  const fromTitle = splitLessonNoFromTitle(title)
  if (fromTitle.lessonNo > 0) {
    if (printed === 0) printed = fromTitle.lessonNo
    if (fromTitle.title) title = fromTitle.title
  }

  return { printedNo: printed, title }
}

/** OCR 将相邻两行课次合并为一个数字（如上一课 2、本行识别为 23 实为 2+3） */
export function looksLikeMergedPrintedNo(
  prevPrintedNo: number,
  ocrPrinted: number,
  expected: number
): boolean {
  if (ocrPrinted < 10 || prevPrintedNo <= 0) return false
  const prevStr = String(prevPrintedNo)
  const ocrStr = String(ocrPrinted)
  if (!ocrStr.startsWith(prevStr)) return false
  const remainder = ocrStr.slice(prevStr.length)
  if (!remainder) return false
  const next = parseInt(remainder, 10)
  return !Number.isNaN(next) && next === expected
}

/**
 * 结合 OCR 识别值与上下文，推断表内印刷序号。
 * 印刷序号只计课文、不计语文园地。跳号（如 2 后直接 5）表示书中该课无字词，应信任图片上的数字。
 * 仅当识别值像相邻行合并（如 2+3→23）时，才按「上一课 + 1」顺序推断。
 */
export function inferSequentialPrintedNo(prevPrintedNo: number, ocrPrinted: number): number {
  const expected = prevPrintedNo <= 0 ? 1 : prevPrintedNo + 1
  if (ocrPrinted <= 0) return expected
  if (ocrPrinted === expected) return ocrPrinted
  if (looksLikeMergedPrintedNo(prevPrintedNo, ocrPrinted, expected)) return expected
  if (ocrPrinted > prevPrintedNo) return ocrPrinted
  return expected
}

export function resolveCatalogRowLessonNo(raw: RawCatalogRow): {
  lessonNo: string
  title: string
  unitLabel: string
  page: number
} {
  let title = String(raw.title ?? '').trim()
  const existingParts = parseLessonNoParts(raw.lessonNo)
  let printed = existingParts?.number ?? 0
  // 优先用显式 unitLabel；否则沿用已带前缀的 lessonNo
  let unitLabel =
    normalizeUnitLabel(raw.unitLabel) ||
    (!existingParts?.isGarden ? existingParts?.prefix ?? '' : '')
  const page = Math.max(0, Math.floor(Number(raw.page) || 0))

  // lessonNo 解析失败时，尝试从原始字符串末尾取数字（如「课5」「No.5」）
  if (printed <= 0 && raw.lessonNo != null && String(raw.lessonNo).trim()) {
    const tail = String(raw.lessonNo).trim().match(/(\d+)\s*$/)
    if (tail) printed = Number(tail[1])
  }

  const fromTitle = splitLessonNoFromTitle(title)
  if (fromTitle.lessonNo > 0) {
    // 标题前缀数字仅在 lessonNo 缺失时补用，避免覆盖已识别的印刷序号
    if (printed <= 0) printed = fromTitle.lessonNo
    if (fromTitle.title) title = fromTitle.title
  }

  if (isGardenTitle(title) || existingParts?.isGarden) {
    return { lessonNo: '', title, unitLabel, page }
  }

  return {
    lessonNo: printed > 0 ? formatPrefixedLessonNo(unitLabel, printed) : '',
    title,
    unitLabel,
    page,
  }
}

type CatalogSortable = LessonMeta & { page?: number }

/**
 * 按页码升序排列目录；无页码时保持识别顺序。
 * 允许不同单元 lessonNo 印刷序号重复，不再按课次数字重排。
 */
export function reorderCatalogLessons(lessons: CatalogSortable[]): LessonMeta[] {
  if (lessons.length <= 1) return reindexLessons(lessons)

  const withPage = lessons.filter((l) => (l.page ?? 0) > 0)
  if (withPage.length === lessons.length) {
    const sorted = [...lessons].sort((a, b) => {
      const pageDiff = (a.page ?? 0) - (b.page ?? 0)
      if (pageDiff !== 0) return pageDiff
      return (a.index || 0) - (b.index || 0)
    })
    return reindexLessons(sorted.map(({ page: _page, ...l }) => l))
  }

  // 无完整页码时保持输入顺序（提示词已要求左栏→右栏、页码升序）
  return reindexLessons(lessons.map(({ page: _page, ...l }) => l))
}

export function finalizeCatalogLessons(
  raw: RawCatalogRow[],
  options: { initialGardenSeq?: number } = {}
): LessonMeta[] {
  let gardenSeq = options.initialGardenSeq ?? 0
  const items: CatalogSortable[] = []

  for (const item of raw) {
    const resolved = resolveCatalogRowLessonNo(item)
    const rawTitle = resolved.title
    if (!rawTitle && !isGardenTitle(String(item.title ?? ''))) continue

    const index = Number(item.index) || items.length + 1
    const titleText = rawTitle || String(item.title ?? '').trim()
    const garden = isGardenTitle(titleText)
    const page = resolved.page

    if (garden) {
      const hasTitleOrdinal = gardenTitleHasOrdinal(titleText)
      gardenSeq++
      items.push({
        index,
        lessonNo: formatGardenLessonNo(gardenSeq),
        title: hasTitleOrdinal
          ? normalizeGardenTitleWithOrdinal(titleText)
          : `语文园地${cnOrdinal(gardenSeq)}`,
        page,
      })
      continue
    }

    if (!resolved.lessonNo) continue
    items.push({ index, lessonNo: resolved.lessonNo, title: rawTitle, page })
  }

  return reorderCatalogLessons(items)
}

export function reindexLessons(lessons: LessonMeta[]): LessonMeta[] {
  return lessons.map((l, i) => ({ ...l, index: i + 1 }))
}

export function nthGardenLesson(catalog: LessonMeta[], n: number): LessonMeta | undefined {
  const gardens = catalog
    .filter((l) => isGardenTitle(l.title))
    .sort((a, b) => a.index - b.index)
  return gardens[n - 1]
}

export function nthNonGardenLesson(catalog: LessonMeta[], n: number): string {
  if (n <= 0) return formatIntegerLessonNo(n)
  let count = 0
  const sorted = [...catalog].sort((a, b) => a.index - b.index)
  for (const lesson of sorted) {
    if (isGardenTitle(lesson.title)) continue
    count++
    if (count === n) return normalizeLessonNo(lesson.lessonNo)
  }
  return formatIntegerLessonNo(n)
}

/** 在目录中精确匹配课次号（如「阅读-5」）；找不到返回空串 */
export function findCatalogLessonNoExact(
  catalog: LessonMeta[],
  lessonNo: string
): string {
  const target = normalizeLessonNo(lessonNo)
  if (!isValidLessonNo(target) || catalog.length === 0) return ''
  const hit = [...catalog]
    .sort((a, b) => a.index - b.index)
    .find((l) => normalizeLessonNo(l.lessonNo) === target)
  return hit ? normalizeLessonNo(hit.lessonNo) : ''
}

/** 跨图续行：取已有数据中最后一课课次号（按存储顺序，非课次号最大值） */
export function getLastLessonNoFromItems(
  items: Array<{ lessonNo: string; char?: string; word?: string }>,
  isSlot: (text: string) => boolean
): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    const text = String(item.char ?? item.word ?? '').trim()
    if (text.length > 0 && !isSlot(text) && isValidLessonNo(item.lessonNo)) {
      return normalizeLessonNo(item.lessonNo)
    }
  }
  return ''
}

/** 为缺少课次号的续行项补上上一张图最后一课或同行上文课次 */
export function applyContinuationLessonNo<T extends { lessonNo: string }>(
  items: T[],
  lastLessonNo?: string
): T[] {
  const last = normalizeLessonNo(lastLessonNo ?? '')
  let current = isValidLessonNo(last) ? last : ''
  const result: T[] = []

  for (const item of items) {
    const no = normalizeLessonNo(item.lessonNo)
    if (isValidLessonNo(no)) {
      current = no
      result.push({ ...item, lessonNo: no })
    } else if (isValidLessonNo(current)) {
      result.push({ ...item, lessonNo: current })
    }
  }
  return result
}
