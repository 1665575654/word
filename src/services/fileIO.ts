import { saveAs } from 'file-saver'
import type { JwDataFile, JwDataPayload, JwDataType, Workspace } from '@/types'
import { normalizeExpandConfig } from '@/types'
import {
  buildMergedLessonPayload,
  buildPreMergeWorkspacePayload,
  groupsForEditReading,
  groupsForEditVocabulary,
  groupsForEditWriting,
  groupsForExpandedReading,
  groupsForExpandedVocabulary,
  groupsForExpandedWriting,
  parseMergedLessonsFromJson,
  parseReadingGroupsFromJson,
  parseVocabularyGroupsFromJson,
  parseWritingGroupsFromJson,
} from '@/services/dataMerger'
import {
  normalizeChars,
  normalizeLessons,
  normalizeWords,
} from '@/services/ocrParser'
import {
  buildExportFileNameByType,
  buildImportTableExportFileName,
  type ImportTableType,
} from '@/utils/exportName'

const JWDATA_VERSION = '1.1'

/** 上传组件 accept 属性：支持 .json 及旧版 .jwdata */
export const JSON_FILE_ACCEPT = '.json,.jwdata,application/json'

function isJwDataFile(data: unknown): data is JwDataFile {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.version === 'string' && (!!obj.workspace || !!obj.payload)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isGroupedTableArray(data: unknown, field: 'writingChars' | 'readingChars' | 'vocabulary'): boolean {
  if (!Array.isArray(data) || data.length === 0) return false
  const first = data[0]
  return isRecord(first) && 'lessonNo' in first && field in first
}

function isMergedLessonArray(data: unknown): boolean {
  if (!Array.isArray(data) || data.length === 0) return false
  const first = data[0]
  return (
    isRecord(first) &&
    'lessonNo' in first &&
    ('writingChars' in first || 'readingChars' in first || 'vocabulary' in first)
  )
}

function inferTypeFromPayload(data: Record<string, unknown>): JwDataType | null {
  if (isMergedLessonArray(data)) return 'merged'
  if (Array.isArray(data.lessons) || data.catalog) return 'catalog'
  if (Array.isArray(data.chars) || Array.isArray(data.writingChars)) return 'writing'
  if (Array.isArray(data.readingChars)) return 'reading'
  if (Array.isArray(data.words) || Array.isArray(data.vocabulary)) return 'vocabulary'
  if (data.expandConfig) return 'expanded'
  if (
    data.catalog ||
    data.writingChars ||
    data.readingChars ||
    data.vocabulary
  ) {
    return 'merged'
  }
  return null
}

function wrapPlainPayload(
  data: Record<string, unknown>,
  expectedType?: JwDataType
): JwDataFile {
  const type = expectedType ?? inferTypeFromPayload(data)
  if (!type) {
    throw new Error('无法识别 JSON 数据结构，请确认文件内容正确')
  }

  const payload: JwDataPayload = {}

  if (type === 'catalog') {
    const lessons = Array.isArray(data.lessons)
      ? data.lessons
      : (data.catalog as { lessons?: unknown[] })?.lessons ?? data
    payload.catalog = { lessons: normalizeLessons(lessons as import('@/types').LessonMeta[]) }
  } else if (type === 'writing') {
    const source = Array.isArray(data) ? data : data.writingChars ?? data.chars ?? data
    if (Array.isArray(source) && isGroupedTableArray(source, 'writingChars')) {
      payload.writingChars = parseWritingGroupsFromJson(source)
    } else {
      payload.writingChars = normalizeChars(source as import('@/types').CharacterItem[])
    }
  } else if (type === 'reading') {
    const source = Array.isArray(data) ? data : data.readingChars ?? data.chars ?? data
    if (Array.isArray(source) && isGroupedTableArray(source, 'readingChars')) {
      payload.readingChars = parseReadingGroupsFromJson(source)
    } else {
      payload.readingChars = normalizeChars(source as import('@/types').CharacterItem[])
    }
  } else if (type === 'vocabulary') {
    const source = Array.isArray(data) ? data : data.vocabulary ?? data.words ?? data
    if (Array.isArray(source) && isGroupedTableArray(source, 'vocabulary')) {
      payload.vocabulary = parseVocabularyGroupsFromJson(source)
    } else {
      payload.vocabulary = normalizeWords(source as import('@/types').WordItem[])
    }
  } else if (type === 'tables') {
    if (data.writingChars) payload.writingChars = data.writingChars as import('@/types').CharacterItem[]
    if (data.readingChars) payload.readingChars = data.readingChars as import('@/types').CharacterItem[]
    if (data.vocabulary) payload.vocabulary = data.vocabulary as import('@/types').WordItem[]
    if (data.chars && !payload.writingChars) {
      payload.writingChars = normalizeChars(data.chars as import('@/types').CharacterItem[])
    }
    if (data.words && !payload.vocabulary) {
      payload.vocabulary = normalizeWords(data.words as import('@/types').WordItem[])
    }
  } else if (type === 'merged' || type === 'parsed' || type === 'expanded') {
    if (Array.isArray(data.lessons) && isMergedLessonArray(data.lessons)) {
      const parsed = parseMergedLessonsFromJson(data.lessons)
      payload.catalog = parsed.catalog
      payload.writingChars = parsed.writingChars
      payload.readingChars = parsed.readingChars
      payload.vocabulary = parsed.vocabulary
    } else if (data.catalog) {
      payload.catalog = data.catalog as import('@/types').Catalog
      if (Array.isArray(data.writingChars) && isGroupedTableArray(data.writingChars, 'writingChars')) {
        payload.writingChars = parseWritingGroupsFromJson(data.writingChars)
      } else if (data.writingChars) {
        payload.writingChars = data.writingChars as import('@/types').CharacterItem[]
      }
      if (Array.isArray(data.readingChars) && isGroupedTableArray(data.readingChars, 'readingChars')) {
        payload.readingChars = parseReadingGroupsFromJson(data.readingChars)
      } else if (data.readingChars) {
        payload.readingChars = data.readingChars as import('@/types').CharacterItem[]
      }
      if (Array.isArray(data.vocabulary) && isGroupedTableArray(data.vocabulary, 'vocabulary')) {
        payload.vocabulary = parseVocabularyGroupsFromJson(data.vocabulary)
      } else if (data.vocabulary) {
        payload.vocabulary = data.vocabulary as import('@/types').WordItem[]
      }
    } else {
      if (data.writingChars) payload.writingChars = data.writingChars as import('@/types').CharacterItem[]
      if (data.readingChars) payload.readingChars = data.readingChars as import('@/types').CharacterItem[]
      if (data.vocabulary) payload.vocabulary = data.vocabulary as import('@/types').WordItem[]
    }
    if (data.expandConfig) payload.expandConfig = normalizeExpandConfig(data.expandConfig)
  }

  return { version: JWDATA_VERSION, type, payload }
}

export function exportJwData(workspace: Workspace, type: 'parsed' | 'merged' | 'expanded'): void {
  const data: JwDataFile = {
    version: JWDATA_VERSION,
    type,
    workspace: { ...workspace, stage: type },
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildExportFileNameByType(workspace, type))
}

export function exportPartialJwData(
  workspace: Workspace,
  type: Exclude<JwDataType, 'parsed' | 'expanded'>
): void {
  const payload: JwDataPayload = {}

  if (type === 'catalog') {
    payload.catalog = workspace.catalog
  } else if (type === 'writing') {
    payload.writingChars = workspace.writingChars
  } else if (type === 'reading') {
    payload.readingChars = workspace.readingChars
  } else if (type === 'vocabulary') {
    payload.vocabulary = workspace.vocabulary
  } else if (type === 'tables') {
    payload.writingChars = workspace.writingChars
    payload.readingChars = workspace.readingChars
    payload.vocabulary = workspace.vocabulary
  } else if (type === 'merged') {
    payload.catalog = workspace.catalog
    payload.writingChars = workspace.writingChars
    payload.readingChars = workspace.readingChars
    payload.vocabulary = workspace.vocabulary
  }

  const data: JwDataFile = { version: JWDATA_VERSION, type, payload }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildExportFileNameByType(workspace, type))
}

