<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  UploadOutlined,
  ExportOutlined,
  ImportOutlined,
  ArrowRightOutlined,
  ClearOutlined,
} from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import {
  exportImportExpandedJson,
  exportImportTableJson,
  importPartialJwDataFromFile,
  JSON_FILE_ACCEPT,
} from '@/services/fileIO'
import { parseImage, normalizeLessons } from '@/services/ocrParser'
import { isValidLessonNo } from '@/services/lessonNoUtils'
import {
  mergeCatalogLessons,
  mergeCharsWithCatalog,
  mergeWordsWithCatalog,
  getLastLessonNoFromBatch,
  resolveTableUploadLastLessonNo,
  groupsForEditWriting,
  groupsForEditReading,
  groupsForEditVocabulary,
  groupsForExpandedWriting,
  groupsForExpandedReading,
  groupsForExpandedVocabulary,
  parseExpandedWritingGroupsFromJson,
  parseExpandedReadingGroupsFromJson,
  parseExpandedVocabularyGroupsFromJson,
  flattenWritingGroups,
  flattenReadingGroups,
  flattenVocabularyGroups,
  isLessonSlotChar,
  isLessonSlotWord,
  parseWritingGroupsFromJson,
  parseReadingGroupsFromJson,
  parseVocabularyGroupsFromJson,
} from '@/services/dataMerger'
import type {
  LessonReadingGroup,
  LessonVocabularyGroup,
  LessonWritingGroup,
} from '@/services/dataMerger'
import EditableLessonTable from '@/components/table/EditableLessonTable.vue'
import EditableLessonGroupTable from '@/components/table/EditableLessonGroupTable.vue'
import ImportTableExpandPanel from '@/components/table/ImportTableExpandPanel.vue'
import EditableJsonPanel from '@/components/EditableJsonPanel.vue'
import type {
  CharacterItem,
  LessonMeta,
  WordItem,
  CharExpandConfig,
  VocabExpandConfig,
  Workspace,
} from '@/types'

type UploadType = 'catalog' | 'writing' | 'reading' | 'vocabulary'

const DATA_TYPES: {
  value: UploadType
  label: string
}[] = [
  { value: 'catalog', label: '目录' },
  { value: 'writing', label: '写字表（生字）' },
  { value: 'reading', label: '识字表' },
  { value: 'vocabulary', label: '词语表' },
]

type TableUploadType = 'writing' | 'reading' | 'vocabulary'

const TABLE_UPLOAD_CONFIG: Record<
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

const JSON_SYNC_HANDLERS: Record<UploadType, (ws: Workspace) => unknown> = {
  catalog: (ws) => ({ lessons: ws.catalog.lessons }),
  writing: (ws) => groupsForEditWriting(ws.writingChars, ws.catalog.lessons),
  reading: (ws) => groupsForEditReading(ws.readingChars, ws.catalog.lessons),
  vocabulary: (ws) => groupsForEditVocabulary(ws.vocabulary, ws.catalog.lessons),
}

const EXPANDED_JSON_SYNC_HANDLERS: Record<
  TableUploadType,
  (ws: Workspace) => unknown
> = {
  writing: (ws) => groupsForExpandedWriting(ws.writingChars, ws.catalog.lessons),
  reading: (ws) => groupsForExpandedReading(ws.readingChars, ws.catalog.lessons),
  vocabulary: (ws) => groupsForExpandedVocabulary(ws.vocabulary, ws.catalog.lessons),
}

const TABLE_JSON_APPLY_CONFIG: Record<
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

const EXPANDED_JSON_APPLY_CONFIG: Record<
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

const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const uploadType = ref<UploadType>('catalog')
const editMode = ref<'table' | 'json' | 'expand' | 'expandedJson'>('table')
const parsing = ref(false)
const jsonText = ref('')
const expandedJsonText = ref('')
const writingTableGroups = ref<LessonWritingGroup[]>([])
const readingTableGroups = ref<LessonReadingGroup[]>([])
const vocabularyTableGroups = ref<LessonVocabularyGroup[]>([])

