import { LESSON_SLOT_CHAR, LESSON_SLOT_WORD } from '@/services/dataMerger'

import type { CharacterItem, LessonMeta, WordItem } from '@/types'
import {
  formatGardenLessonNo,
  formatIntegerLessonNo,
  formatPrefixedLessonNo,
  findCatalogLessonNoExact,
  inferSequentialPrintedNo,
  isGardenTitle,
  isValidLessonNo,
  normalizeLessonNo,
  normalizeUnitLabel,
  nthNonGardenLesson,
  parseLessonNoParts,
  resolveGroupedPrintedNo,
} from '@/services/lessonNoUtils'



interface ParsedRow {

  kind: 'numbered' | 'garden' | 'continuation'

  lessonNo?: number

  items: string[]

  /** 同一行中、出现在「语文园地」标签之前的生字，应归入上一课 */
  prevLessonItems?: string[]

}



export type TableParseKind = 'writing' | 'reading' | 'vocabulary'

export interface TableParseContext {

  /** 上一张图最后一课的目录课次号，用于本图开头无序号续行 */

  lastLessonNo?: string

  /** 表类型：仅写字表启用「两课之间的无序号行 → 语文园地」推断 */

  kind?: TableParseKind

}



const GARDEN_LABEL_RE = /语\s*文\s*园\s*地|(?<![\u4e00-\u9fff])园地/

const FOOTER_RE = /共\s*\d+\s*个[字詞词]|写字表|识字表|词语表/

/** 编辑界面 / OCR 常见 UI 噪声行 */
const UI_NOISE_LINE_RE = /^(索引|课次)\s*\d|^[+＋]\s*添|添加$|^第\s*\d+(\.\d+)?\s*课/

const GARDEN_TITLE_STRIP_RE =
  /语\s*文\s*园\s*地\s*[（(]?[一二三四五六七八九十\d]+[)）]?|园地\s*[（(]?[一二三四五六七八九十\d]+[)）]?/



/** 按 OCR 行顺序提取汉字，保留图片从左到右的顺序 */

export function extractHanCharsInOrder(text: string): string[] {

  const chars: string[] = []

  for (const ch of text) {

    if (/[\u4e00-\u9fff]/.test(ch)) chars.push(ch)

  }

  return chars

}



/** 从词语表行提取词语（按空格分隔，仅保留完整词语） */

export function extractWordsFromLine(text: string): string[] {

  return text

    .split(/\s+/)

    .map((w) => w.trim().replace(/[^\u4e00-\u9fff]/g, ''))

    .filter((w) => w.length >= 2)

}



/** OCR 按单字加空格时，规则解析会把词语拆成单字 */

export function isLikelyPerCharWordSplit(words: Array<{ word: string }>): boolean {

  const real = words

    .map((w) => String(w.word ?? '').trim())

    .filter((w) => w.length > 0 && w !== LESSON_SLOT_WORD)

  if (real.length < 3) return false

  const singleCount = real.filter((w) => w.length === 1).length

  return singleCount / real.length >= 0.65

}



export function isGardenCatalogTitle(title: string): boolean {
  return isGardenTitle(title)
}

function sortedCatalog(catalog: LessonMeta[]): LessonMeta[] {
  return [...catalog].sort((a, b) => a.index - b.index)
}



/**

 * 生字表印刷序号 = 目录中第 N 个「非语文园地」课次。

 * 例：目录 1、2、3、语文园地(4)、课文(5)… → 印刷「4」对应目录第 5 课。

 */

/**
 * 根据上一张图末尾课次，初始化跨图续传的解析状态。
 * 末尾为语文园地时，prevPrintedNo 取园地前最后一个非园地课的印刷序号（而非全部非园地课总数）。
 */
export function inferParseStateFromLastLesson(
  lastLessonNo: string,
  catalog: LessonMeta[]
): {
  prevPrintedNo: number
  gardensSeen: number
  usedGardenNos: Set<string>
} {
  const target = normalizeLessonNo(lastLessonNo)
  if (!isValidLessonNo(target) || catalog.length === 0) {
    return { prevPrintedNo: 0, gardensSeen: 0, usedGardenNos: new Set() }
  }

  let prevPrintedNo = 0
  let gardensSeen = 0
  const usedGardenNos = new Set<string>()

  for (const lesson of sortedCatalog(catalog)) {
    const no = normalizeLessonNo(lesson.lessonNo)
    if (no === target) {
      if (isGardenCatalogTitle(lesson.title)) {
        usedGardenNos.add(no)
      }
      return { prevPrintedNo, gardensSeen, usedGardenNos }
    }
    if (isGardenCatalogTitle(lesson.title)) {
      gardensSeen++
      usedGardenNos.add(no)
    } else {
      prevPrintedNo++
    }
  }

  return { prevPrintedNo, gardensSeen, usedGardenNos }
}

