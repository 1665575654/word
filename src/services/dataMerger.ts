import type { CharacterItem, LessonMeta, WordItem, Workspace } from '@/types'
import {
  cnOrdinal,
  compareLessonNo,
  formatGardenLessonNo,
  getLastLessonNoFromItems,
  isGardenTitle,
  isGardenLessonNo,
  isValidLessonNo,
  lessonNoToMergeValue,
  normalizeLessonNo,
  reorderCatalogLessons,
  shiftLessonNoForMerge,
  sortByLessonNo,
} from '@/services/lessonNoUtils'

/** 占位符：标记空课次槽位，便于在扁平数组中持久化 */
export const LESSON_SLOT_CHAR = '\u200b'
export const LESSON_SLOT_WORD = '\u200b'

export function isLessonSlotChar(char: string): boolean {
  return char === LESSON_SLOT_CHAR
}

export function isLessonSlotWord(word: string): boolean {
  return word === LESSON_SLOT_WORD
}

/** 单张图片识别结果末尾课次（按识别顺序，即该图最下方一组） */
export function getLastLessonNoFromBatch(
  items: Array<{ lessonNo: string; char?: string; word?: string }>,
  isSlot: (text: string) => boolean
): string {
  return getLastLessonNoFromItems(items, isSlot)
}

export function resolveTableUploadLastLessonNo(
  tableLastLesson: string | undefined,
  items: Array<{ lessonNo: string; char?: string; word?: string }>,
  isSlot: (text: string) => boolean
): string {
  const stored = normalizeLessonNo(tableLastLesson ?? '')
  if (isValidLessonNo(stored)) return stored
  return getLastLessonNoFromItems(items, isSlot)
}

/** 将 OCR 续行词语补入 AI 结果（仅补缺、不重复） */
export function expandWordTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^\u4e00-\u9fff]/g, '').trim())
    .filter((w) => w.length > 0)
}

export function dedupeWordItems(items: WordItem[]): WordItem[] {
  const seen = new Map<string, Set<string>>()
  const result: WordItem[] = []
  for (const item of items) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    const word = String(item.word ?? '').trim()
    if (!isValidLessonNo(lessonNo) || word.length === 0 || isLessonSlotWord(word)) continue
    const lessonSeen = seen.get(lessonNo) ?? new Set<string>()
    if (lessonSeen.has(word)) continue
    lessonSeen.add(word)
    seen.set(lessonNo, lessonSeen)
    result.push({ ...item, word, lessonNo })
  }
  return result
}

export function prependMissingContinuationWords(
  continuation: WordItem[],
  existing: WordItem[],
  lastLessonNo: string
): WordItem[] {
  const target = normalizeLessonNo(lastLessonNo)
  if (!isValidLessonNo(target) || continuation.length === 0) return existing

  const existingTokens = new Set<string>()
  for (const item of existing) {
    if (normalizeLessonNo(item.lessonNo) !== target || isLessonSlotWord(item.word)) continue
    for (const token of expandWordTokens(item.word)) existingTokens.add(token)
  }

  const missing: WordItem[] = []
  for (const item of continuation) {
    if (normalizeLessonNo(item.lessonNo) !== target || isLessonSlotWord(item.word)) continue
    for (const token of expandWordTokens(item.word)) {
      if (token.length < 2) continue
      if (existingTokens.has(token)) continue
      existingTokens.add(token)
      missing.push({ ...item, word: token, lessonNo: target })
    }
  }

  if (missing.length === 0) return existing
  return [...missing, ...existing]
}

/** 本批次中，从课文课次移除与语文园地重复的词语 */
export function stripGardenWordsFromTextLessons(items: WordItem[]): WordItem[] {
  const gardenWords = new Set<string>()
  for (const item of items) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    const word = String(item.word ?? '').trim()
    if (
      isGardenLessonNo(lessonNo) &&
      !isLessonSlotWord(word) &&
      word.length >= 2
    ) {
      gardenWords.add(word)
    }
  }
  if (gardenWords.size === 0) return items
  return items.filter((item) => {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    if (isGardenLessonNo(lessonNo)) return true
    return !gardenWords.has(item.word)
  })
}

function charsByLesson(chars: CharacterItem[]): Map<string, CharacterItem[]> {
  const map = new Map<string, CharacterItem[]>()
  for (const item of chars) {
    const no = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(no)) continue
    const list = map.get(no) ?? []
    list.push(item)
    map.set(no, list)
  }
  return map
}

function wordsByLesson(words: WordItem[]): Map<string, WordItem[]> {
  const map = new Map<string, WordItem[]>()
  for (const item of words) {
    const no = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(no)) continue
    const list = map.get(no) ?? []
    list.push(item)
    map.set(no, list)
  }
  return map
}

export type GroupedCharEntry = { char: string }
export type GroupedWordEntry = { word: string }

/** 拓展后的生字条目（字段内嵌于 char 对象，不含课次） */
export type ExpandedCharEntry = Omit<CharacterItem, 'lessonNo' | 'index'>
/** 拓展后的词语条目（字段内嵌于 word 对象，不含课次） */
export type ExpandedWordEntry = Omit<WordItem, 'lessonNo' | 'index'>

export interface LessonExpandedWritingGroup {
  index: number
  lessonNo: string
  title?: string
  writingChars: ExpandedCharEntry[]
}

export interface LessonExpandedReadingGroup {
  index: number
  lessonNo: string
  title?: string
  readingChars: ExpandedCharEntry[]
}

export interface LessonExpandedVocabularyGroup {
  index: number
  lessonNo: string
  title?: string
  vocabulary: ExpandedWordEntry[]
}

export interface LessonWritingGroup {
  index: number
  lessonNo: string
  title?: string
  writingChars: GroupedCharEntry[]
}

