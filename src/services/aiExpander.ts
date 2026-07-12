import { pinyin } from 'pinyin-pro'
import { chatJSON } from '@/services/openai'
import type { CharacterItem, WordItem, CharExpandConfig, VocabExpandConfig } from '@/types'

const BATCH_SIZE = 15

function getPhoneticOrder(py: string): string {
  const first = py.replace(/[^a-zA-Z]/g, '').charAt(0)
  return first.toUpperCase()
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

export async function expandCharacters(
  chars: CharacterItem[],
  config: CharExpandConfig,
  grade: string,
  onProgress?: (done: number, total: number) => void
): Promise<CharacterItem[]> {
  const result = [...chars]
  const total = chars.length

  for (let i = 0; i < chars.length; i += BATCH_SIZE) {
    const batch = chars.slice(i, i + BATCH_SIZE)
    const charList = batch.map((c) => c.char).join('、')

    const fields = config.charFields.filter((f) => f !== 'phoneticOrder')
    const prompt = `你是${grade}语文教师。为以下生字生成教学资料，严格返回 JSON：
{
  "items": [{
    "char": "字",
    "pinyin": "带声调拼音",
    "radical": "部首",
    "structure": "结构（左右/上下/独体/半包围/全包围等）",
    "words": ["组词${config.wordCount}个"],
    "sentences": ["造句${config.sentenceCount}个，适合${grade}学生，每句10-15字，语句优美"],
    "readings": [{"pinyin": "读音", "words": ["组词"], "sentences": ["造句，每句10-15字，语句优美"]}]
  }]
}
生字：${charList}
多音字用 readings 数组分别给出。造句须含目标字，每句10-15字，语句优美流畅。只返回 JSON。`

    const expanded = await chatJSON<ExpandCharResult>(prompt)

    for (const item of expanded.items) {
      const idx = result.findIndex((c) => c.char === item.char)
      if (idx < 0) continue

      const py = item.pinyin || pinyin(item.char)
      result[idx] = {
        ...result[idx],
        pinyin: fields.includes('pinyin') ? py : result[idx].pinyin,
        phoneticOrder: getPhoneticOrder(py),
        radical: fields.includes('radical') ? item.radical : result[idx].radical,
        structure: fields.includes('structure') ? item.structure : result[idx].structure,
        words: fields.includes('words') ? item.words?.slice(0, config.wordCount) : result[idx].words,
        sentences: fields.includes('sentences')
          ? item.sentences?.slice(0, config.sentenceCount)
          : result[idx].sentences,
        readings: item.readings?.map((r) => ({
          ...r,
          phoneticOrder: getPhoneticOrder(r.pinyin),
        })),
        expanded: true,
      }
    }

    onProgress?.(Math.min(i + BATCH_SIZE, total), total)
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

export async function expandVocabulary(
  words: WordItem[],
  config: VocabExpandConfig,
  grade: string,
  onProgress?: (done: number, total: number) => void
): Promise<WordItem[]> {
  const result = [...words]
  const total = words.length

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const wordList = batch.map((w) => w.word).join('、')

    const prompt = `你是${grade}语文教师。为以下词语生成拓展资料，严格返回 JSON：
{
  "items": [{
    "word": "词语",
    "relatedWords": ["拓展组词${config.vocabWordCount}个"],
    "sentences": ["造句${config.vocabSentenceCount}个，适合${grade}学生，每句10-15字，语句优美"]
  }]
}
词语：${wordList}
造句须含目标词语，每句10-15字，语句优美流畅。只返回 JSON。`

    const expanded = await chatJSON<ExpandVocabResult>(prompt)

    for (const item of expanded.items) {
      const idx = result.findIndex((w) => w.word === item.word)
      if (idx < 0) continue
      result[idx] = {
        ...result[idx],
        relatedWords: item.relatedWords?.slice(0, config.vocabWordCount),
        sentences: item.sentences?.slice(0, config.vocabSentenceCount),
        expanded: true,
      }
    }

    onProgress?.(Math.min(i + BATCH_SIZE, total), total)
  }

  return result
}