/** 由目录课次号反推生字表印刷序号（不含语文园地占用的目录课次） */
export function inferPrintedNoFromCatalogLesson(
  catalogLessonNo: string,
  catalog: LessonMeta[]
): number {
  return inferParseStateFromLastLesson(catalogLessonNo, catalog).prevPrintedNo
}

export function mapPrintedLessonNoToCatalog(printedNo: number, catalog: LessonMeta[]): string {
  if (printedNo <= 0) return formatIntegerLessonNo(printedNo)
  if (catalog.length === 0) return formatIntegerLessonNo(printedNo)

  const target = formatIntegerLessonNo(printedNo)
  const direct = [...catalog]
    .sort((a, b) => a.index - b.index)
    .find((l) => !isGardenCatalogTitle(l.title) && normalizeLessonNo(l.lessonNo) === target)
  if (direct) return normalizeLessonNo(direct.lessonNo)

  return nthNonGardenLesson(catalog, printedNo)
}



/**

 * 生字表印刷序号不含「语文园地」占用的目录课次。

 * 有目录时：印刷 N → 目录中第 N 个非语文园地课次；无目录时沿用 gardensSeen 偏移。

 */

export function mapNumberedLessonNo(
  printedNo: number,
  gardensSeen: number,
  catalog: LessonMeta[]
): string {
  if (printedNo <= 0) return formatIntegerLessonNo(printedNo)
  if (catalog.length > 0) {
    return mapPrintedLessonNoToCatalog(printedNo, catalog)
  }
  return formatIntegerLessonNo(printedNo + gardensSeen)
}

/** 有 unitLabel 时拼前缀课次并优先精确匹配目录；否则回退印刷序号映射 */
export function mapPrintedWithUnitLabel(
  printedNo: number,
  unitLabel: string,
  gardensSeen: number,
  catalog: LessonMeta[]
): string {
  const label = normalizeUnitLabel(unitLabel)
  if (label && printedNo > 0) {
    const prefixed = formatPrefixedLessonNo(label, printedNo)
    if (catalog.length > 0) {
      const exact = findCatalogLessonNoExact(catalog, prefixed)
      if (exact) return exact
    }
    return prefixed
  }
  return mapNumberedLessonNo(printedNo, gardensSeen, catalog)
}



function isTableTitleLine(line: string): boolean {

  return /写字表|识字表|词语表/.test(line)

}



function isPageNumberLine(line: string): boolean {

  return /^\d{1,3}$/.test(line.trim())

}

function isTableUiNoiseLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (UI_NOISE_LINE_RE.test(t)) return true
  if (/^索引\s+\d+/.test(t) && extractHanCharsInOrder(t).length <= 4) return true
  return false
}



function isGardenLabelLine(line: string): boolean {

  if (FOOTER_RE.test(line)) return false

  if (GARDEN_LABEL_RE.test(line)) return true

  if (/园地/.test(line) && !/^\d+\s/.test(line)) return true

  if (/^[^0-9\u4e00-\u9fff]{1,16}[\u4e00-\u9fff]/.test(line) && !/^\d+\s/.test(line)) {

    const chars = extractHanCharsInOrder(line)

    if (chars.length >= 1 && chars.length <= 20) return true

  }

  return false

}



function lineHasGardenLabel(line: string): boolean {
  return GARDEN_LABEL_RE.test(line) || (/园地/.test(line) && !/^\d+\s/.test(line))
}

/** 按「语文园地」标签位置拆行：标签前 → 上一课续行，标签后 → 园地生字 */
function splitLineAtGardenLabel(line: string): {
  beforeLabel: string
  afterLabel: string
} {
  const re =
    /语\s*文\s*园\s*地\s*[（(]?[一二三四五六七八九十\d]*[)）]?|(?<![\u4e00-\u9fff])园地\s*[（(]?[一二三四五六七八九十\d]*[)）]?/
  const m = line.match(re)
  if (!m || m.index === undefined) {
    return { beforeLabel: '', afterLabel: stripGardenLabel(line) }
  }
  return {
    beforeLabel: line.slice(0, m.index).trim(),
    afterLabel: line
      .slice(m.index + m[0].length)
      .replace(/^[一二三四五六七八九十\d]+/, '')
      .trim(),
  }
}

function stripGardenLabel(line: string): string {
  return line
    .replace(new RegExp(`.*${GARDEN_TITLE_STRIP_RE.source}`), '')
    .replace(/^[^0-9\u4e00-\u9fff]{1,16}/, '')
    .replace(/^[一二三四五六七八九十\d]+/, '')
    .trim()
}