export interface LessonReadingGroup {
  index: number
  lessonNo: string
  title?: string
  readingChars: GroupedCharEntry[]
}

export interface LessonVocabularyGroup {
  index: number
  lessonNo: string
  title?: string
  vocabulary: GroupedWordEntry[]
}

function appendExtraCharGroupsFromByLesson(
  groups: LessonReadingGroup[],
  byLesson: Map<string, CharacterItem[]>,
  catalog: LessonMeta[]
): LessonReadingGroup[] {
  const catalogNos = new Set(catalog.map((l) => normalizeLessonNo(l.lessonNo)))
  const extra: LessonReadingGroup[] = []

  for (const lessonNo of [...byLesson.keys()].sort(compareLessonNo)) {
    if (catalogNos.has(lessonNo)) continue
    const readingChars = (byLesson.get(lessonNo) ?? [])
      .map((item) => ({ char: String(item.char ?? '').trim() }))
      .filter((item) => item.char.length === 1 && !isLessonSlotChar(item.char))
    if (readingChars.length === 0) continue
    extra.push({ index: 0, lessonNo, readingChars })
  }

  if (extra.length === 0) return groups
  return [...groups, ...extra].map((g, i) => ({ ...g, index: i + 1 }))
}

function buildWritingGroupsFromCatalog(
  chars: CharacterItem[],
  catalog: LessonMeta[]
): LessonWritingGroup[] {
  const byLesson = charsByLesson(chars)
  return [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const writingChars = (byLesson.get(lessonNo) ?? [])
        .map((item) => ({ char: String(item.char ?? '').trim() }))
        .filter((item) => item.char.length === 1 && !isLessonSlotChar(item.char))
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        writingChars,
      }
    })
}

function buildReadingGroupsFromCatalog(
  chars: CharacterItem[],
  catalog: LessonMeta[]
): LessonReadingGroup[] {
  const byLesson = charsByLesson(chars)
  const groups = [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const readingChars = (byLesson.get(lessonNo) ?? [])
        .map((item) => ({ char: String(item.char ?? '').trim() }))
        .filter((item) => item.char.length === 1 && !isLessonSlotChar(item.char))
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        readingChars,
      }
    })
  return appendExtraCharGroupsFromByLesson(groups, byLesson, catalog)
}

function buildVocabularyGroupsFromCatalog(
  words: WordItem[],
  catalog: LessonMeta[]
): LessonVocabularyGroup[] {
  const byLesson = wordsByLesson(words)
  return [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const vocabulary = (byLesson.get(lessonNo) ?? [])
        .map((item) => ({ word: String(item.word ?? '').trim() }))
        .filter((item) => item.word.length > 0 && !isLessonSlotWord(item.word))
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        vocabulary,
      }
    })
}

export function groupsForEditWriting(
  chars: CharacterItem[],
  catalog: LessonMeta[] = []
): LessonWritingGroup[] {
  if (catalog.length > 0) return buildWritingGroupsFromCatalog(chars, catalog)
  return groupWritingChars(chars)
}

export function groupsForEditReading(
  chars: CharacterItem[],
  catalog: LessonMeta[] = []
): LessonReadingGroup[] {
  if (catalog.length > 0) return buildReadingGroupsFromCatalog(chars, catalog)
  return groupReadingChars(chars)
}

export function groupsForEditVocabulary(
  words: WordItem[],
  catalog: LessonMeta[] = []
): LessonVocabularyGroup[] {
  if (catalog.length > 0) return buildVocabularyGroupsFromCatalog(words, catalog)
  return groupVocabulary(words)
}

function toExpandedCharEntry(item: CharacterItem): ExpandedCharEntry {
  const { lessonNo: _lessonNo, index: _index, ...rest } = item
  return rest
}

function toExpandedWordEntry(item: WordItem): ExpandedWordEntry {
  const { lessonNo: _lessonNo, index: _index, ...rest } = item
  return rest
}

function buildExpandedWritingGroupsFromCatalog(
  chars: CharacterItem[],
  catalog: LessonMeta[]
): LessonExpandedWritingGroup[] {
  const byLesson = charsByLesson(chars)
  return [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const writingChars = (byLesson.get(lessonNo) ?? [])
        .filter((item) => {
          const c = String(item.char ?? '').trim()
          return c.length === 1 && !isLessonSlotChar(c)
        })
        .map(toExpandedCharEntry)
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        writingChars,
      }
    })
}

function buildExpandedReadingGroupsFromCatalog(
  chars: CharacterItem[],
  catalog: LessonMeta[]
): LessonExpandedReadingGroup[] {
  const byLesson = charsByLesson(chars)
  return [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const readingChars = (byLesson.get(lessonNo) ?? [])
        .filter((item) => {
          const c = String(item.char ?? '').trim()
          return c.length === 1 && !isLessonSlotChar(c)
        })
        .map(toExpandedCharEntry)
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        readingChars,
      }
    })
}

function buildExpandedVocabularyGroupsFromCatalog(
  words: WordItem[],
  catalog: LessonMeta[]
): LessonExpandedVocabularyGroup[] {
  const byLesson = wordsByLesson(words)
  return [...catalog]
    .sort((a, b) => a.index - b.index)
    .map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      const vocabulary = (byLesson.get(lessonNo) ?? [])
        .filter((item) => {
          const w = String(item.word ?? '').trim()
          return w.length > 0 && !isLessonSlotWord(w)
        })
        .map(toExpandedWordEntry)
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        vocabulary,
      }
    })
}

