<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ExportOutlined,
  ImportOutlined,
  ArrowRightOutlined,
  MergeCellsOutlined,
} from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  exportMergedLessons,
  exportPreMergeWorkspace,
  importPartialJwDataFromFile,
  JSON_FILE_ACCEPT,
} from '@/services/fileIO'
import {
  applyMergeRows,
  buildLessonMergeRows,
  buildMergedLessonPayload,
  mergeRowsToMergedPayload,
  parseMergedLessonsFromJson,
  type LessonMergeRow,
} from '@/services/dataMerger'
import EditableMergeTable from '@/components/table/EditableMergeTable.vue'
import EditableJsonPanel from '@/components/EditableJsonPanel.vue'

const router = useRouter()
const workspaceStore = useWorkspaceStore()

const previewMode = ref<'table' | 'json'>('table')
const mergeRows = ref<LessonMergeRow[]>([])
const mergedJsonText = ref('')

const workspace = computed(() => workspaceStore.current)

function refreshMergePreview() {
  if (!workspace.value) return
  mergeRows.value = buildLessonMergeRows(workspace.value)
  mergedJsonText.value = JSON.stringify(buildMergedLessonPayload(workspace.value), null, 2)
}

watch(
  workspace,
  () => {
    refreshMergePreview()
  },
  { immediate: true, deep: true }
)

watch(
  mergeRows,
  (rows) => {
    mergedJsonText.value = JSON.stringify(mergeRowsToMergedPayload(rows), null, 2)
  },
  { deep: true }
)

async function persistMergeRows(rows: LessonMergeRow[]) {
  if (!workspace.value) return
  mergeRows.value = rows
  const merged = applyMergeRows(rows, workspace.value)
  await workspaceStore.update(merged)
}

async function applyMergedJsonData(parsed: unknown) {
  if (!workspace.value) return
  try {
    const data = parseMergedLessonsFromJson(parsed)
    await workspaceStore.update(data)
    refreshMergePreview()
    message.success('合并 JSON 已应用')
  } catch (e) {
    message.error(e instanceof Error ? e.message : 'JSON 格式无效')
  }
}

function refreshFromWorkspace() {
  refreshMergePreview()
  message.success('已从上一步加载数据')
}

async function onMergeUpdate(rows: LessonMergeRow[]) {
  await persistMergeRows(rows)
}

async function confirmMerge() {
  if (!workspace.value) return
  const merged = applyMergeRows(mergeRows.value, workspace.value)
  await workspaceStore.update({ ...merged, stage: 'merged' })
  refreshMergePreview()
  message.success('合并完成')
}

function handleExportMerged() {
  if (!workspace.value) return
  exportMergedLessons(workspace.value)
}

function handleExportWorkspace() {
  if (!workspace.value) return
  exportPreMergeWorkspace(workspace.value)
}

async function handleMergedImport(file: File) {
  if (!workspace.value) return false
  try {
    const text = await file.text()
    const parsed = JSON.parse(text) as unknown
    const data = parseMergedLessonsFromJson(parsed)
    await workspaceStore.update({ ...data, stage: 'merged' })
    refreshMergePreview()
    message.success('合并 JSON 导入成功')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '导入失败')
  }
  return false
}

async function handleWorkspaceImport(file: File) {
  if (!workspace.value) return false
  try {
    const updates = await importPartialJwDataFromFile(file, workspace.value)
    await workspaceStore.update(updates)
    refreshMergePreview()
    message.success('工作区 JSON 导入成功')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '导入失败')
  }
  return false
}

function goNext() {
  if (!workspace.value) return
  router.push(`/workspace/${workspace.value.id}/expand`)
}
</script>

<template>
  <div>
    <div class="card-section">
      <a-typography-title :level="5">数据合并</a-typography-title>
      <a-typography-paragraph type="secondary">
        将目录、写字表、识字表、词语表按课次号（lessonNo）合并为一张表。
        点击「确认合并」后进入下一步；导出合并 JSON 为按课次汇总结构，导出完整工作区 JSON 为合并前的并列结构。
      </a-typography-paragraph>
      <a-space style="margin-top: 12px" wrap>
        <a-button @click="refreshFromWorkspace">
          <MergeCellsOutlined /> 从上一步加载
        </a-button>
        <a-button type="primary" @click="confirmMerge">确认合并</a-button>
      </a-space>
    </div>

    <div v-if="workspace" class="card-section">
      <a-typography-title :level="5">
        合并预览 ({{ mergeRows.length }} 课)
      </a-typography-title>
      <a-alert
        v-if="workspace.catalog.lessons.length === 0"
        type="warning"
        message="目录为空，课文标题需手动填写；请返回上一步上传或编辑目录"
        show-icon
        style="margin-bottom: 12px"
      />
      <a-tabs v-model:activeKey="previewMode" style="margin-top: 8px">
        <a-tab-pane key="table" tab="表格预览">
          <EditableMergeTable :data="mergeRows" @update="onMergeUpdate" />
        </a-tab-pane>
        <a-tab-pane key="json" tab="合并 JSON">
          <EditableJsonPanel v-model="mergedJsonText" @apply="applyMergedJsonData" />
        </a-tab-pane>
      </a-tabs>
    </div>

    <a-space style="margin-top: 16px" wrap>
      <a-button type="primary" @click="handleExportMerged">
        <ExportOutlined /> 下载合并 JSON
      </a-button>
      <a-upload :before-upload="handleMergedImport" :show-upload-list="false" :accept="JSON_FILE_ACCEPT">
        <a-button><ImportOutlined /> 上传合并 JSON</a-button>
      </a-upload>
      <a-button @click="handleExportWorkspace">
        <ExportOutlined /> 下载完整工作区 JSON
      </a-button>
      <a-upload :before-upload="handleWorkspaceImport" :show-upload-list="false" :accept="JSON_FILE_ACCEPT">
        <a-button><ImportOutlined /> 上传工作区 JSON</a-button>
      </a-upload>
      <a-button type="primary" @click="goNext">
        下一步：AI 拓展 <ArrowRightOutlined />
      </a-button>
    </a-space>
  </div>
</template>