/** 从课次行剩余文本中剥离目录课文标题，避免标题汉字混入生字 */
function stripKnownLessonTitle(
  rest: string,
  catalogLessons: LessonMeta[],
  printedNo: number
): string {
  let text = rest.trim()
  if (catalogLessons.length > 0 && printedNo > 0) {
    const lessonNo = nthNonGardenLesson(catalogLessons, printedNo)
    const meta = catalogLessons.find((l) => normalizeLessonNo(l.lessonNo) === lessonNo)
    const title = meta?.title?.trim()
    if (title && title.length >= 2) {
      const titleChars = extractHanCharsInOrder(title)
      const restChars = extractHanCharsInOrder(text)
      if (
        restChars.length > titleChars.length &&
        titleChars.every((ch, i) => restChars[i] === ch)
      ) {
        text = restChars.slice(titleChars.length).join('')
      }
    }
  }
  return text.replace(GARDEN_TITLE_STRIP_RE, '').trim()
}



function parseTableRow(
  line: string,
  extractItems: (text: string) => string[],
  catalogLessons: LessonMeta[] = []
): ParsedRow | null {
  const numbered = line.match(/^(\d+)[*＊]?\s*(.+)$/)

  if (numbered) {
    const printedNo = Number(numbered[1])
    const rest = stripKnownLessonTitle(numbered[2].trim(), catalogLessons, printedNo)
    if (!rest) return null
    const items = extractItems(rest)
    if (items.length === 0) return null
    return { kind: 'numbered', lessonNo: printedNo, items }
  }

  if (isGardenLabelLine(line)) {
    const { beforeLabel, afterLabel } = splitLineAtGardenLabel(line)
    const prevLessonItems = beforeLabel ? extractItems(beforeLabel) : []
    const items = extractItems(afterLabel || stripGardenLabel(line))
    return {
      kind: 'garden',
      items,
      prevLessonItems: prevLessonItems.length > 0 ? prevLessonItems : undefined,
    }
  }

  return null
}



/** 无课次号的续行：仍属于上一课 */

function tryParseContinuationLine(

  line: string,

  extractItems: (text: string) => string[]

): ParsedRow | null {

  if (/^\d/.test(line)) return null

  if (FOOTER_RE.test(line)) return null

  if (isGardenLabelLine(line)) return null

  const items = extractItems(line)

  if (items.length === 0) return null

  return { kind: 'continuation', items }

}



/** 课次号独占一行、词语/生字在下一行（OCR 常见） */

function tryParseStandaloneLessonRow(

  line: string,

  lines: string[],

  lineIndex: number,

  extractItems: (text: string) => string[]

): (ParsedRow & { consumesNextLine?: boolean }) | null {

  const m = line.match(/^(\d+)[*＊]?$/)

  if (!m) return null

  const lessonNo = Number(m[1])

  if (lessonNo > 99) return null

  const next = lines[lineIndex + 1]?.trim()

  if (!next) return null

  if (/^\d+[*＊]?(\s|$)/.test(next)) return null

  if (isTableTitleLine(next) || FOOTER_RE.test(next) || isGardenLabelLine(next)) return null

  const items = extractItems(next)

  if (items.length === 0) return null

  return { kind: 'numbered', lessonNo, items, consumesNextLine: true }

}



/** 从分组 title 中提取可能被 AI 误放到标题里的首词/首字（非语文园地） */

export function extractLeadingItemsFromTitle(
  title: string,
  extractItems: (text: string) => string[]
): string[] {
  const t = title.trim()
  if (!t || isGardenCatalogTitle(t)) return []
  const items = extractItems(t)
  // 仅当 AI 误将单个首字/首词放入 title 时才补入；多字视为课文标题
  if (items.length === 1) return items
  return []
}



export function mergeTitleAndListItems(

  title: string,

  listItems: string[],

  extractItems: (text: string) => string[]

): string[] {

  const fromTitle = extractLeadingItemsFromTitle(title, extractItems)

  if (fromTitle.length === 0) return listItems

  const seen = new Set<string>()

  const merged: string[] = []

  for (const item of [...fromTitle, ...listItems]) {

    if (seen.has(item)) continue

    seen.add(item)

    merged.push(item)

  }

  return merged

}



/** 无课次号、无园地标签，但夹在两个数字课次之间的短行 → 视为语文园地生字行 */

function tryParseOrphanGardenLine(

  line: string,

  extractItems: (text: string) => string[]

): ParsedRow | null {

  if (/^\d/.test(line)) return null

  if (FOOTER_RE.test(line)) return null

  const items = extractItems(line)

  if (items.length < 1 || items.length > 20) return null

  return { kind: 'garden', items }

}