const workspace = computed(() =>
  workspaceStore.workspaces.find((w) => w.id === route.params.id)
)

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

function syncTableGroupsFromWorkspace() {
  const ws = workspace.value
  if (!ws) return
  const catalog = ws.catalog.lessons
  writingTableGroups.value = groupsForEditWriting(ws.writingChars, catalog)
  readingTableGroups.value = groupsForEditReading(ws.readingChars, catalog)
  vocabularyTableGroups.value = groupsForEditVocabulary(ws.vocabulary, catalog)
}

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
  expandedJsonText.value = JSON.stringify(
    EXPANDED_JSON_SYNC_HANDLERS[type](ws),
    null,
    2
  )
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

async function ensureWorkspaceSelected() {
  if (!workspace.value) {
    message.error('工作区未加载，请刷新页面后重试')
    return false
  }
  if (workspaceStore.current?.id !== workspace.value.id) {
    workspaceStore.select(workspace.value.id)
  }
  return true
}

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
        const afterCount = (merged as typeof currentWs[typeof config.field]).filter(
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
  itemKey: (item: T) => string
) {
  const ws = workspace.value
  if (!ws) return
  const map = new Map(data.map((item) => [itemKey(item), item]))
  const merged = ws[field].map((item) => map.get(itemKey(item as T)) ?? item)
  const existingKeys = new Set(merged.map((item) => itemKey(item as T)))
  for (const item of data) {
    const key = itemKey(item)
    if (!existingKeys.has(key)) {
      merged.push(item)
      existingKeys.add(key)
    }
  }
  await workspaceStore.update({ [field]: merged })
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
  await mergeFieldUpdate(config.field, items, config.itemKey)
  message.success(`已应用 ${items.length} 条拓展数据`)
}

