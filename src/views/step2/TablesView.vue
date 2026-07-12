<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  UploadOutlined,
  ExportOutlined,
  ImportOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import {
  exportPartialJwData,
  importPartialJwDataFromFile,
  JSON_FILE_ACCEPT,
} from '@/services/fileIO'
import { parseImage, normalizeChars, normalizeWords } from '@/services/ocrParser'
import { formatIntegerLessonNo, isValidLessonNo, normalizeLessonNo } from '@/services/lessonNoUtils'
import {
  mergeCharsWithCatalog,
  mergeWordsWithCatalog,
  buildLessonMergeRows,
  mergeRowsToGroupedPayload,
  applyMergeRows,
  getLastLessonNoFromBatch,
  resolveTableUploadLastLessonNo,
  isLessonSlotChar,
  isLessonSlotWord,
  type LessonMergeRow,
} from '@/services/dataMerger'
import LessonGroupedTables from '@/components/table/LessonGroupedTables.vue'
import EditableJsonPanel from '@/components/EditableJsonPanel.vue'
import type { CharacterItem, LessonMeta, WordItem } from '@/types'

type TableType = 'writing' | 'reading' | 'vocabulary'

const TABLE_UPLOAD_CONFIG: Record<
  TableType,
  {
    field: 'writingChars' | 'readingChars' | 'vocabulary'
    tableLastKey: 'writing' | 'reading' | 'vocabulary'
    isSlot: (text: string) => boolean
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
    merge: (existing, incoming, catalog) =>
      mergeCharsWithCatalog(existing as CharacterItem[], incoming as CharacterItem[], catalog),
    getIncoming: (result) => result.chars as CharacterItem[] | undefined,
  },
  reading: {
    field: 'readingChars',
    tableLastKey: 'reading',
    isSlot: isLessonSlotChar,
    merge: (existing, incoming, catalog) =>
      mergeCharsWithCatalog(existing as CharacterItem[], incoming as CharacterItem[], catalog),
    getIncoming: (result) => result.chars as CharacterItem[] | undefined,
  },
  vocabulary: {
    field: 'vocabulary',
    tableLastKey: 'vocabulary',
    isSlot: isLessonSlotWord,
    merge: (existing, incoming, catalog) =>
      mergeWordsWithCatalog(existing as WordItem[], incoming as WordItem[], catalog),
    getIncoming: (result) => result.words as WordItem[] | undefined,
  },
}

const TABLE_TYPE_OPTIONS = [
  { value: 'writing' as const, label: '写字表（生字表）' },
  { value: 'reading' as const, label: '识字表' },
  { value: 'vocabulary' as const, label: '词语表' },
]

const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const uploadTableType = ref<TableType>('writing')
const editMode = ref<'grouped' | 'json'>('grouped')
const parsing = ref(false)
const jsonText = ref('')
const mergeRows = ref<LessonMergeRow[]>([])

const workspace = computed(() =>
  workspaceStore.workspaces.find((w) => w.id === route.params.id)
)

const uploadTypeLabel = computed(
  () => TABLE_TYPE_OPTIONS.find((t) => t.value === uploadTableType.value)?.label ?? '表'
)

watch(
  workspace,
  (ws) => {
    if (ws) mergeRows.value = buildLessonMergeRows(ws)
  },
  { immediate: true, deep: true }
)

watch(
  mergeRows,
  (rows) => {
    jsonText.value = JSON.stringify({ lessons: mergeRowsToGroupedPayload(rows) }, null, 2)
  },
  { deep: true, immediate: true }
)

async function persistMergeRows(rows: LessonMergeRow[]) {
  if (!workspace.value) return
  mergeRows.value = rows
  const merged = applyMergeRows(rows, workspace.value)
  await workspaceStore.update(merged)
}