export function pickGardenLessonNo(
  catalog: LessonMeta[],
  mappedPrevNo: string,
  mappedNextNo: string | null,
  usedGardenNos: Set<string>
): string {
  const prev = normalizeLessonNo(mappedPrevNo)
  const next = mappedNextNo ? normalizeLessonNo(mappedNextNo) : null
  if (!isValidLessonNo(prev)) return ''

  const sorted = [...catalog].sort((a, b) => a.index - b.index)
  const prevIdx = sorted.findIndex((l) => normalizeLessonNo(l.lessonNo) === prev)
  if (prevIdx < 0) return ''

  let nextIdx = sorted.length
  if (next) {
    const idx = sorted.findIndex((l) => normalizeLessonNo(l.lessonNo) === next)
    if (idx >= 0) nextIdx = idx
  }

  // 园地课次号（如 语文园地-1）按目录 index 判断是否在前后课文之间，不能用印刷序号数值比较
  const inRange = sorted.filter((l, i) => {
    const no = normalizeLessonNo(l.lessonNo)
    return (
      i > prevIdx &&
      i < nextIdx &&
      isGardenCatalogTitle(l.title) &&
      !usedGardenNos.has(no)
    )
  })

  if (inRange.length > 0) return normalizeLessonNo(inRange[0].lessonNo)

  if (catalog.some((l) => isGardenCatalogTitle(l.title))) return ''

  const gardenSeq = usedGardenNos.size + 1
  return formatGardenLessonNo(gardenSeq)
}



function peekNextNumberedLessonNo(lines: string[], fromIndex: number): number | null {

  for (let i = fromIndex + 1; i < lines.length; i++) {

    const m = lines[i].match(/^(\d+)[*＊]?\s+/)

    if (m) return Number(m[1])

  }

  return null

}



function createParseState(catalogLessons: LessonMeta[], context: TableParseContext = {}) {
  const lastLessonNo = normalizeLessonNo(context.lastLessonNo ?? '')
  const initialized = isValidLessonNo(lastLessonNo)
    ? inferParseStateFromLastLesson(lastLessonNo, catalogLessons)
    : { prevPrintedNo: 0, gardensSeen: 0, usedGardenNos: new Set<string>() }
  // 跨图续传：本图首组无印刷序号且非语文园地时，归入上一张末尾课次（园地或课文均可）
  // 印刷序号按单元分轨：阅读/识字各自从 1 重计，不能共用全书递增 prevPrintedNo
  const prevPrintedByUnit = new Map<string, number>()
  let currentUnitLabel = ''
  const lastParts = parseLessonNoParts(lastLessonNo)
  if (lastParts && !lastParts.isGarden && lastParts.prefix) {
    currentUnitLabel = lastParts.prefix
    prevPrintedByUnit.set(lastParts.prefix, lastParts.number)
  }
  return {
    gardensSeen: initialized.gardensSeen,
    groupIndex: 0,
    prevPrintedNo: initialized.prevPrintedNo,
    prevPrintedByUnit,
    currentMappedLessonNo: lastLessonNo,
    currentUnitLabel,
    usedGardenNos: initialized.usedGardenNos,
  }
}

/** 取某单元内上一课印刷序号（无则 0）；无单元标识时回退全书 prevPrintedNo */
function prevPrintedForUnit(
  state: ReturnType<typeof createParseState>,
  unitLabel: string
): number {
  const label = normalizeUnitLabel(unitLabel)
  if (!label || isGardenTitle(label)) return state.prevPrintedNo
  return state.prevPrintedByUnit.get(label) ?? 0
}

function rememberPrintedForUnit(
  state: ReturnType<typeof createParseState>,
  unitLabel: string,
  printedNo: number
): void {
  state.prevPrintedNo = printedNo
  const label = normalizeUnitLabel(unitLabel)
  if (label && !isGardenTitle(label) && printedNo > 0) {
    state.prevPrintedByUnit.set(label, printedNo)
  }
}