async function applyJsonData(parsed: unknown) {
  if (!workspace.value) return

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
    return
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
  if (!workspace.value) return false
  const type = uploadType.value
  try {
    const updates = await importPartialJwDataFromFile(file, workspace.value, type)
    await workspaceStore.update(updates)
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

function goNext() {
  if (!workspace.value) return
  router.push(`/workspace/${workspace.value.id}/export`)
}
</script>

<template>
  <div>
    <div class="card-section">
      <a-typography-title :level="5">上传识别</a-typography-title>
      <a-typography-paragraph type="secondary">
        选择数据类型后上传图片进行识别，可多次上传，识别结果会自动合并。下方可预览、编辑，也可在各 tab 中上传/下载对应 JSON。
      </a-typography-paragraph>

      <div class="upload-type-row">
        <span class="upload-type-label">数据类型：</span>
        <a-radio-group v-model:value="uploadType" button-style="solid">
          <a-radio-button v-for="opt in DATA_TYPES" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </a-radio-button>
        </a-radio-group>
      </div>

      <div class="upload-area">
        <a-upload
          :before-upload="handleImageUpload"
          :show-upload-list="false"
          accept="image/*"
          :disabled="parsing"
        >
          <a-button size="large" :disabled="parsing">
            <UploadOutlined /> 上传{{ uploadTypeLabel }}图片
          </a-button>
        </a-upload>
      </div>
      <a-spin v-if="parsing" tip="正在识别..." style="margin-top: 16px; display: block" />
    </div>

    <div v-if="workspace" class="card-section">
      <div class="preview-header">
        <a-typography-title :level="5" style="margin: 0">
          {{ uploadTypeLabel }} — 数据预览与编辑 ({{ currentDataCountLabel }})
        </a-typography-title>
        <a-space>
          <a-popconfirm
            title="确定清空当前数据？"
            @confirm="handleClear"
          >
            <a-button danger>
              <ClearOutlined /> 清空
            </a-button>
          </a-popconfirm>
        </a-space>
      </div>
      <a-typography-paragraph type="secondary" style="margin-top: 8px">
        预览内容随上方数据类型切换，仅展示当前类型的数据。
      </a-typography-paragraph>
      <a-tabs v-model:activeKey="editMode" style="margin-top: 8px">
        <a-tab-pane key="table" tab="表格编辑">
          <div class="tab-toolbar">
            <a-space>
              <a-button @click="handleExportTableJson">
                <ExportOutlined /> 下载 JSON
              </a-button>
              <a-upload
                :before-upload="handleImportTableJson"
                :show-upload-list="false"
                :accept="JSON_FILE_ACCEPT"
              >
                <a-button>
                  <ImportOutlined /> 上传 JSON
                </a-button>
              </a-upload>
            </a-space>
          </div>
          <EditableLessonTable
            v-if="uploadType === 'catalog'"
            :data="workspace.catalog.lessons"
            @update="onCatalogUpdate"
          />
          <EditableLessonGroupTable
            v-else-if="uploadType === 'writing'"
            kind="writing"
            :groups="writingTableGroups"
            @update="(groups) => onWritingGroupsUpdate(groups as LessonWritingGroup[])"
          />
          <EditableLessonGroupTable
            v-else-if="uploadType === 'reading'"
            kind="reading"
            :groups="readingTableGroups"
            @update="(groups) => onReadingGroupsUpdate(groups as LessonReadingGroup[])"
          />
          <EditableLessonGroupTable
            v-else
            kind="vocabulary"
            :groups="vocabularyTableGroups"
            @update="(groups) => onVocabularyGroupsUpdate(groups as LessonVocabularyGroup[])"
          />
        </a-tab-pane>
        <a-tab-pane key="json" tab="JSON 编辑">
          <EditableJsonPanel v-model="jsonText" @apply="applyJsonData" />
        </a-tab-pane>
        <a-tab-pane
          v-if="uploadType !== 'catalog'"
          key="expand"
          tab="AI 拓展"
        >
          <div class="tab-toolbar">
            <a-space>
              <a-button @click="handleExportExpandedJson">
                <ExportOutlined /> 下载 JSON
              </a-button>
              <a-upload
                :before-upload="handleImportExpandedJson"
                :show-upload-list="false"
                :accept="JSON_FILE_ACCEPT"
              >
                <a-button>
                  <ImportOutlined /> 上传 JSON
                </a-button>
              </a-upload>
            </a-space>
          </div>
          <ImportTableExpandPanel
            :table-type="uploadType"
            :grade="workspace.meta.grade"
            :catalog="workspace.catalog.lessons"
            :writing-chars="workspace.writingChars"
            :reading-chars="workspace.readingChars"
            :vocabulary="workspace.vocabulary"
            @update-writing="(data) => mergeFieldUpdate('writingChars', data, (c) => `${c.lessonNo}-${c.char}`)"
            @update-reading="(data) => mergeFieldUpdate('readingChars', data, (c) => `${c.lessonNo}-${c.char}`)"
            @update-vocabulary="(data) => mergeFieldUpdate('vocabulary', data, (w) => `${w.lessonNo}-${w.word}`)"
            @expand-config-change="onExpandConfigChange"
          />
        </a-tab-pane>
        <a-tab-pane
          v-if="uploadType !== 'catalog'"
          key="expandedJson"
          tab="拓展后的 JSON"
        >
          <EditableJsonPanel
            v-model="expandedJsonText"
            @apply="applyExpandedJsonData"
          />
        </a-tab-pane>
      </a-tabs>
    </div>

    <a-space style="margin-top: 16px">
      <a-button type="primary" @click="goNext">
        下一步：生成文件 <ArrowRightOutlined />
      </a-button>
    </a-space>
  </div>
</template>

<style scoped>
.upload-type-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.upload-type-label {
  font-size: 14px;
  color: #666;
}

.upload-area {
  margin-top: 12px;
}

.tab-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.preview-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
