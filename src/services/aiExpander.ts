import { pinyin } from 'pinyin-pro'
import { chatJSON } from '@/services/openai'
import { normalizeLessonNo } from '@/services/lessonNoUtils'
import { normalizeStringArray } from '@/utils/stringArray'
import type { CharacterItem, WordItem, CharExpandConfig, VocabExpandConfig } from '@/types'

/** 受模型 max_tokens（如百炼上限 3072）约束，批次过大易截断 JSON 导致无法落库展示 */
export const EXPAND_BATCH_SIZE = 6

export type ExpandProgressHandler = (done: number, total: number) => void

export interface ExpandOptions {
  onProgress?: ExpandProgressHandler
  /** 每批拓展完成后回调，携带当前已拓展条目（含本批及之前批次） */
  onBatchComplete?: (partial: CharacterItem[]) => void | Promise<void>
}

export interface VocabExpandOptions {
  onProgress?: ExpandProgressHandler
  onBatchComplete?: (partial: WordItem[]) => void | Promise<void>
}

export function charItemKey(item: { lessonNo: string; char: string }): string {
  return `${normalizeLessonNo(item.lessonNo)}-${item.char}`
}

export function vocabItemKey(item: { lessonNo: string; word: string }): string {
  return `${normalizeLessonNo(item.lessonNo)}-${item.word}`
}

export function mergeCharPartial(full: CharacterItem[], partial: CharacterItem[]): CharacterItem[] {
  if (partial.length === 0) return full
  const map = new Map(partial.map((c) => [charItemKey(c), c]))
  return full.map((c) => map.get(charItemKey(c)) ?? c)
}

export function mergeVocabPartial(full: WordItem[], partial: WordItem[]): WordItem[] {
  if (partial.length === 0) return full
  const map = new Map(partial.map((w) => [vocabItemKey(w), w]))
  return full.map((w) => map.get(vocabItemKey(w)) ?? w)
}

function normalizeCharExpandOptions(
  options?: ExpandOptions | ExpandProgressHandler
): ExpandOptions {
  if (typeof options === 'function') return { onProgress: options }
  return options ?? {}
}

function normalizeVocabExpandOptions(
  options?: VocabExpandOptions | ExpandProgressHandler
): VocabExpandOptions {
  if (typeof options === 'function') return { onProgress: options }
  return options ?? {}
}

function getPhoneticOrder(py: string): string {
  const first = py.replace(/[^a-zA-Z]/g, '').charAt(0)
  return first.toUpperCase()
}

/** 组词/拓展词组规则：最后一项须为含目标字的四字成语，无则四字词语 */
function buildWordGroupRule(wordCount: number, targetLabel: '生字' | '词语' = '生字'): string {
  if (wordCount <= 0) return ''
  const target = `该${targetLabel}`
  if (wordCount === 1) {
    return `共1个，须为包含${target}的四字成语；若无合适成语则组包含${target}的四字词语`
  }
  return `共${wordCount}个：前${wordCount - 1}个为普通词语（2-3字为宜）；最后1个须为包含${target}的四字成语，若无合适成语则组包含${target}的四字词语`
}

interface ExpandCharResult {
  items: Array<{
    char: string
    pinyin: string
    radical: string
    structure: string
    words: string[]
    sentences: string[]
    readings?: Array<{
      pinyin: string
      words: string[]
      sentences: string[]
    }>
  }>
}

function applyExpandedCharItem(
  target: CharacterItem,
  item: ExpandCharResult['items'][number],
  fields: string[],
  config: CharExpandConfig
): CharacterItem {
  // 模型常把组词/造句只写在 readings 里，页面表格只渲染顶层字段，需回退填充
  const primaryReading = item.readings?.[0]
  const topWords = normalizeStringArray(item.words)
  const topSentences = normalizeStringArray(item.sentences)
  const readingWords = normalizeStringArray(primaryReading?.words)
  const readingSentences = normalizeStringArray(primaryReading?.sentences)
  const py =
    item.pinyin?.trim() ||
    primaryReading?.pinyin?.trim() ||
    pinyin(target.char)

  return {
    ...target,
    pinyin: fields.includes('pinyin') ? py : target.pinyin,
    phoneticOrder: getPhoneticOrder(py),
    radical: fields.includes('radical') ? item.radical : target.radical,
    structure: fields.includes('structure') ? item.structure : target.structure,
    words: fields.includes('words')
      ? (topWords.length > 0 ? topWords : readingWords).slice(0, config.wordCount)
      : normalizeStringArray(target.words),
    sentences: fields.includes('sentences')
      ? (topSentences.length > 0 ? topSentences : readingSentences).slice(
          0,
          config.sentenceCount
        )
      : normalizeStringArray(target.sentences),
    readings: item.readings?.map((r) => ({
      ...r,
      words: normalizeStringArray(r.words),
      sentences: normalizeStringArray(r.sentences),
      phoneticOrder: getPhoneticOrder(r.pinyin),
    })),
    expanded: true,
  }
}

/** 将 AI 返回项对齐到当前批次，优先按顺序匹配，避免重复字误匹配到其他课次 */
function matchBatchCharIndex(
  batch: CharacterItem[],
  item: { char: string },
  aiIndex: number,
  usedIndices: Set<number>
): number {
  if (aiIndex < batch.length && batch[aiIndex].char === item.char && !usedIndices.has(aiIndex)) {
    return aiIndex
  }
  return batch.findIndex((c, idx) => !usedIndices.has(idx) && c.char === item.char)
}