function groupExpandedWritingChars(chars: CharacterItem[]): LessonExpandedWritingGroup[] {
  const map = new Map<string, ExpandedCharEntry[]>()
  for (const item of chars) {
    const no = normalizeLessonNo(item.lessonNo)
    const c = String(item.char ?? '').trim()
    if (!isValidLessonNo(no) || c.length !== 1 || isLessonSlotChar(c)) continue
    const list = map.get(no) ?? []
    list.push(toExpandedCharEntry(item))
    map.set(no, list)
  }
  return sortByLessonNo(
    [...map.entries()].map(([lessonNo, writingChars]) => ({ lessonNo, writingChars }))
  ).map((g, i) => ({
    index: i + 1,
    lessonNo: g.lessonNo,
    writingChars: g.writingChars,
  }))
}

function groupExpandedReadingChars(chars: CharacterItem[]): LessonExpandedReadingGroup[] {
  const map = new Map<string, ExpandedCharEntry[]>()
  for (const item of chars) {
    const no = normalizeLessonNo(item.lessonNo)
    const c = String(item.char ?? '').trim()
    if (!isValidLessonNo(no) || c.length !== 1 || isLessonSlotChar(c)) continue
    const list = map.get(no) ?? []
    list.push(toExpandedCharEntry(item))
    map.set(no, list)
  }
  return sortByLessonNo(
    [...map.entries()].map(([lessonNo, readingChars]) => ({ lessonNo, readingChars }))
  ).map((g, i) => ({
    index: i + 1,
    lessonNo: g.lessonNo,
    readingChars: g.readingChars,
  }))
}

function groupExpandedVocabulary(words: WordItem[]): LessonExpandedVocabularyGroup[] {
  const map = new Map<string, ExpandedWordEntry[]>()
  for (const item of words) {
    const no = normalizeLessonNo(item.lessonNo)
    const w = String(item.word ?? '').trim()
    if (!isValidLessonNo(no) || w.length === 0 || isLessonSlotWord(w)) continue
    const list = map.get(no) ?? []
    list.push(toExpandedWordEntry(item))
    map.set(no, list)
  }
  return sortByLessonNo(
    [...map.entries()].map(([lessonNo, vocabulary]) => ({ lessonNo, vocabulary }))
  ).map((g, i) => ({
    index: i + 1,
    lessonNo: g.lessonNo,
    vocabulary: g.vocabulary,
  }))
}

export function groupsForExpandedWriting(
  chars: CharacterItem[],
  catalog: LessonMeta[] = []
): LessonExpandedWritingGroup[] {
  const real = chars.filter((c) => !isLessonSlotChar(c.char))
  if (catalog.length > 0) return buildExpandedWritingGroupsFromCatalog(real, catalog)
  return groupExpandedWritingChars(real)
}

export function groupsForExpandedReading(
  chars: CharacterItem[],
  catalog: LessonMeta[] = []
): LessonExpandedReadingGroup[] {
  const real = chars.filter((c) => !isLessonSlotChar(c.char))
  if (catalog.length > 0) return buildExpandedReadingGroupsFromCatalog(real, catalog)
  return groupExpandedReadingChars(real)
}

export function groupsForExpandedVocabulary(
  words: WordItem[],
  catalog: LessonMeta[] = []
): LessonExpandedVocabularyGroup[] {
  const real = words.filter((w) => !isLessonSlotWord(w.word))
  if (catalog.length > 0) return buildExpandedVocabularyGroupsFromCatalog(real, catalog)
  return groupExpandedVocabulary(real)
}

export function flattenExpandedWritingGroups(groups: LessonExpandedWritingGroup[]): CharacterItem[] {
  const items: CharacterItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    for (const entry of group.writingChars) {
      const char = String(entry.char ?? '').trim()
      if (char.length === 1 && !isLessonSlotChar(char)) {
        items.push({ ...entry, char, lessonNo, index })
      }
    }
  }
  return items
}

export function flattenExpandedReadingGroups(groups: LessonExpandedReadingGroup[]): CharacterItem[] {
  const items: CharacterItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    for (const entry of group.readingChars) {
      const char = String(entry.char ?? '').trim()
      if (char.length === 1 && !isLessonSlotChar(char)) {
        items.push({ ...entry, char, lessonNo, index })
      }
    }
  }
  return items
}

export function flattenExpandedVocabularyGroups(
  groups: LessonExpandedVocabularyGroup[]
): WordItem[] {
  const items: WordItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    for (const entry of group.vocabulary) {
      const word = String(entry.word ?? '').trim()
      if (word.length > 0 && !isLessonSlotWord(word)) {
        items.push({ ...entry, word, lessonNo, index })
      }
    }
  }
  return items
}

function compareGroupOrder(
  a: { index?: number; lessonNo: string },
  b: { index?: number; lessonNo: string }
): number {
  const ai = a.index && a.index > 0 ? a.index : Number.POSITIVE_INFINITY
  const bi = b.index && b.index > 0 ? b.index : Number.POSITIVE_INFINITY
  if (ai !== bi) return ai - bi
  return compareLessonNo(a.lessonNo, b.lessonNo)
}

function groupWritingChars(chars: CharacterItem[]): LessonWritingGroup[] {
  const map = new Map<string, { index?: number; writingChars: GroupedCharEntry[] }>()
  for (const { lessonNo, char, index } of chars) {
    const no = normalizeLessonNo(lessonNo)
    const c = String(char ?? '').trim()
    if (!isValidLessonNo(no) || c.length !== 1 || isLessonSlotChar(c)) continue
    const prev = map.get(no) ?? { writingChars: [] }
    if (prev.index === undefined && index && index > 0) prev.index = index
    prev.writingChars.push({ char: c })
    map.set(no, prev)
  }
  return [...map.entries()]
    .map(([lessonNo, g]) => ({ lessonNo, index: g.index, writingChars: g.writingChars }))
    .sort(compareGroupOrder)
    .map((g, i) => ({
      index: i + 1,
      lessonNo: g.lessonNo,
      writingChars: g.writingChars,
    }))
}

