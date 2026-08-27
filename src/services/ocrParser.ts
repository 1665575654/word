import { visionJSON } from '@/services/openai'
import { compressImage } from '@/services/fileIO'
import {
  LESSON_SLOT_CHAR,
  LESSON_SLOT_WORD,
  dedupeWordItems,
} from '@/services/dataMerger'
import {
  finalizeCatalogLessons,
  formatGardenLessonNo,
  formatIntegerLessonNo,
  formatPrefixedLessonNo,
  inferSequentialPrintedNo,
  isGardenTitle,
  isValidLessonNo,
  applyContinuationLessonNo,
  normalizeLessonNo,
  normalizeUnitLabel,
  nthGardenLesson,
  nthNonGardenLesson,
  resolveCatalogRowLessonNo,
  resolveGroupedPrintedNo,
  type RawCatalogRow,
} from '@/services/lessonNoUtils'
import {
  mapGroupedCharLessons,
  mapGroupedWordLessons,
  extractHanCharsInOrder,
  extractWordsFromLine,
  extractLeadingItemsFromTitle,
  mergeTitleAndListItems,
  type TableParseContext,
  type TableParseKind,
} from '@/services/tableOcrParser'
import type { ImageType, CharacterItem, WordItem, LessonMeta } from '@/types'

export interface ParseImageOptions {
  catalogLessons?: LessonMeta[]
  lastLessonNo?: string
}

/** 目录中需要排除的条目（非课文、非语文园地） */
const CATALOG_EXCLUDED_PATTERNS = [
  /^第?[一二三四五六七八九十\d]+单元$/,
  /^单元/,
  /单元导读/,
  /单元要点/,
  /口语交际/,
  /^习作/,
  /习作例文/,
  /写话/,
  /快乐读书吧/,
  /我爱阅读/,
  /识字加油站/,
  /日积月累/,
  /(识字|写字|词语|生词)表/,
  /^附录/,
  /综合(性)?学习/,
  /选做/,
  /资料袋/,
  /^目录$/,
  /^封面$/,
  /^前言$/,
  /^后记/,
  /页码/,
  /^\d+\s*页$/,
]

export function isCatalogLessonTitle(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  if (/语文园地/.test(t)) return true
  return !CATALOG_EXCLUDED_PATTERNS.some((p) => p.test(t))
}


function gardenLessonNos(catalogLessons: LessonMeta[]): Set<string> {
  return new Set(
    catalogLessons
      .filter((l) => isGardenTitle(l.title))
      .map((l) => normalizeLessonNo(l.lessonNo))
      .filter((no) => no.length > 0)
  )
}

function hasGardenInGroupedRaw(raw: unknown): boolean {
  const lessons = extractArray<{ title?: string }>(raw, 'lessons', 'lesson')
  return lessons.some((lesson) => isGardenTitle(String(lesson.title ?? '')))
}

function stripGardenItemsForNonWritingTable<T extends { lessonNo: string }>(
  items: T[],
  catalogLessons: LessonMeta[],
  kind: TableParseKind,
  raw: unknown,
  lastLessonNo?: string
): T[] {
  if (kind === 'writing' || catalogLessons.length === 0) return items
  if (hasGardenInGroupedRaw(raw)) return items
  // 跨图续传时新批次可能含园地课次生字，不宜整批剔除
  if (isValidLessonNo(normalizeLessonNo(lastLessonNo ?? ''))) return items
  const gardenNos = gardenLessonNos(catalogLessons)
  if (gardenNos.size === 0) return items
  return items.filter((item) => !gardenNos.has(normalizeLessonNo(item.lessonNo)))
}

const TABLE_CHAR_CONTENT_RULES =
  'chars 仅填生字格中的单字，顺序与图片一致；禁止把课文标题、语文园地标题（含语/文/园/地/序号）、索引/课次/添加等界面文字中的汉字写入 chars；title 仅填课文标题或留空，不得含生字。'

