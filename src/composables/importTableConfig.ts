import {
  mergeCharsWithCatalog,
  mergeWordsWithCatalog,
  groupsForEditWriting,
  groupsForEditReading,
  groupsForEditVocabulary,
  groupsForExpandedWriting,
  groupsForExpandedReading,
  groupsForExpandedVocabulary,
  parseExpandedWritingGroupsFromJson,
  parseExpandedReadingGroupsFromJson,
  parseExpandedVocabularyGroupsFromJson,
  isLessonSlotChar,
  isLessonSlotWord,
  parseWritingGroupsFromJson,
  parseReadingGroupsFromJson,
  parseVocabularyGroupsFromJson,
} from '@/services/dataMerger'
import { parseImage } from '@/services/ocrParser'
import type { CharacterItem, LessonMeta, WordItem, Workspace } from '@/types'

export type UploadType = 'catalog' | 'writing' | 'reading' | 'vocabulary'
export type TableUploadType = 'writing' | 'reading' | 'vocabulary'
export type EditMode = 'table' | 'json' | 'expand' | 'expandedJson'

export const EDIT_MODES: EditMode[] = ['table', 'json', 'expand', 'expandedJson']

export const DATA_TYPES: { value: UploadType; label: string }[] = [
  { value: 'catalog', label: '目录' },
  { value: 'writing', label: '写字表（生字）' },
  { value: 'reading', label: '识字表' },
  { value: 'vocabulary', label: '词语表' },
]

export const TABLE_UPLOAD_CONFIG: Record<
  TableUploadType,
  {
    field: 'writingChars' | 'readingChars' | 'vocabulary'
    tableLastKey: 'writing' | 'reading' | 'vocabulary'
    isSlot: (text: string) => boolean
    successMsg: string
    merge: (
      existing: CharacterItem[] | WordItem[],
      incoming: CharacterItem[] | WordItem[],
      catalog: LessonMeta[]
    ) => CharacterItem[] | WordItem[]
    getIncoming: (result: Awaited<ReturnType<typeof parseImage>>) => CharacterItem[] | WordItem[] | undefined
  }
> = {
  writing: {
    field: 'writingChars',
    tableLastKey: 'writing',
    isSlot: isLessonSlotChar,
    successMsg: '写字表识别完成，已归入对应课次',
    merge: (existing, incoming, catalog) =>
      mergeCharsWithCatalog(existing as CharacterItem[], incoming as CharacterItem[], catalog),
    getIncoming: (result) => result.chars as CharacterItem[] | undefined,
  },
  reading: {
    field: 'readingChars',
    tableLastKey: 'reading',
    isSlot: isLessonSlotChar,
    successMsg: '识字表识别完成，已归入对应课次',
    merge: (existing, incoming, catalog) =>
      mergeCharsWithCatalog(existing as CharacterItem[], incoming as CharacterItem[], catalog),
    getIncoming: (result) => result.chars as CharacterItem[] | undefined,
  },
  vocabulary: {
    field: 'vocabulary',
    tableLastKey: 'vocabulary',
    isSlot: isLessonSlotWord,
    successMsg: '词语表识别完成，已归入对应课次',
    merge: (existing, incoming, catalog) =>
      mergeWordsWithCatalog(existing as WordItem[], incoming as WordItem[], catalog),
    getIncoming: (result) => result.words as WordItem[] | undefined,
  },
}

export const JSON_SYNC_HANDLERS: Record<UploadType, (ws: Workspace) => unknown> = {
  catalog: (ws) => ({ lessons: ws.catalog.lessons }),
  writing: (ws) => groupsForEditWriting(ws.writingChars, ws.catalog.lessons),
  reading: (ws) => groupsForEditReading(ws.readingChars, ws.catalog.lessons),
  vocabulary: (ws) => groupsForEditVocabulary(ws.vocabulary, ws.catalog.lessons),
}

export const EXPANDED_JSON_SYNC_HANDLERS: Record<TableUploadType, (ws: Workspace) => unknown> = {
  writing: (ws) => groupsForExpandedWriting(ws.writingChars, ws.catalog.lessons),
  reading: (ws) => groupsForExpandedReading(ws.readingChars, ws.catalog.lessons),
  vocabulary: (ws) => groupsForExpandedVocabulary(ws.vocabulary, ws.catalog.lessons),
}

export const TABLE_JSON_APPLY_CONFIG: Record<
  TableUploadType,
  {
    field: 'writingChars' | 'readingChars' | 'vocabulary'
    parse: (parsed: unknown) => CharacterItem[] | WordItem[]
    errorMsg: string
    successLabel: string
  }
> = {
  writing: {
    field: 'writingChars',
    parse: parseWritingGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "writingChars": [{"char":"昂"}] }]',
    successLabel: '写字表',
  },
  reading: {
    field: 'readingChars',
    parse: parseReadingGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "readingChars": [{"char":"鸳"}] }]',
    successLabel: '识字表',
  },
  vocabulary: {
    field: 'vocabulary',
    parse: parseVocabularyGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "vocabulary": [{"word":"词语"}] }]',
    successLabel: '词语表',
  },
}

export const EXPANDED_JSON_APPLY_CONFIG: Record<
  TableUploadType,
  {
    field: 'writingChars' | 'readingChars' | 'vocabulary'
    parse: (parsed: unknown) => CharacterItem[] | WordItem[]
    errorMsg: string
    itemKey: (item: CharacterItem | WordItem) => string
  }
> = {
  writing: {
    field: 'writingChars',
    parse: parseExpandedWritingGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "writingChars": [{"char":"球","pinyin":"qiú"}] }]',
    itemKey: (item) => `${item.lessonNo}-${(item as CharacterItem).char}`,
  },
  reading: {
    field: 'readingChars',
    parse: parseExpandedReadingGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "readingChars": [{"char":"球","pinyin":"qiú"}] }]',
    itemKey: (item) => `${item.lessonNo}-${(item as CharacterItem).char}`,
  },
  vocabulary: {
    field: 'vocabulary',
    parse: parseExpandedVocabularyGroupsFromJson,
    errorMsg:
      'JSON 格式无效，请使用 [{ "index": 1, "lessonNo": "1", "title": "标题", "vocabulary": [{"word":"皮球","relatedWords":["足球"]}] }]',
    itemKey: (item) => `${item.lessonNo}-${(item as WordItem).word}`,
  },
}

export function isUploadType(value: unknown): value is UploadType {
  return value === 'catalog' || value === 'writing' || value === 'reading' || value === 'vocabulary'
}

export function isEditMode(value: unknown): value is EditMode {
  return typeof value === 'string' && EDIT_MODES.includes(value as EditMode)
}

export function isTableUploadType(value: UploadType): value is TableUploadType {
  return value === 'writing' || value === 'reading' || value === 'vocabulary'
}