async function handleUpload(file: File) {
  if (!settingsStore.hasOcrApiKey()) {
    message.warning('请先在设置页配置图片识别 API Key')
    return false
  }
  if (!workspace.value) {
    message.error('工作区未加载，请刷新页面后重试')
    return false
  }
  if (workspaceStore.current?.id !== workspace.value.id) {
    workspaceStore.select(workspace.value.id)
  }

  parsing.value = true
  const tableType = uploadTableType.value
  try {
    const ws = workspace.value
    const config = TABLE_UPLOAD_CONFIG[tableType]
    const parseOptions: {
      catalogLessons: LessonMeta[]
      lastLessonNo?: string
    } = {
      catalogLessons: ws.catalog.lessons,
    }
    const last = resolveTableUploadLastLessonNo(
      ws.tableLastLesson?.[config.tableLastKey],
      ws[config.field],
      config.isSlot
    )
    if (isValidLessonNo(last)) parseOptions.lastLessonNo = last

    const result = await parseImage(file, tableType, parseOptions)
    const incoming = config.getIncoming(result)
    if (incoming) {
      const merged = config.merge(ws[config.field], incoming, ws.catalog.lessons)
      const tableLastLesson = { ...ws.tableLastLesson }
      const batchLast = getLastLessonNoFromBatch(incoming, config.isSlot)
      if (isValidLessonNo(batchLast)) tableLastLesson[config.tableLastKey] = batchLast
      const saved = await workspaceStore.update({
        [config.field]: merged,
        tableLastLesson,
      })
      if (!saved) {
        message.error('识别成功但保存失败，请刷新页面后重试')
        return false
      }
    }

    if (workspaceStore.current) {
      mergeRows.value = buildLessonMergeRows(workspaceStore.current)
    }
    editMode.value = 'grouped'
    message.success(`${uploadTypeLabel.value}识别完成，已归入对应课次`)
  } catch (e) {
    message.error(e instanceof Error ? e.message : '识别失败', 8)
  } finally {
    parsing.value = false
  }
  return false
}

async function applyJsonData(parsed: unknown) {
  if (!workspace.value) return

  const obj = parsed as Record<string, unknown>
  const lessonsRaw = Array.isArray(parsed)
    ? parsed
    : Array.isArray(obj.lessons)
      ? obj.lessons
      : null

  if (lessonsRaw) {
    const rows: LessonMergeRow[] = lessonsRaw.map((item, index) => {
      const row = item as Record<string, unknown>
      const lessonNo = normalizeLessonNo(row.lessonNo) || formatIntegerLessonNo(index + 1)
      const rowIndex = Number(row.index) || index + 1
      const toText = (val: unknown, isChar: boolean) => {
        if (Array.isArray(val)) {
          return val
            .map((v) => (typeof v === 'string' ? v : String((v as { char?: string; word?: string }).char ?? (v as { word?: string }).word ?? '')))
            .filter((s) => (isChar ? s.length === 1 : s.length > 0))
            .join('、')
        }
        return typeof val === 'string' ? val : ''
      }
      return {
        index: rowIndex,
        lessonNo,
        title: String(row.title ?? '').trim(),
        writingChars: toText(row.writing ?? row.writingChars, true),
        readingChars: toText(row.reading ?? row.readingChars, true),
        vocabulary: toText(row.vocabulary ?? row.words, false),
      }
    })
    await persistMergeRows(rows)
    message.success(`已应用 ${rows.length} 课数据`)
    return
  }

  let hasUpdate = false
  const updates: Partial<typeof workspace.value> = {}

  if (obj.writingChars || obj.chars) {
    const chars = normalizeChars((obj.writingChars ?? obj.chars) as CharacterItem[])
    if (chars.length > 0) {
      updates.writingChars = chars
      hasUpdate = true
    }
  }
  if (obj.readingChars) {
    const chars = normalizeChars(obj.readingChars as CharacterItem[])
    if (chars.length > 0) {
      updates.readingChars = chars
      hasUpdate = true
    }
  }
  if (obj.vocabulary || obj.words) {
    const words = normalizeWords((obj.vocabulary ?? obj.words) as WordItem[])
    if (words.length > 0) {
      updates.vocabulary = words
      hasUpdate = true
    }
  }

  if (!hasUpdate) {
    message.error('JSON 中未找到有效数据，请使用 lessons 数组或 writingChars/readingChars/vocabulary 字段')
    return
  }

  await workspaceStore.update(updates)
  if (workspaceStore.current) {
    mergeRows.value = buildLessonMergeRows(workspaceStore.current)
  }
  message.success('JSON 已应用')
}

