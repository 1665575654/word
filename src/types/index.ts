export interface LessonMeta {
  /** 当前表中的顺序序号（1 起，随增删重排） */
  index: number
  lessonNo: string
  title: string
}

export interface Catalog {
  lessons: LessonMeta[]
}

export interface CharacterReading {
  pinyin: string
  phoneticOrder: string
  words: string[]
  sentences: string[]
}

export interface CharacterItem {
  char: string
  lessonNo: string
  /** 所属课次在当前表中的顺序序号（1 起，随增删重排） */
  index?: number
  pinyin?: string
  phoneticOrder?: string
  radical?: string
  structure?: string
  words?: string[]
  sentences?: string[]
  readings?: CharacterReading[]
  expanded?: boolean
}

export interface WordItem {
  word: string
  lessonNo: string
  /** 所属课次在当前表中的顺序序号（1 起，随增删重排） */
  index?: number
  relatedWords?: string[]
  sentences?: string[]
  expanded?: boolean
}

export interface CharExpandConfig {
  enabled: boolean
  charFields: string[]
  wordCount: number
  sentenceCount: number
}

export interface VocabExpandConfig {
  enabled: boolean
  vocabWordCount: number
  vocabSentenceCount: number
}

export interface ExpandConfig {
  writing: CharExpandConfig
  reading: CharExpandConfig
  vocabulary: VocabExpandConfig
}

export interface WorkspaceMeta {
  /** 年级：'1' ~ '6' */
  grade: string
  /** 册别：上册 / 下册 */
  semester: '上册' | '下册' | ''
  title: string
  createdAt: string
  updatedAt: string
}

export interface TableUploadLastLesson {
  writing?: string
  reading?: string
  vocabulary?: string
}

export interface Workspace {
  id: string
  name: string
  meta: WorkspaceMeta
  catalog: Catalog
  writingChars: CharacterItem[]
  readingChars: CharacterItem[]
  vocabulary: WordItem[]
  /** 每张表最近一次上传图片末尾的课次，用于跨图无序号续行 */
  tableLastLesson?: TableUploadLastLesson
  expandConfig: ExpandConfig
  stage: 'parsed' | 'merged' | 'expanded'
}

export type JwDataType =
  | 'catalog'
  | 'writing'
  | 'reading'
  | 'vocabulary'
  | 'tables'
  | 'merged'
  | 'parsed'
  | 'expanded'

export interface JwDataPayload {
  catalog?: Catalog
  writingChars?: CharacterItem[]
  readingChars?: CharacterItem[]
  vocabulary?: WordItem[]
  expandConfig?: ExpandConfig
}

export interface JwDataFile {
  version: string
  type: JwDataType
  workspace?: Workspace
  payload?: JwDataPayload
}

export const STAGE_LABELS: Record<Workspace['stage'], string> = {
  parsed: '已识别',
  merged: '已合并',
  expanded: '已拓展',
}

export interface AppSettings {
  /** 文本拓展 API Key */
  openaiApiKey: string
  /** 文本拓展 API Base URL */
  openaiBaseUrl: string
  /** 图片识别专用 API Key（可与拓展不同） */
  ocrApiKey: string
  /** 图片识别专用 API Base URL */
  ocrBaseUrl: string
  ocrModel: string
  expandModel: string
  expandConfig: ExpandConfig
}

export type ImageType = 'catalog' | 'writing' | 'reading' | 'vocabulary'

export type DataSourceType = 'writing' | 'reading' | 'vocabulary' | 'combined'

export type ExportOutputFormat = 'xlsx' | 'docx'

export interface BuiltinTemplateConfig {
  id: string
  name: string
  description: string
  category: string
  dataSource: DataSourceType[]
  outputFormat?: ExportOutputFormat
  options: Record<string, unknown>
}

export interface CustomTemplate {
  id: string
  name: string
  fileName: string
  fileData: ArrayBuffer
  placeholders: string[]
  createdAt: string
}

export const DEFAULT_CHAR_EXPAND_CONFIG: CharExpandConfig = {
  enabled: true,
  charFields: ['pinyin', 'phoneticOrder', 'radical', 'structure', 'words', 'sentences'],
  wordCount: 3,
  sentenceCount: 1,
}

export const DEFAULT_VOCAB_EXPAND_CONFIG: VocabExpandConfig = {
  enabled: true,
  vocabWordCount: 3,
  vocabSentenceCount: 1,
}

export const DEFAULT_EXPAND_CONFIG: ExpandConfig = {
  writing: { ...DEFAULT_CHAR_EXPAND_CONFIG },
  reading: { ...DEFAULT_CHAR_EXPAND_CONFIG },
  vocabulary: { ...DEFAULT_VOCAB_EXPAND_CONFIG },
}

/** 将旧版扁平 expandConfig 迁移为三表独立配置 */
export function normalizeExpandConfig(raw: unknown): ExpandConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      writing: { ...DEFAULT_CHAR_EXPAND_CONFIG },
      reading: { ...DEFAULT_CHAR_EXPAND_CONFIG },
      vocabulary: { ...DEFAULT_VOCAB_EXPAND_CONFIG },
    }
  }

  const r = raw as Record<string, unknown>

  if ('charFields' in r || 'wordCount' in r) {
    const charConfig: CharExpandConfig = {
      enabled: true,
      charFields: Array.isArray(r.charFields)
        ? (r.charFields as string[])
        : [...DEFAULT_CHAR_EXPAND_CONFIG.charFields],
      wordCount:
        typeof r.wordCount === 'number' ? r.wordCount : DEFAULT_CHAR_EXPAND_CONFIG.wordCount,
      sentenceCount:
        typeof r.sentenceCount === 'number'
          ? r.sentenceCount
          : DEFAULT_CHAR_EXPAND_CONFIG.sentenceCount,
    }
    const vocabConfig: VocabExpandConfig = {
      enabled: true,
      vocabWordCount:
        typeof r.vocabWordCount === 'number'
          ? r.vocabWordCount
          : DEFAULT_VOCAB_EXPAND_CONFIG.vocabWordCount,
      vocabSentenceCount:
        typeof r.vocabSentenceCount === 'number'
          ? r.vocabSentenceCount
          : DEFAULT_VOCAB_EXPAND_CONFIG.vocabSentenceCount,
    }
    return {
      writing: { ...charConfig },
      reading: { ...charConfig },
      vocabulary: { ...vocabConfig },
    }
  }

  const writing = r.writing as Partial<CharExpandConfig> | undefined
  const reading = r.reading as Partial<CharExpandConfig> | undefined
  const vocabulary = r.vocabulary as Partial<VocabExpandConfig> | undefined

  return {
    writing: { ...DEFAULT_CHAR_EXPAND_CONFIG, ...writing },
    reading: { ...DEFAULT_CHAR_EXPAND_CONFIG, ...reading },
    vocabulary: { ...DEFAULT_VOCAB_EXPAND_CONFIG, ...vocabulary },
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.deepseek.com',
  ocrApiKey: '',
  ocrBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ocrModel: '',
  expandModel: 'deepseek-v4-pro',
  expandConfig: { ...DEFAULT_EXPAND_CONFIG },
}
