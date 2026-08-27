import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { message } from 'ant-design-vue'
import {
  exportImportExpandedJson,
  exportImportTableJson,
  importPartialJwDataFromFile,
} from '@/services/fileIO'
import { parseImage, normalizeLessons } from '@/services/ocrParser'
import { isValidLessonNo } from '@/services/lessonNoUtils'
import {
  mergeCatalogLessons,
  getLastLessonNoFromBatch,
  resolveTableUploadLastLessonNo,
  flattenWritingGroups,
  flattenReadingGroups,
  flattenVocabularyGroups,
  isLessonSlotChar,
  isLessonSlotWord,
  groupsForEditWriting,
  groupsForEditReading,
  groupsForEditVocabulary,
  type LessonReadingGroup,
  type LessonVocabularyGroup,
  type LessonWritingGroup,
} from '@/services/dataMerger'
import { useSettingsStore } from '@/stores/settings'
import type { useWorkspaceStore } from '@/stores/workspace'
import type {
  CharacterItem,
  LessonMeta,
  WordItem,
  CharExpandConfig,
  VocabExpandConfig,
  Workspace,
} from '@/types'
import {
  DATA_TYPES,
  EXPANDED_JSON_APPLY_CONFIG,
  EXPANDED_JSON_SYNC_HANDLERS,
  JSON_SYNC_HANDLERS,
  TABLE_JSON_APPLY_CONFIG,
  TABLE_UPLOAD_CONFIG,
  type EditMode,
  type UploadType,
} from '@/composables/importTableConfig'

type WorkspaceStore = ReturnType<typeof useWorkspaceStore>