export function exportGroupedTableData(
  workspace: Workspace,
  type: 'writing' | 'reading' | 'vocabulary'
): void {
  const catalog = workspace.catalog.lessons
  const data =
    type === 'writing'
      ? groupsForEditWriting(workspace.writingChars, catalog)
      : type === 'reading'
        ? groupsForEditReading(workspace.readingChars, catalog)
        : groupsForEditVocabulary(workspace.vocabulary, catalog)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildExportFileNameByType(workspace, type))
}

/** 上传识别步骤：导出表格编辑 JSON（与 JSON 编辑 tab 内容一致） */
export function exportImportTableJson(workspace: Workspace, type: ImportTableType): void {
  const catalog = workspace.catalog.lessons
  const data =
    type === 'catalog'
      ? { lessons: workspace.catalog.lessons }
      : type === 'writing'
        ? groupsForEditWriting(workspace.writingChars, catalog)
        : type === 'reading'
          ? groupsForEditReading(workspace.readingChars, catalog)
          : groupsForEditVocabulary(workspace.vocabulary, catalog)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildImportTableExportFileName(workspace, type, 'table'))
}

/** 上传识别步骤：导出 AI 拓展 JSON（与拓展后的 JSON tab 内容一致） */
export function exportImportExpandedJson(
  workspace: Workspace,
  type: 'writing' | 'reading' | 'vocabulary'
): void {
  const catalog = workspace.catalog.lessons
  const data =
    type === 'writing'
      ? groupsForExpandedWriting(workspace.writingChars, catalog)
      : type === 'reading'
        ? groupsForExpandedReading(workspace.readingChars, catalog)
        : groupsForExpandedVocabulary(workspace.vocabulary, catalog)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildImportTableExportFileName(workspace, type, 'aiExpand'))
}

