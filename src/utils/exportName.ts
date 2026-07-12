import type { JwDataType, Workspace } from '@/types'

export const GRADE_OPTIONS = [
  { value: '1', label: '一年级' },
  { value: '2', label: '二年级' },
  { value: '3', label: '三年级' },
  { value: '4', label: '四年级' },
  { value: '5', label: '五年级' },
  { value: '6', label: '六年级' },
] as const

export const SEMESTER_OPTIONS = [
  { value: '上册', label: '上册' },
  { value: '下册', label: '下册' },
] as const

export type GradeValue = (typeof GRADE_OPTIONS)[number]['value']
export type SemesterValue = (typeof SEMESTER_OPTIONS)[number]['value']

const GRADE_LABELS: Record<string, string> = Object.fromEntries(
  GRADE_OPTIONS.map((o) => [o.value, o.label])
)

export const EXPORT_TYPE_LABELS: Record<string, string> = {
  catalog: '目录',
  writing: '写字表',
  reading: '识字表',
  vocabulary: '词语表',
  tables: '三表',
  merged: '合并表',
  parsed: '识别数据',
  expanded: '拓展数据',
  workspace: '工作区',
}

export function getGradeLabel(grade: string): string {
  return GRADE_LABELS[grade] ?? (grade ? `${grade}年级` : '未设置年级')
}

export function getWorkspaceDisplayName(meta: Workspace['meta']): string {
  const gradeLabel = getGradeLabel(meta.grade)
  const semester = meta.semester || '未设置册别'
  return `${gradeLabel}${semester}`
}

export function getWorkspaceExportPrefix(workspace: Workspace): string {
  const gradeLabel = getGradeLabel(workspace.meta.grade)
  const semester = workspace.meta.semester || '未设置册别'
  return `${gradeLabel}-${semester}`
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_')
}

export function buildExportFileName(
  workspace: Workspace,
  suffix: string,
  ext = 'json'
): string {
  const prefix = getWorkspaceExportPrefix(workspace)
  return sanitizeFileName(`${prefix}-${suffix}.${ext}`)
}

export function buildExportFileNameByType(
  workspace: Workspace,
  type: JwDataType | 'workspace',
  ext = 'json'
): string {
  const label = EXPORT_TYPE_LABELS[type] ?? type
  return buildExportFileName(workspace, label, ext)
}

export type ImportTableType = 'catalog' | 'writing' | 'reading' | 'vocabulary'

const IMPORT_TABLE_LABELS: Record<ImportTableType, string> = {
  catalog: '目录',
  writing: '生字表',
  reading: '识字表',
  vocabulary: '词语表',
}

/** 上传识别步骤导出文件名，如「三年级-上册-生字表」或「三年级-上册-生字表-ai拓展」 */
export function buildImportTableExportFileName(
  workspace: Workspace,
  type: ImportTableType,
  variant: 'table' | 'aiExpand' = 'table',
  ext = 'json'
): string {
  const label = IMPORT_TABLE_LABELS[type]
  const suffix = variant === 'aiExpand' ? `${label}-ai拓展` : label
  return buildExportFileName(workspace, suffix, ext)
}