function resolveRow<T extends { lessonNo: string }>(
  row: ParsedRow,
  lines: string[],
  lineIndex: number,
  catalogLessons: LessonMeta[],
  state: ReturnType<typeof createParseState>,
  toItem: (text: string, lessonNo: string, index: number) => T,
  slotItem: (lessonNo: string, index: number) => T
): T[] {
  const items: T[] = []

  if (row.kind === 'numbered' && row.lessonNo) {
    state.groupIndex++
    const printedNo = inferSequentialPrintedNo(state.prevPrintedNo, row.lessonNo)
    const lessonNo = mapNumberedLessonNo(printedNo, state.gardensSeen, catalogLessons)
    state.prevPrintedNo = printedNo
    state.currentMappedLessonNo = lessonNo
    for (const text of row.items) items.push(toItem(text, lessonNo, state.groupIndex))
    return items
  }

  if (row.kind === 'continuation') {
    const lessonNo = state.currentMappedLessonNo
    if (!isValidLessonNo(lessonNo)) return []
    for (const text of row.items) items.push(toItem(text, lessonNo, state.groupIndex))
    return items
  }

  if (row.kind === 'garden') {
    if (row.prevLessonItems?.length && isValidLessonNo(state.currentMappedLessonNo)) {
      for (const text of row.prevLessonItems) {
        items.push(toItem(text, state.currentMappedLessonNo, state.groupIndex))
      }
    }

    state.groupIndex++

    const nextPrinted = peekNextNumberedLessonNo(lines, lineIndex)

    const mappedPrev = mapNumberedLessonNo(state.prevPrintedNo, state.gardensSeen, catalogLessons)

    const mappedNext =
      nextPrinted !== null
        ? mapNumberedLessonNo(
            inferSequentialPrintedNo(state.prevPrintedNo, nextPrinted),
            state.gardensSeen,
            catalogLessons
          )
        : null

    const lessonNo = pickGardenLessonNo(catalogLessons, mappedPrev, mappedNext, state.usedGardenNos)

    if (!isValidLessonNo(lessonNo)) {
      return items
    }

    state.usedGardenNos.add(normalizeLessonNo(lessonNo))

    state.gardensSeen++

    state.currentMappedLessonNo = lessonNo



    if (row.items.length === 0) {
      items.push(slotItem(lessonNo, state.groupIndex))
    } else {
      for (const text of row.items) items.push(toItem(text, lessonNo, state.groupIndex))
    }
  }



  return items

}



function parseTableFromOcrText<T extends { lessonNo: string }>(
  ocrText: string,
  catalogLessons: LessonMeta[],
  context: TableParseContext,
  extractItems: (text: string) => string[],
  toItem: (text: string, lessonNo: string, index: number) => T,
  slotItem: (lessonNo: string, index: number) => T
): T[] | null {

  const lines = ocrText

    .split(/\r?\n/)

    .map((l) => l.trim())

    .filter(Boolean)



  const items: T[] = []

  const state = createParseState(catalogLessons, context)

  let matchedRows = 0



  for (let i = 0; i < lines.length; i++) {

    const line = lines[i]

    if (isTableTitleLine(line)) continue
    if (isTableUiNoiseLine(line)) continue

    let row: ParsedRow | null = null

    let consumesNextLine = false

    const preferContinuation =
      isValidLessonNo(state.currentMappedLessonNo) &&
      (context.kind === 'vocabulary' || context.kind === 'reading')

    if (preferContinuation && !lineHasGardenLabel(line)) {
      row = tryParseContinuationLine(line, extractItems)
    }

    if (!row) {
      row = parseTableRow(line, extractItems, catalogLessons)
    }

    if (!row) {

      const standalone = tryParseStandaloneLessonRow(line, lines, i, extractItems)

      if (standalone) {

        row = standalone

        consumesNextLine = !!standalone.consumesNextLine

      }

    }

    if (!row && isValidLessonNo(state.currentMappedLessonNo)) {

      row = tryParseContinuationLine(line, extractItems)

    }

    if (!row && isPageNumberLine(line)) continue

    if (
      !row &&
      context.kind !== 'reading' &&
      context.kind !== 'vocabulary' &&
      catalogLessons.length === 0 &&
      state.prevPrintedNo > 0 &&
      peekNextNumberedLessonNo(lines, i) !== null
    ) {
      row = tryParseOrphanGardenLine(line, extractItems)
    }

    if (!row) continue



    items.push(...resolveRow(row, lines, i, catalogLessons, state, toItem, slotItem))

    matchedRows++

    if (consumesNextLine) i++

  }



  return matchedRows >= 1 ? items : null

}

function findPrevTextLesson(catalog: LessonMeta[], garden: LessonMeta): LessonMeta | null {
  const sorted = [...catalog].sort((a, b) => a.index - b.index)
  const idx = sorted.findIndex((l) => normalizeLessonNo(l.lessonNo) === normalizeLessonNo(garden.lessonNo))
  if (idx <= 0) return null
  for (let i = idx - 1; i >= 0; i--) {
    if (!isGardenCatalogTitle(sorted[i].title)) return sorted[i]
  }
  return null
}

function findGardenLabelEnd(compact: string, title: string): number {
  const ordinalMatch = title.match(/语文园地\s*([一二三四五六七八九十\d]+)/)
  const candidates: string[] = []
  if (ordinalMatch) {
    candidates.push(`语文园地${ordinalMatch[1]}`, `语文园地（${ordinalMatch[1]}）`)
  }
  candidates.push('语文园地')
  for (const label of candidates) {
    const pos = compact.indexOf(label.replace(/\s/g, ''))
    if (pos >= 0) return pos + label.replace(/\s/g, '').length
  }
  const m = compact.match(/语文园地[一二三四五六七八九十\d]*/)
  if (m && m.index !== undefined) return m.index + m[0].length
  return -1
}