/** 导出按课次合并后的 JSON（数组结构） */
export function exportMergedLessons(workspace: Workspace): void {
  const data = buildMergedLessonPayload(workspace)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildExportFileNameByType(workspace, 'merged'))
}

/** 导出合并前工作区 JSON（目录与三表并列） */
export function exportPreMergeWorkspace(workspace: Workspace): void {
  const data = buildPreMergeWorkspacePayload(workspace)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, buildExportFileNameByType(workspace, 'workspace'))
}

export function parseJwDataFile(content: string, expectedType?: JwDataType): JwDataFile {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    throw new Error('无效的 JSON 文件格式')
  }

  if (isJwDataFile(data)) {
    if (!data.workspace && !data.payload) {
      throw new Error('无效的 JSON 文件：缺少数据')
    }
    return data
  }

  if (Array.isArray(data)) {
    if (isMergedLessonArray(data)) {
      return wrapPlainPayload({ lessons: data }, 'merged')
    }
    if (expectedType === 'catalog') {
      return wrapPlainPayload({ lessons: data }, 'catalog')
    }
    if (expectedType === 'writing') {
      if (isGroupedTableArray(data, 'writingChars')) {
        return wrapPlainPayload({ writingChars: data }, 'writing')
      }
      return wrapPlainPayload({ chars: data }, expectedType)
    }
    if (expectedType === 'reading') {
      if (isGroupedTableArray(data, 'readingChars')) {
        return wrapPlainPayload({ readingChars: data }, 'reading')
      }
      return wrapPlainPayload({ chars: data }, expectedType)
    }
    if (expectedType === 'vocabulary') {
      if (isGroupedTableArray(data, 'vocabulary')) {
        return wrapPlainPayload({ vocabulary: data }, 'vocabulary')
      }
      return wrapPlainPayload({ words: data }, 'vocabulary')
    }
    throw new Error('数组格式 JSON 需要指定数据类型，请使用完整 JSON 文件')
  }

  if (data && typeof data === 'object') {
    return wrapPlainPayload(data as Record<string, unknown>, expectedType)
  }

  throw new Error('无效的 JSON 文件格式')
}