function groupReadingChars(chars: CharacterItem[]): LessonReadingGroup[] {
  const map = new Map<string, { index?: number; readingChars: GroupedCharEntry[] }>()
  for (const { lessonNo, char, index } of chars) {
    const no = normalizeLessonNo(lessonNo)
    const c = String(char ?? '').trim()
    if (!isValidLessonNo(no) || c.length !== 1 || isLessonSlotChar(c)) continue
    const prev = map.get(no) ?? { readingChars: [] }
    if (prev.index === undefined && index && index > 0) prev.index = index
    prev.readingChars.push({ char: c })
    map.set(no, prev)
  }
  return [...map.entries()]
    .map(([lessonNo, g]) => ({ lessonNo, index: g.index, readingChars: g.readingChars }))
    .sort(compareGroupOrder)
    .map((g, i) => ({
      index: i + 1,
      lessonNo: g.lessonNo,
      readingChars: g.readingChars,
    }))
}

function groupVocabulary(words: WordItem[]): LessonVocabularyGroup[] {
  const map = new Map<string, { index?: number; vocabulary: GroupedWordEntry[] }>()
  for (const { lessonNo, word, index } of words) {
    const no = normalizeLessonNo(lessonNo)
    const w = String(word ?? '').trim()
    if (!isValidLessonNo(no) || w.length === 0 || isLessonSlotWord(w)) continue
    const prev = map.get(no) ?? { vocabulary: [] }
    if (prev.index === undefined && index && index > 0) prev.index = index
    prev.vocabulary.push({ word: w })
    map.set(no, prev)
  }
  return [...map.entries()]
    .map(([lessonNo, g]) => ({ lessonNo, index: g.index, vocabulary: g.vocabulary }))
    .sort(compareGroupOrder)
    .map((g, i) => ({
      index: i + 1,
      lessonNo: g.lessonNo,
      vocabulary: g.vocabulary,
    }))
}

export function flattenWritingGroups(groups: LessonWritingGroup[]): CharacterItem[] {
  const items: CharacterItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    let hasRealChar = false
    for (const entry of group.writingChars) {
      const char = String(entry.char ?? '').trim()
      if (char.length === 1 && !isLessonSlotChar(char)) {
        items.push({ char, lessonNo, index })
        hasRealChar = true
      }
    }
    if (!hasRealChar) {
      items.push({ char: LESSON_SLOT_CHAR, lessonNo, index })
    }
  }
  // 保持分组顺序与 index，不按课次号重排
  return items
}

export function flattenReadingGroups(groups: LessonReadingGroup[]): CharacterItem[] {
  const items: CharacterItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    let hasRealChar = false
    for (const entry of group.readingChars) {
      const char = String(entry.char ?? '').trim()
      if (char.length === 1 && !isLessonSlotChar(char)) {
        items.push({ char, lessonNo, index })
        hasRealChar = true
      }
    }
    if (!hasRealChar) {
      items.push({ char: LESSON_SLOT_CHAR, lessonNo, index })
    }
  }
  return items
}

export function flattenVocabularyGroups(groups: LessonVocabularyGroup[]): WordItem[] {
  const items: WordItem[] = []
  for (const group of groups) {
    const lessonNo = normalizeLessonNo(group.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const index = group.index > 0 ? group.index : undefined
    let hasRealWord = false
    for (const entry of group.vocabulary) {
      const word = String(entry.word ?? '').trim()
      if (word.length > 0 && !isLessonSlotWord(word)) {
        items.push({ word, lessonNo, index })
        hasRealWord = true
      }
    }
    if (!hasRealWord) {
      items.push({ word: LESSON_SLOT_WORD, lessonNo, index })
    }
  }
  return items
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseCharStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const items: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const char = entry.trim()
      if (char.length === 1 && !isLessonSlotChar(char)) items.push(char)
    } else if (isRecord(entry)) {
      const char = String(entry.char ?? '').trim()
      if (char.length === 1 && !isLessonSlotChar(char)) items.push(char)
    }
  }
  return items
}

function parseWordStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const items: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const word = entry.trim()
      if (word.length > 0 && !isLessonSlotWord(word)) items.push(word)
    } else if (isRecord(entry)) {
      const word = String(entry.word ?? '').trim()
      if (word.length > 0 && !isLessonSlotWord(word)) items.push(word)
    }
  }
  return items
}

function parseGroupIndex(row: Record<string, unknown>, fallback: number): number {
  const index = Number(row.index)
  return index > 0 ? index : fallback
}

function parseCharEntries(raw: unknown): GroupedCharEntry[] {
  return parseCharStrings(raw).map((char) => ({ char }))
}

function parseWordEntries(raw: unknown): GroupedWordEntry[] {
  return parseWordStrings(raw).map((word) => ({ word }))
}

function parseGroupLessonNo(row: Record<string, unknown>): string {
  return normalizeLessonNo(row.lessonNo)
}

export function parseWritingGroupsFromJson(parsed: unknown): CharacterItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('writingChars' in first || 'chars' in first)) {
      const groups: LessonWritingGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          writingChars: parseCharEntries(row.writingChars ?? row.chars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenWritingGroups(groups)
    }
    return mergeChars([], parsed as CharacterItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonWritingGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          writingChars: parseCharEntries(row.chars ?? row.writingChars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenWritingGroups(groups)
    }
    if (Array.isArray(parsed.writingChars)) {
      return parseWritingGroupsFromJson(parsed.writingChars)
    }
    if (Array.isArray(parsed.chars)) {
      return mergeChars([], parsed.chars as CharacterItem[])
    }
  }

  return []
}