/** 在 OCR 中找园地生字真正开始的下标：前缀字均在标签前，后缀在标签后顺序匹配 */
function findGardenSequenceStart(
  compact: string,
  labelEnd: number,
  groupChars: string[]
): number {
  if (groupChars.length === 0) return 0
  let bestStart = 0
  for (let startGi = 0; startGi < groupChars.length; startGi++) {
    const prefix = groupChars.slice(0, startGi)
    if (
      prefix.length > 0 &&
      !prefix.every((ch) => {
        const pos = compact.indexOf(ch)
        return pos >= 0 && pos < labelEnd
      })
    ) {
      continue
    }
    let pos = labelEnd
    let matched = true
    for (let gi = startGi; gi < groupChars.length; gi++) {
      const found = compact.indexOf(groupChars[gi], pos)
      if (found < labelEnd) {
        matched = false
        break
      }
      pos = found + 1
    }
    if (matched) bestStart = startGi
  }
  return bestStart
}

/**
 * 修正语文园地课次中误并入的上一课续行生字（如「话由地」）。
 * 依据 OCR 文本中「语文园地」标签后的顺序匹配，将标签后、真正园地生字之前的字移回上一课。
 */
export function fixGardenCharBleed(
  chars: CharacterItem[],
  ocrText: string,
  catalogLessons: LessonMeta[]
): CharacterItem[] {
  if (!ocrText.trim() || catalogLessons.length === 0) return chars

  const compact = ocrText.replace(/\s/g, '')
  const result = chars.map((item) => ({ ...item }))

  for (const gardenLesson of catalogLessons.filter((l) => isGardenCatalogTitle(l.title))) {
    const lessonNo = normalizeLessonNo(gardenLesson.lessonNo)
    const prevLesson = findPrevTextLesson(catalogLessons, gardenLesson)
    if (!prevLesson) continue

    const prevNo = normalizeLessonNo(prevLesson.lessonNo)
    const labelEnd = findGardenLabelEnd(compact, gardenLesson.title)
    if (labelEnd < 0) continue

    const gardenEntries: Array<{ idx: number; char: string }> = []
    for (let i = 0; i < result.length; i++) {
      const item = result[i]
      if (normalizeLessonNo(item.lessonNo) !== lessonNo) continue
      const char = String(item.char ?? '').trim()
      if (char.length !== 1 || char === LESSON_SLOT_CHAR) continue
      gardenEntries.push({ idx: i, char })
    }
    if (gardenEntries.length === 0) continue

    const groupChars = gardenEntries.map((e) => e.char)
    const bleedStart = findGardenSequenceStart(compact, labelEnd, groupChars)
    if (bleedStart <= 0) continue

    for (let gi = 0; gi < bleedStart; gi++) {
      result[gardenEntries[gi].idx] = { ...result[gardenEntries[gi].idx], lessonNo: prevNo }
    }
  }

  return result
}



/**

 * 从写字表/识字表 OCR 文本按行解析。

 * 每行格式：左侧课次号或「语文园地」+ 右侧生字（从左到右顺序）。

 */

export function parseCharTableFromOcrText(

  ocrText: string,

  catalogLessons: LessonMeta[] = [],

  context: TableParseContext = {}

): CharacterItem[] | null {

  const items = parseTableFromOcrText(

    ocrText,

    catalogLessons,

    context,

    extractHanCharsInOrder,
    (char, lessonNo, index) => ({ char, lessonNo, index }),
    (lessonNo, index) => ({ char: LESSON_SLOT_CHAR, lessonNo, index })
  )
  if (!items) return null
  return items
    .map((item) => ({
      char: String(item.char ?? '').trim(),
      lessonNo: normalizeLessonNo(item.lessonNo),
      index: Number(item.index) || undefined,
    }))
    .filter((item) => item.char.length === 1 && isValidLessonNo(item.lessonNo))
}



/** 从词语表 OCR 文本按行解析（逻辑与识字表相同，按词语分隔） */

export function parseWordTableFromOcrText(

  ocrText: string,

  catalogLessons: LessonMeta[] = [],

  context: TableParseContext = {}

): WordItem[] | null {

  const items = parseTableFromOcrText(

    ocrText,

    catalogLessons,

    context,

    extractWordsFromLine,
    (word, lessonNo, index) => ({ word, lessonNo, index }),
    (lessonNo, index) => ({ word: LESSON_SLOT_WORD, lessonNo, index })
  )
  if (!items) return null
  return items
    .map((item) => ({
      word: String(item.word ?? '').trim(),
      lessonNo: normalizeLessonNo(item.lessonNo),
      index: Number(item.index) || undefined,
    }))
    .filter((item) => item.word.length >= 2 && isValidLessonNo(item.lessonNo))
}



function createGroupedParseState(catalogLessons: LessonMeta[], context: TableParseContext = {}) {
  return createParseState(catalogLessons, context)
}