function handleExport() {
  if (!workspace.value) return
  exportPartialJwData(workspace.value, 'tables')
}

async function handleImport(file: File) {
  if (!workspace.value) return false
  try {
    const updates = await importPartialJwDataFromFile(file, workspace.value, 'tables')
    await workspaceStore.update(updates)
    if (workspaceStore.current) {
      mergeRows.value = buildLessonMergeRows(workspaceStore.current)
    }
    message.success('JSON 导入成功')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '导入失败')
  }
  return false
}

function goNext() {
  if (!workspace.value) return
  router.push(`/workspace/${workspace.value.id}/merge`)
}
</script>

<template>
  <div>
    <div class="card-section">
      <a-typography-title :level="5">识别生字表 / 识字表 / 词语表</a-typography-title>
      <a-typography-paragraph type="secondary">
        上传前选择本次图片对应的表类型，可多次上传不同类型的表。识别结果按课次分层展示，写字表、识字表、词语表汇总在同一视图中。
      </a-typography-paragraph>

      <div class="upload-type-row">
        <span class="upload-type-label">本次上传类型：</span>
        <a-radio-group v-model:value="uploadTableType" button-style="solid">
          <a-radio-button
            v-for="opt in TABLE_TYPE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </a-radio-button>
        </a-radio-group>
      </div>

      <a-upload-dragger
        :before-upload="handleUpload"
        :show-upload-list="false"
        accept="image/*"
        :disabled="parsing"
        style="margin-top: 16px"
      >
        <p class="ant-upload-drag-icon">
          <UploadOutlined />
        </p>
        <p class="ant-upload-text">点击或拖拽上传{{ uploadTypeLabel }}图片</p>
        <p class="ant-upload-hint">支持 JPG、PNG 格式，可多次上传不同类型的表</p>
      </a-upload-dragger>
      <a-spin v-if="parsing" tip="正在识别..." style="margin-top: 16px; display: block" />
    </div>

    <div v-if="workspace" class="card-section">
      <a-typography-title :level="5">按课次查看</a-typography-title>
      <a-alert
        v-if="workspace.catalog.lessons.length === 0"
        type="info"
        message="尚未识别目录，课文标题需手动填写；建议先在「识别目录」步骤上传目录"
        show-icon
        style="margin-bottom: 12px"
      />
      <a-tabs v-model:activeKey="editMode" style="margin-top: 8px">
        <a-tab-pane key="grouped" tab="分层视图">
          <LessonGroupedTables :data="mergeRows" @update="persistMergeRows" />
        </a-tab-pane>
        <a-tab-pane key="json" tab="JSON 编辑">
          <EditableJsonPanel v-model="jsonText" @apply="applyJsonData" />
        </a-tab-pane>
      </a-tabs>
    </div>

    <a-space style="margin-top: 16px" wrap>
      <a-button @click="handleExport">
        <ExportOutlined /> 下载全部表 JSON
      </a-button>
      <a-upload :before-upload="handleImport" :show-upload-list="false" :accept="JSON_FILE_ACCEPT">
        <a-button><ImportOutlined /> 上传表 JSON</a-button>
      </a-upload>
      <a-button type="primary" @click="goNext">
        下一步：数据合并 <ArrowRightOutlined />
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
</style>