export function parseReadingGroupsFromJson(parsed: unknown): CharacterItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('readingChars' in first || 'chars' in first)) {
      const groups: LessonReadingGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          readingChars: parseCharEntries(row.readingChars ?? row.chars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenReadingGroups(groups)
    }
    return mergeChars([], parsed as CharacterItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonReadingGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          readingChars: parseCharEntries(row.chars ?? row.readingChars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenReadingGroups(groups)
    }
    if (Array.isArray(parsed.readingChars)) {
      return parseReadingGroupsFromJson(parsed.readingChars)
    }
    if (Array.isArray(parsed.chars)) {
      return mergeChars([], parsed.chars as CharacterItem[])
    }
  }

  return []
}

export function parseVocabularyGroupsFromJson(parsed: unknown): WordItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('vocabulary' in first || 'words' in first)) {
      const groups: LessonVocabularyGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          vocabulary: parseWordEntries(row.vocabulary ?? row.words),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenVocabularyGroups(groups)
    }
    return mergeWords([], parsed as WordItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonVocabularyGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          vocabulary: parseWordEntries(row.words ?? row.vocabulary),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenVocabularyGroups(groups)
    }
    if (Array.isArray(parsed.vocabulary)) {
      return parseVocabularyGroupsFromJson(parsed.vocabulary)
    }
    if (Array.isArray(parsed.words)) {
      return mergeWords([], parsed.words as WordItem[])
    }
  }

  return []
}

function parseExpandedCharEntries(raw: unknown): ExpandedCharEntry[] {
  if (!Array.isArray(raw)) return []
  const result: ExpandedCharEntry[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const char = String(entry.char ?? '').trim()
    if (char.length !== 1 || isLessonSlotChar(char)) continue
    const { lessonNo: _ln, index: _idx, ...rest } = entry
    result.push({ ...rest, char } as ExpandedCharEntry)
  }
  return result
}

function parseExpandedWordEntries(raw: unknown): ExpandedWordEntry[] {
  if (!Array.isArray(raw)) return []
  const result: ExpandedWordEntry[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const word = String(entry.word ?? '').trim()
    if (word.length === 0 || isLessonSlotWord(word)) continue
    const { lessonNo: _ln, index: _idx, ...rest } = entry
    result.push({ ...rest, word } as ExpandedWordEntry)
  }
  return result
}

export function parseExpandedWritingGroupsFromJson(parsed: unknown): CharacterItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('writingChars' in first || 'chars' in first)) {
      const groups: LessonExpandedWritingGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          writingChars: parseExpandedCharEntries(row.writingChars ?? row.chars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedWritingGroups(groups)
    }
    return mergeChars([], parsed as CharacterItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonExpandedWritingGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          writingChars: parseExpandedCharEntries(row.chars ?? row.writingChars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedWritingGroups(groups)
    }
    if (Array.isArray(parsed.writingChars)) {
      return parseExpandedWritingGroupsFromJson(parsed.writingChars)
    }
    if (Array.isArray(parsed.chars)) {
      return mergeChars([], parsed.chars as CharacterItem[])
    }
  }

  return []
}

export function parseExpandedReadingGroupsFromJson(parsed: unknown): CharacterItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('readingChars' in first || 'chars' in first)) {
      const groups: LessonExpandedReadingGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          readingChars: parseExpandedCharEntries(row.readingChars ?? row.chars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedReadingGroups(groups)
    }
    return mergeChars([], parsed as CharacterItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonExpandedReadingGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          readingChars: parseExpandedCharEntries(row.chars ?? row.readingChars),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedReadingGroups(groups)
    }
    if (Array.isArray(parsed.readingChars)) {
      return parseExpandedReadingGroupsFromJson(parsed.readingChars)
    }
    if (Array.isArray(parsed.chars)) {
      return mergeChars([], parsed.chars as CharacterItem[])
    }
  }

  return []
}

export function parseExpandedVocabularyGroupsFromJson(parsed: unknown): WordItem[] {
  if (Array.isArray(parsed)) {
    const first = parsed[0]
    if (isRecord(first) && 'lessonNo' in first && ('vocabulary' in first || 'words' in first)) {
      const groups: LessonExpandedVocabularyGroup[] = parsed
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          vocabulary: parseExpandedWordEntries(row.vocabulary ?? row.words),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedVocabularyGroups(groups)
    }
    return mergeWords([], parsed as WordItem[])
  }

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.lessons)) {
      const groups: LessonExpandedVocabularyGroup[] = parsed.lessons
        .filter(isRecord)
        .map((row, i) => ({
          index: parseGroupIndex(row, i + 1),
          lessonNo: parseGroupLessonNo(row),
          title: typeof row.title === 'string' ? row.title.trim() : undefined,
          vocabulary: parseExpandedWordEntries(row.words ?? row.vocabulary),
        }))
        .filter((group) => isValidLessonNo(group.lessonNo))
      return flattenExpandedVocabularyGroups(groups)
    }
    if (Array.isArray(parsed.vocabulary)) {
      return parseExpandedVocabularyGroupsFromJson(parsed.vocabulary)
    }
    if (Array.isArray(parsed.words)) {
      return mergeWords([], parsed.words as WordItem[])
    }
  }

  return []
}

function mergeItemsPreserveOrder<T extends { lessonNo: string }>(
  existing: T[],
  incoming: T[],
  getKey: (item: T) => string
): T[] {
  const result: T[] = []
  const seen = new Set<string>()

  for (const item of [...existing, ...incoming]) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function groupByLessonNo<T extends { lessonNo: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const list = map.get(lessonNo) ?? []
    list.push({ ...item, lessonNo })
    map.set(lessonNo, list)
  }
  return map
}