/** 向后找下一组带印刷序号的课文，并带上其 unitLabel（跳过园地标识） */
function peekNextGroupedNumberedLesson(
  lessons: Array<{ lessonNo?: number; title?: string; unitLabel?: string }>,
  fromIndex: number,
  currentUnitLabel: string
): { printedNo: number; unitLabel: string } | null {
  let unit = normalizeUnitLabel(currentUnitLabel)
  for (let i = fromIndex + 1; i < lessons.length; i++) {
    const rawUnit = normalizeUnitLabel(lessons[i].unitLabel)
    if (rawUnit && !isGardenTitle(rawUnit)) unit = rawUnit
    const resolved = resolveGroupedPrintedNo(lessons[i])
    if (resolved.printedNo > 0) {
      return { printedNo: resolved.printedNo, unitLabel: unit }
    }
  }
  return null
}

function resolveGroupedGardenLessonNo(
  catalogLessons: LessonMeta[],
  state: ReturnType<typeof createGroupedParseState>,
  mappedNextNo: string | null
): string | null {
  // 有 unitLabel 前缀课时，前后锚点必须用已映射课次，不能再用「全书第 N 个非园地」
  const mappedPrev = isValidLessonNo(state.currentMappedLessonNo)
    ? normalizeLessonNo(state.currentMappedLessonNo)
    : mapNumberedLessonNo(state.prevPrintedNo, state.gardensSeen, catalogLessons)
  const lessonNo = pickGardenLessonNo(catalogLessons, mappedPrev, mappedNextNo, state.usedGardenNos)

  if (!isValidLessonNo(lessonNo)) return null

  state.usedGardenNos.add(normalizeLessonNo(lessonNo))
  state.gardensSeen++
  state.currentMappedLessonNo = lessonNo
  return lessonNo
}



/** 将 AI 分组结果按目录规则映射课次（Vision / Tesseract 结构化输出共用） */

export function mapGroupedCharLessons(

  lessons: Array<{ lessonNo?: number; title?: string; unitLabel?: string; chars?: unknown[] }>,

  catalogLessons: LessonMeta[] = [],

  context: TableParseContext = {}

): CharacterItem[] {

  const items: CharacterItem[] = []

  const state = createGroupedParseState(catalogLessons, context)



  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li]
    const resolved = resolveGroupedPrintedNo(lesson)
    const title = resolved.title
    let printedNo = resolved.printedNo
    const groupIndex = Number((lesson as { index?: number }).index) || state.groupIndex + 1
    const rawUnit = normalizeUnitLabel(lesson.unitLabel)
    // 园地标识只作用于本组，不向下继承，避免后续课文被当成园地
    if (rawUnit && !isGardenTitle(rawUnit)) state.currentUnitLabel = rawUnit
    const unitIsGarden = isGardenTitle(rawUnit)
    const isGarden = isGardenCatalogTitle(title) || (!printedNo && unitIsGarden)
    const charList = lesson.chars

    let lessonNo = printedNo > 0 ? formatIntegerLessonNo(printedNo) : ''
    if (isGarden) {
      const next = peekNextGroupedNumberedLesson(lessons, li, state.currentUnitLabel)
      const mappedNext =
        next !== null
          ? mapPrintedWithUnitLabel(
              inferSequentialPrintedNo(prevPrintedForUnit(state, next.unitLabel), next.printedNo),
              next.unitLabel,
              state.gardensSeen,
              catalogLessons
            )
          : null
      const resolvedGarden = resolveGroupedGardenLessonNo(catalogLessons, state, mappedNext)
      if (!resolvedGarden) continue
      lessonNo = resolvedGarden
    } else if (printedNo > 0) {
      const unitPrev = prevPrintedForUnit(state, state.currentUnitLabel)
      printedNo = inferSequentialPrintedNo(unitPrev, printedNo)
      lessonNo = mapPrintedWithUnitLabel(
        printedNo,
        state.currentUnitLabel,
        state.gardensSeen,
        catalogLessons
      )
      rememberPrintedForUnit(state, state.currentUnitLabel, printedNo)
      state.currentMappedLessonNo = lessonNo
    } else if (isValidLessonNo(state.currentMappedLessonNo)) {
      lessonNo = state.currentMappedLessonNo
    } else {
      continue
    }

    state.groupIndex = groupIndex

    if (!Array.isArray(charList)) {
      if (isGarden) {
        items.push({ char: LESSON_SLOT_CHAR, lessonNo, index: groupIndex })
      } else {
        for (const char of extractLeadingItemsFromTitle(title, extractHanCharsInOrder)) {
          items.push({ char, lessonNo, index: groupIndex })
        }
      }
      continue
    }

    const parsedChars: string[] = []
    for (const entry of charList) {
      if (typeof entry === 'string') {
        const char = entry.trim()
        if (char.length === 1) parsedChars.push(char)
      } else if (entry && typeof entry === 'object') {
        const char = String((entry as CharacterItem).char ?? '').trim()
        if (char.length === 1) parsedChars.push(char)
      }
    }
    const mergedChars = mergeTitleAndListItems(title, parsedChars, extractHanCharsInOrder)

    let added = 0
    for (const char of mergedChars) {
      items.push({ char, lessonNo, index: groupIndex })
      added++
    }
    if (added === 0 && isGarden) {
      items.push({ char: LESSON_SLOT_CHAR, lessonNo, index: groupIndex })
    }
  }

  return items
    .map((item) => ({
      char: String(item.char ?? '').trim(),
      lessonNo: normalizeLessonNo(item.lessonNo),
      index: Number(item.index) || undefined,
    }))
    .filter((item) => item.char.length === 1 && isValidLessonNo(item.lessonNo))
}