const TABLE_LESSON_NO_RULES = `index 为从上到下的组顺序号；lessonNo 为组标题左侧的印刷整数序号（如「1」「2」，忽略*号），该序号只计课文、不计语文园地，不是目录总序号；语文园地组无印刷序号，title 填「语文园地」；同课续行归入上一课；不要把相邻两行序号合并（如「2」「3」两行不可写成 lessonNo:23）。图片中未出现的课次不要输出；跳号（如 2 后直接 4）表示中间课文在本书中无字词，不要为缺失课次编造内容；语文园地须按其在图片中的位置，映射到目录中位于前后两课之间的那个语文园地，图片未出现的语文园地不要输出。每课所有字词必须完整写入 chars/words 数组，不要把第一个字词只放在 title 里；title 仅填课文标题或留空。`

const TABLE_LAYOUT_AND_UNIT_RULES = `页面若左右排布且中间有竖线：须先读完左栏从上到下，再读右栏从上到下，勿按同一横行合并左右栏。
unitLabel：取自该行上方印刷的单元类型标识（如「阅读」「识字」「汉语拼音」）；标识出现后，该行及后续每行均继承同一 unitLabel，直到出现新标识。
lessonNo 仍为行前印刷整数序号；不同单元各自从 1 重计（如阅读 1–3 后接识字 1–4），须原样输出，不要改成全书连续编号；最终课次由后处理拼成「阅读-5」等形式，模型不要直接输出带前缀的课次字符串。
语文园地组无印刷整数序号，title 填「语文园地」，unitLabel 可填「语文园地」（仅本组，勿把后续课文标成语文园地）。`

const VOCAB_WORD_RULES =
  'words 每项必须是完整词语（至少2个汉字），禁止拆成单字，禁止把多个词语合并为一项；无课次号的续行归入上一课。'

const VISION_PROMPTS: Record<ImageType, string> = {
  catalog: `识别小学语文课本目录，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"title":"小小的船","unitLabel":"阅读","page":84}]}
要求：只提取带序号的课文与语文园地；忽略单元名本身、口语交际、习作、子篇目（如古诗下的单首诗名）、识字表/写字表/笔画名称表等附录。
index 为按页码从小到大的阅读顺序号。
lessonNo：必须原样取标题左侧圆圈/方框内的印刷课次序号（如「5 小小的船」→5，「8 比尾巴」→8），忽略*号；不同单元允许重复（如识字单元有5、阅读单元也有5）。禁止改成单元内从1重排，禁止用单元号（第七单元≠7），禁止用右侧页码。语文园地无此前序号时不填 lessonNo。
unitLabel：取自「第N单元」后的类型标识（如「第七单元 · 阅读」→"阅读"，「第六单元 · 识字」→"识字"，「汉语拼音」→"汉语拼音"）；若仅有「第N单元」无类型标识则填 ""。后处理会拼成「阅读-5」「识字-5」等。
page：该条目右侧页码数字，必须填写；条目须严格按 page 升序输出。
目录页常为左右双栏：须先读完左栏从上到下，再读右栏从上到下，勿按同一横行合并左右栏。
示例：第七单元·阅读下「5 小小的船 …… 84」→ {"lessonNo":5,"title":"小小的船","unitLabel":"阅读","page":84}。
只返回 JSON。`,

  writing: `识别小学语文写字表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","chars":[{"char":"船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${TABLE_CHAR_CONTENT_RULES} chars 顺序与图片一致。
也接受 {"chars":[{"char":"字","lessonNo":1,"index":1}]}。只返回 JSON。`,

  reading: `识别小学语文识字表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","chars":[{"char":"船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${TABLE_CHAR_CONTENT_RULES} chars 顺序与图片一致。
也接受 {"chars":[{"char":"字","lessonNo":1,"index":1}]}。只返回 JSON。`,

  vocabulary: `识别小学语文词语表，返回 JSON：
{"lessons":[{"index":1,"lessonNo":5,"unitLabel":"阅读","title":"","words":[{"word":"小小的船"}]}]}
要求：${TABLE_LESSON_NO_RULES} ${TABLE_LAYOUT_AND_UNIT_RULES} ${VOCAB_WORD_RULES}
也接受 {"words":[{"word":"词语","lessonNo":1,"index":1}]}。只返回 JSON。`,
}

function extractArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[]
  if (!data || typeof data !== 'object') return []
  const obj = data as Record<string, unknown>

  for (const key of keys) {
    const val = obj[key]
    if (Array.isArray(val) && val.length > 0) return val as T[]
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0) return val as T[]
    if (val && typeof val === 'object') {
      const nested = extractArray<T>(val, ...keys)
      if (nested.length > 0) return nested
    }
  }
  return []
}

export function normalizeChars(raw: CharacterItem[]): CharacterItem[] {
  return raw
    .map((item) => ({
      char: String(item.char ?? '').trim(),
      lessonNo: normalizeLessonNo(item.lessonNo),
      index: Number(item.index) || undefined,
    }))
    .filter((item) => item.char.length === 1 && isValidLessonNo(item.lessonNo))
}

function splitVocabWord(text: string): string[] {
  const parts = String(text ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\u4e00-\u9fff]/g, ''))
    .filter((w) => w.length >= 2)
  if (parts.length > 0) return parts
  const single = String(text ?? '')
    .trim()
    .replace(/[^\u4e00-\u9fff]/g, '')
  return single.length >= 2 ? [single] : []
}

export function normalizeWords(raw: WordItem[]): WordItem[] {
  const expanded: WordItem[] = []
  for (const item of raw) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    for (const word of splitVocabWord(item.word)) {
      expanded.push({
        ...item,
        word,
        lessonNo,
        index: Number(item.index) || undefined,
      })
    }
  }
  return dedupeWordItems(expanded)
}

export function normalizeLessons(
  raw: LessonMeta[] | RawCatalogRow[],
  existingCatalog: LessonMeta[] = []
): LessonMeta[] {
  const initialGardenSeq = existingCatalog.filter((l) => isGardenTitle(l.title)).length
  const filtered = raw
    .map((item) => {
      const row = item as RawCatalogRow
      const originalTitle = String(item.title ?? '').trim()
      const resolved = resolveCatalogRowLessonNo(row)
      const title = isGardenTitle(originalTitle)
        ? originalTitle.replace(/^[◎●◆\s]+/, '').trim() || originalTitle
        : resolved.title || originalTitle
      return {
        index: Number(item.index) || 0,
        lessonNo: resolved.lessonNo,
        title,
        unitLabel: resolved.unitLabel || String(row.unitLabel ?? ''),
        page: resolved.page || Number(row.page) || 0,
      }
    })
    .filter((item) => item.title.length > 0 && isCatalogLessonTitle(item.title))

  return finalizeCatalogLessons(filtered, { initialGardenSeq })
}

interface LessonGroupedRow {
  index?: number
  lessonNo?: number
  title?: string
  unitLabel?: string
  chars?: unknown[]
  words?: unknown[]
}

function resolveTableLessonNo(
  printedNo: number,
  title: string,
  gardenSeq: number,
  catalogLessons: LessonMeta[]
): { lessonNo: string; gardenSeq: number } {
  if (isGardenTitle(title)) {
    const nextSeq = gardenSeq + 1
    if (catalogLessons.length > 0) {
      const garden = nthGardenLesson(catalogLessons, nextSeq)
      if (garden) return { lessonNo: normalizeLessonNo(garden.lessonNo), gardenSeq: nextSeq }
    }
    return { lessonNo: formatGardenLessonNo(nextSeq), gardenSeq: nextSeq }
  }

  if (printedNo > 0) {
    const lessonNo =
      catalogLessons.length > 0
        ? nthNonGardenLesson(catalogLessons, printedNo)
        : formatIntegerLessonNo(printedNo)
    return { lessonNo, gardenSeq }
  }

  return { lessonNo: '', gardenSeq }
}