export function mergeChars(existing: CharacterItem[], incoming: CharacterItem[]): CharacterItem[] {
  const existingByLesson = groupByLessonNo(existing)
  const incomingByLesson = groupByLessonNo(incoming)
  const allLessonNos = new Set([...existingByLesson.keys(), ...incomingByLesson.keys()])
  const result: CharacterItem[] = []

  for (const lessonNo of [...allLessonNos].sort(compareLessonNo)) {
    const ext = existingByLesson.get(lessonNo) ?? []
    const inc = incomingByLesson.get(lessonNo) ?? []
    const extReal = ext.filter((item) => !isLessonSlotChar(item.char))
    const incReal = inc.filter((item) => !isLessonSlotChar(item.char))
    const incHasSlot = inc.some((item) => isLessonSlotChar(item.char))

    if (incReal.length > 0) {
      result.push(...mergeItemsPreserveOrder(extReal, incReal, (item) => item.char))
    } else if (incHasSlot) {
      result.push(...inc)
    } else if (extReal.length > 0) {
      result.push(...extReal)
    } else if (inc.length > 0) {
      result.push(...inc)
    } else {
      result.push(...ext)
    }
  }

  return result
}

export function mergeWords(existing: WordItem[], incoming: WordItem[]): WordItem[] {
  const existingByLesson = groupByLessonNo(existing)
  const incomingByLesson = groupByLessonNo(incoming)
  const allLessonNos = new Set([...existingByLesson.keys(), ...incomingByLesson.keys()])
  const result: WordItem[] = []

  for (const lessonNo of [...allLessonNos].sort(compareLessonNo)) {
    const ext = existingByLesson.get(lessonNo) ?? []
    const inc = incomingByLesson.get(lessonNo) ?? []
    const extReal = ext.filter((item) => !isLessonSlotWord(item.word))
    const incReal = inc.filter((item) => !isLessonSlotWord(item.word))
    const incHasSlot = inc.some((item) => isLessonSlotWord(item.word))

    if (incReal.length > 0) {
      result.push(...mergeItemsPreserveOrder(extReal, incReal, (item) => item.word))
    } else if (incHasSlot) {
      result.push(...inc)
    } else if (extReal.length > 0) {
      result.push(...extReal)
    } else if (inc.length > 0) {
      result.push(...inc)
    } else {
      result.push(...ext)
    }
  }

  return result
}

export function alignCharsWithCatalog(
  chars: CharacterItem[],
  catalogLessons: LessonMeta[]
): CharacterItem[] {
  if (catalogLessons.length === 0) return chars

  const byLesson = new Map<string, CharacterItem[]>()

  for (const item of chars) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const list = byLesson.get(lessonNo) ?? []
    list.push({ ...item, lessonNo })
    byLesson.set(lessonNo, list)
  }

  const result: CharacterItem[] = []
  const sortedCatalog = [...catalogLessons].sort((a, b) => a.index - b.index)

  for (const lesson of sortedCatalog) {
    const lessonNo = normalizeLessonNo(lesson.lessonNo)
    const items = byLesson.get(lessonNo) ?? []
    const real = items.filter((item) => !isLessonSlotChar(item.char))
    if (real.length > 0) {
      result.push(...real)
    } else {
      result.push({ char: LESSON_SLOT_CHAR, lessonNo })
    }
    byLesson.delete(lessonNo)
  }

  for (const lessonNo of [...byLesson.keys()].sort(compareLessonNo)) {
    const items = byLesson.get(lessonNo) ?? []
    const real = items.filter((item) => !isLessonSlotChar(item.char))
    if (real.length > 0) result.push(...real)
  }

  return result
}