export async function expandCharacters(
  chars: CharacterItem[],
  config: CharExpandConfig,
  grade: string,
  options?: ExpandOptions | ExpandProgressHandler
): Promise<CharacterItem[]> {
  const { onProgress, onBatchComplete } = normalizeCharExpandOptions(options)
  const result = [...chars]
  const total = chars.length

  for (let i = 0; i < chars.length; i += EXPAND_BATCH_SIZE) {
    const batch = chars.slice(i, i + EXPAND_BATCH_SIZE)
    const charList = batch
      .map((c, idx) => `${idx + 1}. ${c.char}（课次 ${normalizeLessonNo(c.lessonNo)}）`)
      .join('\n')

    const fields = config.charFields.filter((f) => f !== 'phoneticOrder')
    const includeWords = fields.includes('words')
    const wordGroupRule = includeWords ? buildWordGroupRule(config.wordCount) : ''
    const prompt = `你是${grade}语文教师。为以下生字生成教学资料。
只返回合法 JSON（UTF-8），禁止 markdown 代码块。字段名必须用英文。标点必须用英文（逗号 , 冒号 : 双引号 "），禁止中文逗号、中文冒号、弯引号。
JSON 结构：
{
  "items": [{
    "char": "字",
    "pinyin": "带声调拼音",
    "radical": "部首",
    "structure": "左右/上下/独体/半包围/全包围等",
    "words": ["组词"],
    "sentences": ["造句"],
    "readings": [{"pinyin": "读音", "words": ["组词"], "sentences": ["造句"]}]
  }]
}
要求：
- items 共 ${batch.length} 条，顺序与下列序号一致，不可遗漏
- words 每字 ${config.wordCount} 个${wordGroupRule ? `；${wordGroupRule}` : ''}
- sentences 每字 ${config.sentenceCount} 个，适合${grade}学生，每句10-15字，须含目标字，语句优美
- 多音字用 readings 分别给出${includeWords ? `；各读音组词均遵守上述组词规则` : ''}
生字：
${charList}`

    const expanded = await chatJSON<ExpandCharResult>(prompt, undefined, { api: 'expand' })

    const usedBatchIndices = new Set<number>()
    for (let j = 0; j < expanded.items.length; j++) {
      const item = expanded.items[j]
      const batchIdx = matchBatchCharIndex(batch, item, j, usedBatchIndices)
      if (batchIdx < 0) continue
      usedBatchIndices.add(batchIdx)
      const idx = i + batchIdx
      result[idx] = applyExpandedCharItem(result[idx], item, fields, config)
    }

    const expandedCount = result.filter((c) => c.expanded).length
    onProgress?.(expandedCount, total)
    await onBatchComplete?.([...result])
  }

  return result
}

interface ExpandVocabResult {
  items: Array<{
    word: string
    relatedWords: string[]
    sentences: string[]
  }>
}

function matchBatchWordIndex(
  batch: WordItem[],
  item: { word: string },
  aiIndex: number,
  usedIndices: Set<number>
): number {
  if (aiIndex < batch.length && batch[aiIndex].word === item.word && !usedIndices.has(aiIndex)) {
    return aiIndex
  }
  return batch.findIndex((w, idx) => !usedIndices.has(idx) && w.word === item.word)
}

export async function expandVocabulary(
  words: WordItem[],
  config: VocabExpandConfig,
  grade: string,
  options?: VocabExpandOptions | ExpandProgressHandler
): Promise<WordItem[]> {
  const { onProgress, onBatchComplete } = normalizeVocabExpandOptions(options)
  const result = [...words]
  const total = words.length

  for (let i = 0; i < words.length; i += EXPAND_BATCH_SIZE) {
    const batch = words.slice(i, i + EXPAND_BATCH_SIZE)
    const wordList = batch
      .map((w, idx) => `${idx + 1}. ${w.word}（课次 ${normalizeLessonNo(w.lessonNo)}）`)
      .join('\n')

    const wordGroupRule = buildWordGroupRule(config.vocabWordCount, '词语')
    const prompt = `你是${grade}语文教师。为以下词语生成拓展资料。
只返回合法 JSON（UTF-8），禁止 markdown 代码块。字段名必须用英文。标点必须用英文（逗号 , 冒号 : 双引号 "），禁止中文逗号、中文冒号、弯引号。
JSON 结构：
{
  "items": [{
    "word": "词语",
    "relatedWords": ["拓展组词"],
    "sentences": ["造句"]
  }]
}
要求：
- items 共 ${batch.length} 条，顺序与下列序号一致，不可遗漏
- relatedWords 每词 ${config.vocabWordCount} 个；${wordGroupRule}
- sentences 每词 ${config.vocabSentenceCount} 个，适合${grade}学生，每句10-15字，须含目标词语，语句优美
词语：
${wordList}`

    const expanded = await chatJSON<ExpandVocabResult>(prompt, undefined, { api: 'expand' })

    const usedBatchIndices = new Set<number>()
    for (let j = 0; j < expanded.items.length; j++) {
      const item = expanded.items[j]
      const batchIdx = matchBatchWordIndex(batch, item, j, usedBatchIndices)
      if (batchIdx < 0) continue
      usedBatchIndices.add(batchIdx)
      const idx = i + batchIdx
      result[idx] = {
        ...result[idx],
        relatedWords: normalizeStringArray(item.relatedWords).slice(0, config.vocabWordCount),
        sentences: normalizeStringArray(item.sentences).slice(0, config.vocabSentenceCount),
        expanded: true,
      }
    }

    const expandedCount = result.filter((w) => w.expanded).length
    onProgress?.(expandedCount, total)
    await onBatchComplete?.([...result])
  }

  return result
}