function flattenLessonGroupedChars(
  raw: unknown,
  catalogLessons: LessonMeta[] = [],
  context: TableParseContext = {}
): CharacterItem[] {
  const lessons = extractArray<LessonGroupedRow>(raw, 'lessons', 'lesson')
  if (lessons.length === 0) return []

  if (catalogLessons.length > 0) {
    return mapGroupedCharLessons(lessons, catalogLessons, context)
  }

  const items: CharacterItem[] = []
  let currentLessonNo = context.lastLessonNo ?? ''
  let currentUnitLabel = ''
  let gardenSeq = 0
  const prevPrintedByUnit = new Map<string, number>()
  let prevPrintedNo = 0

  for (const lesson of lessons) {
    const resolved = resolveGroupedPrintedNo(lesson)
    const title = resolved.title
    let printedNo = resolved.printedNo
    const groupIndex = Number(lesson.index) || 0
    const rawUnit = normalizeUnitLabel(lesson.unitLabel)
    if (rawUnit && !isGardenTitle(rawUnit)) currentUnitLabel = rawUnit
    let lessonNo = printedNo > 0 ? formatIntegerLessonNo(printedNo) : ''

    if (isGardenTitle(title) || (!printedNo && /园地/.test(title))) {
      const resolvedGarden = resolveTableLessonNo(printedNo, title || '语文园地', gardenSeq, catalogLessons)
      lessonNo = resolvedGarden.lessonNo
      gardenSeq = resolvedGarden.gardenSeq
      currentLessonNo = lessonNo
    } else if (printedNo > 0) {
      const unitPrev = currentUnitLabel ? (prevPrintedByUnit.get(currentUnitLabel) ?? 0) : prevPrintedNo
      printedNo = inferSequentialPrintedNo(unitPrev, printedNo)
      lessonNo = formatPrefixedLessonNo(currentUnitLabel, printedNo)
      prevPrintedNo = printedNo
      if (currentUnitLabel) prevPrintedByUnit.set(currentUnitLabel, printedNo)
      currentLessonNo = lessonNo
    } else if (isValidLessonNo(currentLessonNo)) {
      lessonNo = currentLessonNo
    } else {
      continue
    }

    const charList = lesson.chars
    if (!Array.isArray(charList)) {
      if (isGardenTitle(title)) {
        items.push({ char: LESSON_SLOT_CHAR, lessonNo, index: groupIndex || undefined })
      } else {
        for (const char of extractLeadingItemsFromTitle(title, extractHanCharsInOrder)) {
          items.push({ char, lessonNo, index: groupIndex || undefined })
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
      items.push({ char, lessonNo, index: groupIndex || undefined })
      added++
    }
    if (added === 0 && isGardenTitle(title)) {
      items.push({ char: LESSON_SLOT_CHAR, lessonNo, index: groupIndex || undefined })
    }
  }
  return normalizeChars(items)
}

function flattenLessonGroupedWords(
  raw: unknown,
  catalogLessons: LessonMeta[] = [],
  context: TableParseContext = {}
): WordItem[] {
  const lessons = extractArray<LessonGroupedRow>(raw, 'lessons', 'lesson')
  if (lessons.length === 0) return []

  if (catalogLessons.length > 0) {
    return mapGroupedWordLessons(lessons, catalogLessons, context)
  }

  const items: WordItem[] = []
  let currentLessonNo = context.lastLessonNo ?? ''
  let currentUnitLabel = ''
  let gardenSeq = 0
  const prevPrintedByUnit = new Map<string, number>()
  let prevPrintedNo = 0

  for (const lesson of lessons) {
    const resolved = resolveGroupedPrintedNo(lesson)
    const title = resolved.title
    let printedNo = resolved.printedNo
    const groupIndex = Number(lesson.index) || 0
    const rawUnit = normalizeUnitLabel(lesson.unitLabel)
    if (rawUnit && !isGardenTitle(rawUnit)) currentUnitLabel = rawUnit
    let lessonNo = printedNo > 0 ? formatIntegerLessonNo(printedNo) : ''

    if (isGardenTitle(title) || (!printedNo && /园地/.test(title))) {
      const resolvedGarden = resolveTableLessonNo(printedNo, title || '语文园地', gardenSeq, catalogLessons)
      lessonNo = resolvedGarden.lessonNo
      gardenSeq = resolvedGarden.gardenSeq
      currentLessonNo = lessonNo
    } else if (printedNo > 0) {
      const unitPrev = currentUnitLabel ? (prevPrintedByUnit.get(currentUnitLabel) ?? 0) : prevPrintedNo
      printedNo = inferSequentialPrintedNo(unitPrev, printedNo)
      lessonNo = formatPrefixedLessonNo(currentUnitLabel, printedNo)
      prevPrintedNo = printedNo
      if (currentUnitLabel) prevPrintedByUnit.set(currentUnitLabel, printedNo)
      currentLessonNo = lessonNo
    } else if (isValidLessonNo(currentLessonNo)) {
      lessonNo = currentLessonNo
    } else {
      continue
    }

    const wordList = lesson.words
    if (!Array.isArray(wordList)) {
      if (isGardenTitle(title)) {
        items.push({ word: LESSON_SLOT_WORD, lessonNo, index: groupIndex || undefined })
      } else {
        for (const word of extractLeadingItemsFromTitle(title, extractWordsFromLine)) {
          items.push({ word, lessonNo, index: groupIndex || undefined })
        }
      }
      continue
    }

    const parsedWords: string[] = []
    for (const entry of wordList) {
      if (typeof entry === 'string') {
        const word = entry.trim()
        if (word.length > 0) parsedWords.push(word)
      } else if (entry && typeof entry === 'object') {
        const word = String((entry as WordItem).word ?? '').trim()
        if (word.length > 0) parsedWords.push(word)
      }
    }
    const mergedWords = mergeTitleAndListItems(title, parsedWords, extractWordsFromLine)
    let added = 0
    for (const word of mergedWords) {
      items.push({ word, lessonNo, index: groupIndex || undefined })
      added++
    }
    if (added === 0 && isGardenTitle(title)) {
      items.push({ word: LESSON_SLOT_WORD, lessonNo, index: groupIndex || undefined })
    }
  }
  return normalizeWords(items)
}

async function parseWithVision(file: File, type: ImageType): Promise<Record<string, unknown>> {
  const { base64, mimeType } = await compressImage(file, {
    maxSize: 1280,
    quality: 0.75,
    forceJpeg: true,
  })
  return visionJSON<Record<string, unknown>>(base64, VISION_PROMPTS[type], mimeType)
}

export async function parseImage(
  file: File,
  type: ImageType,
  options: ParseImageOptions = {}
): Promise<Record<string, unknown>> {
  const catalogLessons = options.catalogLessons ?? []
  const tableKind: TableParseKind | undefined =
    type === 'writing' || type === 'reading' || type === 'vocabulary' ? type : undefined
  const tableContext: TableParseContext = {
    lastLessonNo: options.lastLessonNo,
    kind: tableKind,
  }

  const raw = await parseWithVision(file, type)

  if (type === 'catalog') {
    const extracted = extractArray<LessonMeta>(raw, 'lessons', 'lesson', 'catalog')
    const lessons = normalizeLessons(extracted, catalogLessons)
    if (lessons.length === 0) {
      const hint =
        extracted.length > 0
          ? `（模型返回了 ${extracted.length} 条，但课次/标题未能解析，请重试或换更清晰图片）`
          : ''
      throw new Error(`未识别到目录内容，请上传清晰的目录图片${hint}`)
    }
    return { lessons }
  }

  if (type === 'writing' || type === 'reading') {
    const grouped = flattenLessonGroupedChars(raw, catalogLessons, tableContext)
    let chars =
      grouped.length > 0
        ? grouped
        : normalizeChars(
            applyContinuationLessonNo(
              extractArray<CharacterItem>(raw, 'chars', 'characters'),
              options.lastLessonNo
            )
          )

    if (tableKind) {
      chars = stripGardenItemsForNonWritingTable(
        chars,
        catalogLessons,
        tableKind,
        raw,
        options.lastLessonNo
      )
    }

    if (chars.length === 0) {
      throw new Error('未识别到生字，请上传清晰图片')
    }
    return { chars }
  }

  const groupedWords = flattenLessonGroupedWords(raw, catalogLessons, tableContext)
  let words =
    groupedWords.length > 0
      ? normalizeWords(groupedWords)
      : normalizeWords(
          applyContinuationLessonNo(
            extractArray<WordItem>(raw, 'words', 'vocabulary', '词语'),
            options.lastLessonNo
          )
        )

  if (tableKind) {
    words = stripGardenItemsForNonWritingTable(
      words,
      catalogLessons,
      tableKind,
      raw,
      options.lastLessonNo
    )
  }
  words = dedupeWordItems(words)
  if (words.length === 0) {
    throw new Error('未识别到词语，请上传清晰图片')
  }
  return { words }
}