export function alignWordsWithCatalog(words: WordItem[], catalogLessons: LessonMeta[]): WordItem[] {
  if (catalogLessons.length === 0) return words

  const byLesson = new Map<string, WordItem[]>()

  for (const item of words) {
    const lessonNo = normalizeLessonNo(item.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue
    const list = byLesson.get(lessonNo) ?? []
    list.push({ ...item, lessonNo })
    byLesson.set(lessonNo, list)
  }

  const result: WordItem[] = []
  const sortedCatalog = [...catalogLessons].sort((a, b) => a.index - b.index)

  for (const lesson of sortedCatalog) {
    const lessonNo = normalizeLessonNo(lesson.lessonNo)
    const items = byLesson.get(lessonNo) ?? []
    const real = items.filter((item) => !isLessonSlotWord(item.word))
    if (real.length > 0) {
      result.push(...real)
    } else {
      result.push({ word: LESSON_SLOT_WORD, lessonNo })
    }
    byLesson.delete(lessonNo)
  }

  for (const lessonNo of [...byLesson.keys()].sort(compareLessonNo)) {
    const items = byLesson.get(lessonNo) ?? []
    const real = items.filter((item) => !isLessonSlotWord(item.word))
    if (real.length > 0) result.push(...real)
  }

  return result
}

export function mergeCharsWithCatalog(
  existing: CharacterItem[],
  incoming: CharacterItem[],
  catalogLessons: LessonMeta[]
): CharacterItem[] {
  const merged = mergeChars(existing, incoming)
  return catalogLessons.length > 0 ? alignCharsWithCatalog(merged, catalogLessons) : merged
}

export function mergeWordsWithCatalog(
  existing: WordItem[],
  incoming: WordItem[],
  catalogLessons: LessonMeta[]
): WordItem[] {
  const merged = mergeWords(existing, incoming)
  return catalogLessons.length > 0 ? alignWordsWithCatalog(merged, catalogLessons) : merged
}

export function mergeLessons(existing: LessonMeta[], incoming: LessonMeta[]): LessonMeta[] {
  const map = new Map(existing.map((l) => [normalizeLessonNo(l.lessonNo), l]))
  for (const l of incoming) map.set(normalizeLessonNo(l.lessonNo), { ...l, lessonNo: normalizeLessonNo(l.lessonNo) })
  return sortByLessonNo([...map.values()])
}

/** 续传目录时，将新识别批次中的语文园地续编课次，避免与已有「语文园地-N」冲突后被合并丢弃 */
function renumberIncomingGardens(existing: LessonMeta[], incoming: LessonMeta[]): LessonMeta[] {
  let gardenSeq = existing.filter((l) => isGardenTitle(l.title)).length
  return incoming.map((lesson) => {
    if (!isGardenTitle(lesson.title)) return lesson
    gardenSeq++
    return {
      ...lesson,
      lessonNo: formatGardenLessonNo(gardenSeq),
      title: `语文园地${cnOrdinal(gardenSeq)}`,
    }
  })
}

export function mergeCatalogLessons(existing: LessonMeta[], incoming: LessonMeta[]): LessonMeta[] {
  if (incoming.length === 0) return existing
  if (existing.length === 0) return incoming

  const adjustedIncoming = renumberIncomingGardens(existing, incoming)

  const existingByNo = new Map(existing.map((l) => [normalizeLessonNo(l.lessonNo), l]))
  const hasNoCollision = adjustedIncoming.every((l) => {
    const no = normalizeLessonNo(l.lessonNo)
    const prev = existingByNo.get(no)
    return prev === undefined || prev.title === l.title
  })

  let adjusted = adjustedIncoming.map((l) => ({ ...l, lessonNo: normalizeLessonNo(l.lessonNo) }))
  if (!hasNoCollision) {
    const maxExisting = Math.max(...existing.map((l) => lessonNoToMergeValue(l.lessonNo)))
    const minIncoming = Math.min(...incoming.map((l) => lessonNoToMergeValue(l.lessonNo)))
    adjusted = adjusted.map((l) => ({
      ...l,
      lessonNo: shiftLessonNoForMerge(l.lessonNo, maxExisting, minIncoming),
    }))
  }

  // 按完整 lessonNo（含前缀）匹配；同号同标题才覆盖，否则追加，允许跨单元印刷序号重复
  const result = [...existing]
  const byNo = new Map(existing.map((l) => [normalizeLessonNo(l.lessonNo), l]))
  for (const lesson of adjusted) {
    const no = normalizeLessonNo(lesson.lessonNo)
    const prev = byNo.get(no)
    if (prev && prev.title === lesson.title) {
      if (lesson.title) prev.title = lesson.title
      if (lesson.index) prev.index = lesson.index
    } else if (prev && !lesson.title) {
      if (lesson.index) prev.index = lesson.index
    } else if (!prev) {
      result.push({ ...lesson, lessonNo: no })
      byNo.set(no, lesson)
    } else {
      // 同号不同标题：保留已有，追加新课（前缀不同时 no 本应不同；无前缀冲突时仍追加）
      result.push({ ...lesson, lessonNo: no })
    }
  }

  return reorderCatalogLessons(result)
}

export interface LessonMergeRow {
  index: number
  lessonNo: string
  title: string
  writingChars: string
  readingChars: string
  vocabulary: string
}

export function buildLessonMergeRows(workspace: Workspace): LessonMergeRow[] {
  const catalog = [...workspace.catalog.lessons].sort((a, b) => a.index - b.index)
  if (catalog.length > 0) {
    return catalog.map((lesson, i) => {
      const lessonNo = normalizeLessonNo(lesson.lessonNo)
      return {
        index: i + 1,
        lessonNo,
        title: lesson.title,
        writingChars: workspace.writingChars
          .filter((c) => normalizeLessonNo(c.lessonNo) === lessonNo && !isLessonSlotChar(c.char))
          .map((c) => c.char)
          .join('、'),
        readingChars: workspace.readingChars
          .filter((c) => normalizeLessonNo(c.lessonNo) === lessonNo && !isLessonSlotChar(c.char))
          .map((c) => c.char)
          .join('、'),
        vocabulary: workspace.vocabulary
          .filter((w) => normalizeLessonNo(w.lessonNo) === lessonNo && !isLessonSlotWord(w.word))
          .map((w) => w.word)
          .join('、'),
      }
    })
  }

  const lessonNos = new Set<string>()
  workspace.writingChars.forEach((c) => lessonNos.add(normalizeLessonNo(c.lessonNo)))
  workspace.readingChars.forEach((c) => lessonNos.add(normalizeLessonNo(c.lessonNo)))
  workspace.vocabulary.forEach((w) => lessonNos.add(normalizeLessonNo(w.lessonNo)))

  return [...lessonNos]
    .sort(compareLessonNo)
    .map((lessonNo, i) => ({
      index: i + 1,
      lessonNo,
      title: '',
      writingChars: workspace.writingChars
        .filter((c) => normalizeLessonNo(c.lessonNo) === lessonNo && !isLessonSlotChar(c.char))
        .map((c) => c.char)
        .join('、'),
      readingChars: workspace.readingChars
        .filter((c) => normalizeLessonNo(c.lessonNo) === lessonNo && !isLessonSlotChar(c.char))
        .map((c) => c.char)
        .join('、'),
      vocabulary: workspace.vocabulary
        .filter((w) => normalizeLessonNo(w.lessonNo) === lessonNo && !isLessonSlotWord(w.word))
        .map((w) => w.word)
        .join('、'),
    }))
}

export function parseCharsFromText(text: string, lessonNo: string): CharacterItem[] {
  const no = normalizeLessonNo(lessonNo)
  return text
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter((c) => c.length === 1)
    .map((char) => ({ char, lessonNo: no }))
}

export function parseWordsFromText(text: string, lessonNo: string): WordItem[] {
  const no = normalizeLessonNo(lessonNo)
  return text
    .split(/[、,，]+/)
    .map((s) => s.trim())
    .filter((w) => w.length > 0)
    .map((word) => ({ word, lessonNo: no }))
}

export interface LessonMergedPayload {
  lessonNo: string
  title: string
  writingChars: Array<Omit<CharacterItem, 'lessonNo'>>
  readingChars: Array<Omit<CharacterItem, 'lessonNo'>>
  vocabulary: WordItem[]
}

export interface LessonGroupedPayload {
  index?: number
  lessonNo: string
  title?: string
  writing?: GroupedCharEntry[]
  reading?: GroupedCharEntry[]
  vocabulary?: GroupedWordEntry[]
}

export function buildMergedLessonPayload(workspace: Workspace): LessonMergedPayload[] {
  return mergeRowsToMergedPayload(buildLessonMergeRows(workspace))
}

export function mergeRowsToMergedPayload(rows: LessonMergeRow[]): LessonMergedPayload[] {
  return rows.map((row) => ({
    lessonNo: normalizeLessonNo(row.lessonNo),
    title: row.title.trim(),
    writingChars: parseCharsFromText(row.writingChars, row.lessonNo).map(
      ({ lessonNo: _lessonNo, ...rest }) => rest
    ),
    readingChars: parseCharsFromText(row.readingChars, row.lessonNo).map(
      ({ lessonNo: _lessonNo, ...rest }) => rest
    ),
    vocabulary: parseWordsFromText(row.vocabulary, row.lessonNo),
  }))
}

export function buildLessonGroupedPayload(workspace: Workspace): LessonGroupedPayload[] {
  return mergeRowsToGroupedPayload(buildLessonMergeRows(workspace))
}

export function mergeRowsToGroupedPayload(rows: LessonMergeRow[]): LessonGroupedPayload[] {
  return rows.map((row) => ({
    index: row.index,
    lessonNo: normalizeLessonNo(row.lessonNo),
    title: row.title || undefined,
    writing: parseCharsFromText(row.writingChars, row.lessonNo).map(({ char }) => ({ char })),
    reading: parseCharsFromText(row.readingChars, row.lessonNo).map(({ char }) => ({ char })),
    vocabulary: parseWordsFromText(row.vocabulary, row.lessonNo).map(({ word }) => ({ word })),
  }))
}

export function parseMergedLessonsFromJson(
  parsed: unknown
): Pick<Workspace, 'catalog' | 'writingChars' | 'readingChars' | 'vocabulary'> {
  const lessonsRaw = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.lessons)
      ? parsed.lessons
      : null

  if (!lessonsRaw) {
    throw new Error('JSON 格式无效，请使用 [{ "lessonNo": "1", "title": "...", "writingChars": [], "readingChars": [], "vocabulary": [] }]')
  }

  const lessons: LessonMeta[] = []
  const writingChars: CharacterItem[] = []
  const readingChars: CharacterItem[] = []
  const vocabulary: WordItem[] = []

  for (const entry of lessonsRaw) {
    if (!isRecord(entry)) continue
    const lessonNo = normalizeLessonNo(entry.lessonNo)
    if (!isValidLessonNo(lessonNo)) continue

    const title = String(entry.title ?? '').trim()
    if (title) lessons.push({ index: lessons.length + 1, lessonNo, title })

    for (const item of parseCharEntries(entry.writingChars ?? entry.writing)) {
      writingChars.push({ ...item, lessonNo })
    }
    for (const item of parseCharEntries(entry.readingChars ?? entry.reading)) {
      readingChars.push({ ...item, lessonNo })
    }
    for (const item of parseWordEntries(entry.vocabulary ?? entry.words)) {
      vocabulary.push({ ...item, lessonNo })
    }
  }

  return {
    catalog: { lessons },
    writingChars,
    readingChars,
    vocabulary,
  }
}