export function useImportTableData(options: {
  workspace: ComputedRef<Workspace | undefined>
  workspaceStore: WorkspaceStore
  ensureWorkspaceSelected: () => Promise<boolean>
  uploadType: Ref<UploadType>
  editMode: Ref<EditMode>
}) {
  const { workspace, workspaceStore, ensureWorkspaceSelected, uploadType, editMode } = options
  const settingsStore = useSettingsStore()

  const parsing = ref(false)
  const jsonText = ref('')
  const expandedJsonText = ref('')
  const writingTableGroups = ref<LessonWritingGroup[]>([])
  const readingTableGroups = ref<LessonReadingGroup[]>([])
  const vocabularyTableGroups = ref<LessonVocabularyGroup[]>([])

  const uploadTypeLabel = computed(
    () => DATA_TYPES.find((t) => t.value === uploadType.value)?.label ?? '数据'
  )

  const dataCounts = computed(() => ({
    catalog: workspace.value?.catalog.lessons.length ?? 0,
    writing:
      workspace.value?.writingChars.filter((c) => !isLessonSlotChar(c.char)).length ?? 0,
    reading:
      workspace.value?.readingChars.filter((c) => !isLessonSlotChar(c.char)).length ?? 0,
    vocabulary:
      workspace.value?.vocabulary.filter((w) => !isLessonSlotWord(w.word)).length ?? 0,
  }))

  const currentDataCountLabel = computed(() => {
    switch (uploadType.value) {
      case 'catalog':
        return `${dataCounts.value.catalog} 课`
      case 'writing':
        return `${dataCounts.value.writing} 字`
      case 'reading':
        return `${dataCounts.value.reading} 字`
      case 'vocabulary':
        return `${dataCounts.value.vocabulary} 词`
    }
  })

  function syncTableGroupsFromWorkspace() {
    const ws = workspace.value
    if (!ws) return
    const catalog = ws.catalog.lessons
    writingTableGroups.value = groupsForEditWriting(ws.writingChars, catalog)
    readingTableGroups.value = groupsForEditReading(ws.readingChars, catalog)
    vocabularyTableGroups.value = groupsForEditVocabulary(ws.vocabulary, catalog)
  }

  function syncJsonText(type: UploadType = uploadType.value) {
    const ws = workspace.value
    if (!ws) return
    jsonText.value = JSON.stringify(JSON_SYNC_HANDLERS[type](ws), null, 2)
  }

  function syncExpandedJsonText(type: UploadType = uploadType.value) {
    const ws = workspace.value
    if (!ws) return
    if (type === 'catalog') {
      expandedJsonText.value = ''
      return
    }
    expandedJsonText.value = JSON.stringify(EXPANDED_JSON_SYNC_HANDLERS[type](ws), null, 2)
  }

  watch(
    workspace,
    () => {
      syncTableGroupsFromWorkspace()
      syncJsonText()
      syncExpandedJsonText()
    },
    { immediate: true, deep: true }
  )

  watch(uploadType, () => {
    syncJsonText()
    syncExpandedJsonText()
  })

  async function handleImageUpload(file: File) {
    if (!settingsStore.hasOcrApiKey()) {
      message.warning('请先在设置页配置图片识别 API Key')
      return false
    }
    if (!(await ensureWorkspaceSelected())) return false

    parsing.value = true
    const type = uploadType.value
    try {
      const parseOptions: {
        catalogLessons: LessonMeta[]
        lastLessonNo?: string
      } = {
        catalogLessons: workspace.value!.catalog.lessons,
      }
      if (type !== 'catalog') {
        const config = TABLE_UPLOAD_CONFIG[type]
        const last = resolveTableUploadLastLessonNo(
          workspace.value!.tableLastLesson?.[config.tableLastKey],
          workspace.value![config.field],
          config.isSlot
        )
        if (isValidLessonNo(last)) parseOptions.lastLessonNo = last
      }

      const result = await parseImage(file, type, parseOptions)

      if (type === 'catalog' && result.lessons) {
        const existing = workspace.value!.catalog.lessons
        const incoming = result.lessons as LessonMeta[]
        const merged = mergeCatalogLessons(existing, incoming)
        const saved = await workspaceStore.update({ catalog: { lessons: merged } })
        if (!saved) {
          message.error('识别成功但保存失败，请刷新页面后重试')
          return false
        }
        editMode.value = 'table'
        const added = merged.length - existing.length
        message.success(
          added > 0
            ? `目录识别完成，新增 ${added} 课，共 ${merged.length} 课（已与已有目录合并）。`
            : `目录识别完成，共 ${merged.length} 课（与已有目录合并，无新课次）。`
        )
      } else if (type !== 'catalog') {
        const config = TABLE_UPLOAD_CONFIG[type]
        const incoming = config.getIncoming(result)
        if (incoming) {
          const currentWs = workspaceStore.current
          if (!currentWs || currentWs.id !== workspace.value!.id) {
            message.error('工作区状态异常，请刷新后重试')
            return false
          }
          const merged = config.merge(
            currentWs[config.field],
            incoming,
            currentWs.catalog.lessons
          )
          const tableLastLesson = { ...currentWs.tableLastLesson }
          const batchLast = getLastLessonNoFromBatch(incoming, config.isSlot)
          if (isValidLessonNo(batchLast)) tableLastLesson[config.tableLastKey] = batchLast
          const beforeCount = currentWs[config.field].filter(
            (item) =>
              !config.isSlot(String((item as CharacterItem).char ?? (item as WordItem).word ?? ''))
          ).length
          const afterCount = (merged as (typeof currentWs)[typeof config.field]).filter(
            (item) =>
              !config.isSlot(String((item as CharacterItem).char ?? (item as WordItem).word ?? ''))
          ).length
          const saved = await workspaceStore.update({
            [config.field]: merged,
            tableLastLesson,
          })
          if (!saved) {
            message.error('识别成功但保存失败，请刷新页面后重试')
            return false
          }
          editMode.value = 'table'
          const added = afterCount - beforeCount
          const label = uploadTypeLabel.value
          message.success(
            added > 0
              ? `${label}识别完成，新增 ${added} 条，已归入对应课次`
              : `${label}识别完成，但未新增数据（可能与已有内容重复或课次映射异常，请检查 JSON 预览）`
          )
        }
      }

      syncJsonText(type)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '识别失败', 8)
    } finally {
      parsing.value = false
    }
    return false
  }

  async function onCatalogUpdate(lessons: LessonMeta[]) {
    await workspaceStore.update({ catalog: { lessons } })
  }

  async function onWritingGroupsUpdate(groups: LessonWritingGroup[]) {
    writingTableGroups.value = groups
    await workspaceStore.update({ writingChars: flattenWritingGroups(groups) })
  }

  async function onReadingGroupsUpdate(groups: LessonReadingGroup[]) {
    readingTableGroups.value = groups
    await workspaceStore.update({ readingChars: flattenReadingGroups(groups) })
  }

  async function onVocabularyGroupsUpdate(groups: LessonVocabularyGroup[]) {
    vocabularyTableGroups.value = groups
    await workspaceStore.update({ vocabulary: flattenVocabularyGroups(groups) })
  }

  async function mergeFieldUpdate<T extends { lessonNo: string }>(
    field: 'writingChars' | 'readingChars' | 'vocabulary',
    data: T[],
    itemKey: (item: T) => string,
    markExpanded = false
  ) {
    const ws = workspace.value
    if (!ws) return
    const map = new Map(data.map((item) => [itemKey(item), item]))
    const merged = (ws[field] as unknown as T[]).map((item) => map.get(itemKey(item)) ?? item)
    const existingKeys = new Set(merged.map((item) => itemKey(item)))
    for (const item of data) {
      const key = itemKey(item)
      if (!existingKeys.has(key)) {
        merged.push(item)
        existingKeys.add(key)
      }
    }
    const patch: Partial<Workspace> = { [field]: merged as unknown as Workspace[typeof field] }
    if (markExpanded && ws.stage !== 'expanded') {
      patch.stage = 'expanded'
    }
    await workspaceStore.update(patch)
  }

  async function onExpandConfigChange(config: CharExpandConfig | VocabExpandConfig) {
    if (!workspace.value) return
    const type = uploadType.value
    if (type === 'writing' || type === 'reading') {
      await workspaceStore.update({
        expandConfig: {
          ...workspace.value.expandConfig,
          [type]: config as CharExpandConfig,
        },
      })
    } else if (type === 'vocabulary') {
      await workspaceStore.update({
        expandConfig: {
          ...workspace.value.expandConfig,
          vocabulary: config as VocabExpandConfig,
        },
      })
    }
  }

  async function applyExpandedJsonData(parsed: unknown) {
    if (!workspace.value) return

    const type = uploadType.value
    if (type === 'catalog') return

    const config = EXPANDED_JSON_APPLY_CONFIG[type]
    const items = config.parse(parsed)
    if (items.length === 0) {
      message.error(config.errorMsg)
      return
    }
    await mergeFieldUpdate(config.field, items, config.itemKey, true)
    message.success(`已应用 ${items.length} 条拓展数据`)
  }

  async function applyJsonData(parsed: unknown) {
    if (!(await ensureWorkspaceSelected())) return

    const type = uploadType.value
    const obj = parsed as Record<string, unknown>

    if (type === 'catalog') {
      const raw = Array.isArray(parsed)
        ? parsed
        : Array.isArray(obj.lessons)
          ? obj.lessons
          : null
      if (!raw) {
        message.error('JSON 中未找到 lessons 数组')
        return
      }
      const lessons = normalizeLessons(raw as LessonMeta[])
      if (lessons.length === 0) {
        message.error('未找到有效的课次数据')
        return
      }
      await workspaceStore.update({ catalog: { lessons } })
      message.success(`已应用 ${lessons.length} 课目录数据`)
      return
    }

    if (type === 'writing' || type === 'reading' || type === 'vocabulary') {
      const config = TABLE_JSON_APPLY_CONFIG[type]
      const items = config.parse(parsed)
      if (items.length === 0) {
        message.error(config.errorMsg)
        return
      }
      await workspaceStore.update({ [config.field]: items })
      message.success(`已应用 ${items.length} 条${config.successLabel}数据`)
    }
  }

  function handleExportTableJson() {
    if (!workspace.value) return
    exportImportTableJson(workspace.value, uploadType.value)
  }

  function handleExportExpandedJson() {
    if (!workspace.value) return
    const type = uploadType.value
    if (type === 'catalog') return
    exportImportExpandedJson(workspace.value, type)
  }

  async function handleImportTableJson(file: File) {
    if (!(await ensureWorkspaceSelected())) return false
    const type = uploadType.value
    try {
      const updates = await importPartialJwDataFromFile(file, workspace.value!, type)
      if (Object.keys(updates).length === 0) {
        message.warning(`${uploadTypeLabel.value} JSON 中未找到可导入的数据`)
        return false
      }
      const saved = await workspaceStore.update(updates)
      if (!saved) {
        message.error('导入成功但保存失败，请刷新页面后重试')
        return false
      }
      message.success(`${uploadTypeLabel.value} JSON 导入成功`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导入失败')
    }
    return false
  }

  async function handleImportExpandedJson(file: File) {
    if (!workspace.value) return false
    if (uploadType.value === 'catalog') return false
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('无效的 JSON 文件格式')
      }
      await applyExpandedJsonData(parsed)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '导入失败')
    }
    return false
  }

  async function handleClear() {
    if (!workspace.value) return

    const type = uploadType.value
    const tableLastLesson = { ...workspace.value?.tableLastLesson }
    switch (type) {
      case 'catalog':
        await workspaceStore.update({ catalog: { lessons: [] } })
        break
      case 'writing':
        delete tableLastLesson.writing
        await workspaceStore.update({ writingChars: [], tableLastLesson })
        break
      case 'reading':
        delete tableLastLesson.reading
        await workspaceStore.update({ readingChars: [], tableLastLesson })
        break
      case 'vocabulary':
        delete tableLastLesson.vocabulary
        await workspaceStore.update({ vocabulary: [], tableLastLesson })
        break
    }

    syncJsonText(type)
    message.success(`${uploadTypeLabel.value} 数据已清空`)
  }

  return {
    parsing,
    jsonText,
    expandedJsonText,
    writingTableGroups,
    readingTableGroups,
    vocabularyTableGroups,
    uploadTypeLabel,
    currentDataCountLabel,
    handleImageUpload,
    onCatalogUpdate,
    onWritingGroupsUpdate,
    onReadingGroupsUpdate,
    onVocabularyGroupsUpdate,
    mergeFieldUpdate,
    onExpandConfigChange,
    applyExpandedJsonData,
    applyJsonData,
    handleExportTableJson,
    handleExportExpandedJson,
    handleImportTableJson,
    handleImportExpandedJson,
    handleClear,
  }
}
