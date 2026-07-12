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

import { parseImage, normalizeLessons } from '@/services/ocrParser'

import { mergeCatalogLessons } from '@/services/dataMerger'

import EditableLessonTable from '@/components/table/EditableLessonTable.vue'

import EditableJsonPanel from '@/components/EditableJsonPanel.vue'

import type { LessonMeta } from '@/types'



const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const parsing = ref(false)
const editMode = ref<'table' | 'json'>('table')
const jsonText = ref('')
const workspace = computed(() =>
  workspaceStore.workspaces.find((w) => w.id === route.params.id)
)



watch(

  () => workspace.value?.catalog.lessons,

  (lessons) => {

    if (lessons) {

      jsonText.value = JSON.stringify({ lessons }, null, 2)

    }

  },

  { deep: true, immediate: true }

)



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
  try {
    const existing =
      workspaceStore.workspaces.find((w) => w.id === route.params.id)?.catalog.lessons ?? []
    const result = await parseImage(file, 'catalog', { catalogLessons: existing })
    if (result.lessons) {
      const incoming = result.lessons as LessonMeta[]
      const merged = mergeCatalogLessons(existing, incoming)
      const saved = await workspaceStore.update({ catalog: { lessons: merged } })
      if (!saved) {
        message.error('识别成功但保存失败，请刷新页面后重试')
        return false
      }
      jsonText.value = JSON.stringify({ lessons: merged }, null, 2)
      editMode.value = 'json'
      const added = merged.length - existing.length
      message.success(
        added > 0
          ? `目录识别完成，新增 ${added} 课，共 ${merged.length} 课（已与已有目录合并）。`
          : `目录识别完成，共 ${merged.length} 课（与已有目录合并，无新课次）。`
      )
    }
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



async function applyJsonData(parsed: unknown) {

  const obj = parsed as Record<string, unknown>

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

}



function handleExport() {

  if (!workspace.value) return

  exportPartialJwData(workspace.value, 'catalog')

}



async function handleImport(file: File) {

  if (!workspace.value) return false

  try {

    const updates = await importPartialJwDataFromFile(file, workspace.value, 'catalog')

    await workspaceStore.update(updates)

    message.success('目录 JSON 导入成功')

  } catch (e) {

    message.error(e instanceof Error ? e.message : '导入失败')

  }

  return false

}



function goNext() {

  if (!workspace.value) return

  router.push(`/workspace/${workspace.value.id}/tables`)

}

</script>



<template>

  <div>

    <div class="card-section">

      <a-typography-title :level="5">识别目录</a-typography-title>

      <a-typography-paragraph type="secondary">

        上传教材目录图片进行识别，仅提取每课课文和语文园地。可多次上传不同图片（如分两页拍目录），识别结果会自动合并、不会覆盖。也可直接上传/下载 JSON 文件。

      </a-typography-paragraph>

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

        <p class="ant-upload-text">点击或拖拽上传目录图片</p>

        <p class="ant-upload-hint">

          支持 JPG、PNG 格式。将使用 {{ settingsStore.settings.ocrModel || 'Vision' }} 模型直接识别图片

        </p>

      </a-upload-dragger>

      <a-spin v-if="parsing" tip="正在识别目录..." style="margin-top: 16px; display: block" />

    </div>



    <div v-if="workspace" class="card-section">

      <a-typography-title :level="5">

        目录数据 ({{ workspace.catalog.lessons.length }} 课)

      </a-typography-title>

      <a-tabs v-model:activeKey="editMode" style="margin-top: 8px">

        <a-tab-pane key="table" tab="表格编辑">

          <EditableLessonTable

            :data="workspace.catalog.lessons"

            @update="onCatalogUpdate"

          />

        </a-tab-pane>

        <a-tab-pane key="json" tab="JSON 编辑">

          <EditableJsonPanel v-model="jsonText" @apply="applyJsonData" />

        </a-tab-pane>

      </a-tabs>

    </div>



    <a-space style="margin-top: 16px">

      <a-button @click="handleExport">

        <ExportOutlined /> 下载目录 JSON

      </a-button>

      <a-upload :before-upload="handleImport" :show-upload-list="false" :accept="JSON_FILE_ACCEPT">

        <a-button><ImportOutlined /> 上传目录 JSON</a-button>

      </a-upload>

      <a-button type="primary" @click="goNext">

        下一步：识别生字表/词语表 <ArrowRightOutlined />

      </a-button>

    </a-space>

  </div>

</template>