export interface PreMergeWorkspacePayload {
  catalog: Workspace['catalog']
  writingChars: LessonWritingGroup[]
  readingChars: LessonReadingGroup[]
  vocabulary: LessonVocabularyGroup[]
}

export function buildPreMergeWorkspacePayload(workspace: Workspace): PreMergeWorkspacePayload {
  return {
    catalog: workspace.catalog,
    writingChars: groupsForEditWriting(workspace.writingChars, workspace.catalog.lessons),
    readingChars: groupsForEditReading(workspace.readingChars, workspace.catalog.lessons),
    vocabulary: groupsForEditVocabulary(workspace.vocabulary, workspace.catalog.lessons),
  }
}

export function applyMergeRows(
  rows: LessonMergeRow[],
  existing: Pick<Workspace, 'writingChars' | 'readingChars' | 'vocabulary' | 'catalog'>
): Pick<Workspace, 'writingChars' | 'readingChars' | 'vocabulary' | 'catalog'> {
  const writingChars: CharacterItem[] = []
  const readingChars: CharacterItem[] = []
  const vocabulary: WordItem[] = []
  const lessons: LessonMeta[] = []

  for (const row of rows) {
    const lessonNo = normalizeLessonNo(row.lessonNo)
    if (row.title) {
      lessons.push({ index: row.index, lessonNo, title: row.title })
    }
    writingChars.push(...parseCharsFromText(row.writingChars, lessonNo))
    readingChars.push(...parseCharsFromText(row.readingChars, lessonNo))
    vocabulary.push(...parseWordsFromText(row.vocabulary, lessonNo))
  }

  return {
    catalog: { lessons: mergeLessons(existing.catalog.lessons, lessons) },
    writingChars,
    readingChars,
    vocabulary,
  }
}