type ImportDataSource = {
  catalog?: Workspace['catalog']
  writingChars?: Workspace['writingChars']
  readingChars?: Workspace['readingChars']
  vocabulary?: Workspace['vocabulary']
  expandConfig?: Workspace['expandConfig']
}

function hasItems<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0
}

/** 按导入类型从数据源提取字段，空数组视为「无数据」以免覆盖已有表 */
function extractImportUpdates(source: ImportDataSource, type: JwDataType): Partial<Workspace> {
  const updates: Partial<Workspace> = {}

  switch (type) {
    case 'catalog':
      if (hasItems(source.catalog?.lessons)) updates.catalog = source.catalog
      break
    case 'writing':
      if (hasItems(source.writingChars)) updates.writingChars = source.writingChars
      break
    case 'reading':
      if (hasItems(source.readingChars)) updates.readingChars = source.readingChars
      break
    case 'vocabulary':
      if (hasItems(source.vocabulary)) updates.vocabulary = source.vocabulary
      break
    case 'tables':
      if (hasItems(source.writingChars)) updates.writingChars = source.writingChars
      if (hasItems(source.readingChars)) updates.readingChars = source.readingChars
      if (hasItems(source.vocabulary)) updates.vocabulary = source.vocabulary
      break
    case 'merged':
      if (hasItems(source.catalog?.lessons)) updates.catalog = source.catalog
      if (hasItems(source.writingChars)) updates.writingChars = source.writingChars
      if (hasItems(source.readingChars)) updates.readingChars = source.readingChars
      if (hasItems(source.vocabulary)) updates.vocabulary = source.vocabulary
      updates.stage = 'merged'
      break
    case 'parsed':
      if (hasItems(source.catalog?.lessons)) updates.catalog = source.catalog
      if (hasItems(source.writingChars)) updates.writingChars = source.writingChars
      if (hasItems(source.readingChars)) updates.readingChars = source.readingChars
      if (hasItems(source.vocabulary)) updates.vocabulary = source.vocabulary
      break
    case 'expanded':
      if (hasItems(source.catalog?.lessons)) updates.catalog = source.catalog
      if (hasItems(source.writingChars)) updates.writingChars = source.writingChars
      if (hasItems(source.readingChars)) updates.readingChars = source.readingChars
      if (hasItems(source.vocabulary)) updates.vocabulary = source.vocabulary
      if (source.expandConfig) {
        updates.expandConfig = normalizeExpandConfig(source.expandConfig)
      }
      updates.stage = 'expanded'
      break
    default:
      throw new Error(`不支持的文件类型: ${type}`)
  }

  return updates
}

export function applyPartialImport(
  _workspace: Workspace,
  data: JwDataFile,
  expectedType?: JwDataType
): Partial<Workspace> {
  const importType = expectedType ?? data.type

  if (data.workspace) {
    return extractImportUpdates(data.workspace, importType)
  }

  return extractImportUpdates(data.payload ?? {}, importType)
}

export async function importPartialJwDataFromFile(
  file: File,
  workspace: Workspace,
  expectedType?: JwDataType
): Promise<Partial<Workspace>> {
  const text = await file.text()
  const data = parseJwDataFile(text, expectedType)
  return applyPartialImport(workspace, data, expectedType)
}

export interface CompressImageOptions {
  maxSize?: number
  quality?: number
  forceJpeg?: boolean
}

export async function compressImage(
  file: File,
  maxSizeOrOptions: number | CompressImageOptions = 1500
): Promise<{ base64: string; mimeType: string }> {
  const options =
    typeof maxSizeOrOptions === 'number' ? { maxSize: maxSizeOrOptions } : maxSizeOrOptions
  const maxSize = options.maxSize ?? 1500
  const quality = options.quality ?? 0.85
  const forceJpeg = options.forceJpeg ?? false

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      const isPng = !forceJpeg && file.type === 'image/png'
      const mimeType = isPng ? 'image/png' : 'image/jpeg'
      const dataUrl = canvas.toDataURL(mimeType, isPng ? undefined : quality)
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, mimeType })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`无法读取图片 "${file.name}"，请尝试 JPG 或 PNG 格式`))
    }
    img.src = url
  })
}