/** 将 AI 分组词语结果按目录规则映射课次（与 mapGroupedCharLessons 对称） */

export function mapGroupedWordLessons(

  lessons: Array<{ lessonNo?: number; title?: string; unitLabel?: string; words?: unknown[] }>,

  catalogLessons: LessonMeta[] = [],

  context: TableParseContext = {}

): WordItem[] {

  const items: WordItem[] = []

  const state = createGroupedParseState(catalogLessons, context)



  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li]
    const resolved = resolveGroupedPrintedNo(lesson)
    const title = resolved.title
    let printedNo = resolved.printedNo
    const groupIndex = Number((lesson as { index?: number }).index) || state.groupIndex + 1
    const rawUnit = normalizeUnitLabel(lesson.unitLabel)
    // 园地标识只作用于本组，不向下继承，避免后续课文被当成园地
    if (rawUnit && !isGardenTitle(rawUnit)) state.currentUnitLabel = rawUnit
    const unitIsGarden = isGardenTitle(rawUnit)
    const isGarden = isGardenCatalogTitle(title) || (!printedNo && unitIsGarden)
    const wordList = lesson.words

    let lessonNo = printedNo > 0 ? formatIntegerLessonNo(printedNo) : ''
    if (isGarden) {
      const next = peekNextGroupedNumberedLesson(lessons, li, state.currentUnitLabel)
      const mappedNext =
        next !== null
          ? mapPrintedWithUnitLabel(
              inferSequentialPrintedNo(prevPrintedForUnit(state, next.unitLabel), next.printedNo),
              next.unitLabel,
              state.gardensSeen,
              catalogLessons
            )
          : null
      const resolvedGarden = resolveGroupedGardenLessonNo(catalogLessons, state, mappedNext)
      if (!resolvedGarden) continue
      lessonNo = resolvedGarden
    } else if (printedNo > 0) {
      const unitPrev = prevPrintedForUnit(state, state.currentUnitLabel)
      printedNo = inferSequentialPrintedNo(unitPrev, printedNo)
      lessonNo = mapPrintedWithUnitLabel(
        printedNo,
        state.currentUnitLabel,
        state.gardensSeen,
        catalogLessons
      )
      rememberPrintedForUnit(state, state.currentUnitLabel, printedNo)
      state.currentMappedLessonNo = lessonNo
    } else if (isValidLessonNo(state.currentMappedLessonNo)) {
      lessonNo = state.currentMappedLessonNo
    } else {
      continue
    }

    state.groupIndex = groupIndex

    if (!Array.isArray(wordList)) {
      if (isGarden) {
        items.push({ word: LESSON_SLOT_WORD, lessonNo, index: groupIndex })
      } else {
        for (const word of extractLeadingItemsFromTitle(title, extractWordsFromLine)) {
          items.push({ word, lessonNo, index: groupIndex })
        }
      }
      continue
    }

    const parsedWords: string[] = []
    for (const entry of wordList) {
      if (typeof entry === 'string') {
        const word = entry.trim()
        if (word.length >= 2) parsedWords.push(word)
      } else if (entry && typeof entry === 'object') {
        const word = String((entry as WordItem).word ?? '').trim()
        if (word.length >= 2) parsedWords.push(word)
      }
    }
    const mergedWords = mergeTitleAndListItems(title, parsedWords, extractWordsFromLine)

    let added = 0
    for (const word of mergedWords) {
      items.push({ word, lessonNo, index: groupIndex })
      added++
    }
    if (added === 0 && isGarden) {
      items.push({ word: LESSON_SLOT_WORD, lessonNo, index: groupIndex })
    }
  }

  return items
    .map((item) => ({
      word: String(item.word ?? '').trim(),
      lessonNo: normalizeLessonNo(item.lessonNo),
      index: Number(item.index) || undefined,
    }))
    .filter((item) => item.word.length >= 2 && isValidLessonNo(item.lessonNo))
}

