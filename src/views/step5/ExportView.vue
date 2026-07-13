<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTemplateStylesStore } from '@/stores/templateStyles'
import { BUILTIN_TEMPLATES } from '@/templates/builtin'
import { generateBuiltinExcel } from '@/services/excelGenerator'
import * as storage from '@/utils/storage'
import type { DataSourceType, CustomTemplate } from '@/types'
import { buildExportFileName } from '@/utils/exportName'
import { formatLessonOrdinalLabel } from '@/services/lessonNoUtils'

const workspaceStore = useWorkspaceStore()
const templateStylesStore = useTemplateStylesStore()

const dataSource = ref<DataSourceType>('writing')
const selectedLessons = ref<string[]>([])
const selectedTemplate = ref('char-word-sticker')
const generating = ref(false)
const customTemplates = ref<CustomTemplate[]>([])

const workspace = computed(() => workspaceStore.current)

const lessonOptions = computed(
  () =>
    workspace.value?.catalog.lessons.map((l) => ({
      label: `${formatLessonOrdinalLabel(l.lessonNo)} ${l.title}`,
      value: l.lessonNo,
    })) ?? []
)

const availableTemplates = computed(() =>
  BUILTIN_TEMPLATES.filter((t) => t.dataSource.includes(dataSource.value))
)

onMounted(async () => {
  customTemplates.value = await storage.getAllCustomTemplates()
  if (workspace.value) {
    selectedLessons.value = workspace.value.catalog.lessons.map((l) => l.lessonNo)
  }
})

async function handleGenerate() {
  if (!workspace.value) return
  if (selectedLessons.value.length === 0) {
    message.warning('请至少选择一个课次')
    return
  }

  generating.value = true
  try {
    const options: Record<string, unknown> = {}
    if (selectedTemplate.value === 'lesson-summary-table') {
      options.lessonSummaryStyle = JSON.parse(
        JSON.stringify(templateStylesStore.state.lessonSummary)
      )
    }

    const buffer = await generateBuiltinExcel({
      templateId: selectedTemplate.value,
      workspace: workspace.value,
      dataSource: dataSource.value,
      lessonNos: selectedLessons.value,
      options,
    })

    const tpl = BUILTIN_TEMPLATES.find((t) => t.id === selectedTemplate.value)
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = buildExportFileName(workspace.value, tpl?.name ?? 'export', 'xlsx')
    a.click()
    URL.revokeObjectURL(url)
    message.success('Excel 已生成')
  } catch (e) {
    message.error(e instanceof Error ? e.message : '生成失败')
  } finally {
    generating.value = false
  }
}

function selectAllLessons() {
  selectedLessons.value = lessonOptions.value.map((l) => l.value)
}
</script>

<template>
  <div>
    <div class="card-section">
      <a-typography-title :level="5">生成文件</a-typography-title>
      <a-typography-paragraph type="secondary">
        使用上一步拓展数据，选择模板生成 Excel。
      </a-typography-paragraph>

      <a-form layout="vertical">
        <a-form-item label="数据源">
          <a-radio-group v-model:value="dataSource">
            <a-radio value="writing">写字表</a-radio>
            <a-radio value="reading">识字表</a-radio>
            <a-radio value="vocabulary">词语表</a-radio>
            <a-radio value="combined">三表合并</a-radio>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="选择课次">
          <a-checkbox-group v-model:value="selectedLessons" :options="lessonOptions" />
          <a-button type="link" size="small" @click="selectAllLessons">全选</a-button>
        </a-form-item>
      </a-form>
    </div>

    <div class="card-section">
      <a-typography-title :level="5">选择模板</a-typography-title>
      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col v-for="tpl in availableTemplates" :key="tpl.id" :xs="24" :sm="8">
          <a-card
            :class="{ 'template-selected': selectedTemplate === tpl.id }"
            hoverable
            @click="selectedTemplate = tpl.id"
          >
            <a-typography-title :level="5">{{ tpl.name }}</a-typography-title>
            <p style="color: #666; font-size: 13px">{{ tpl.description }}</p>
          </a-card>
        </a-col>
      </a-row>

    </div>

    <div v-if="customTemplates.length > 0" class="card-section">
      <a-typography-title :level="5">自定义模板</a-typography-title>
      <a-list :data-source="customTemplates" style="margin-top: 12px">
        <template #renderItem="{ item }">
          <a-list-item>{{ item.name }}</a-list-item>
        </template>
      </a-list>
      <a-typography-text type="secondary">自定义模板填充功能将在后续版本实现</a-typography-text>
    </div>

    <a-button type="primary" size="large" :loading="generating" @click="handleGenerate">
      <DownloadOutlined /> 生成并下载 Excel
    </a-button>
  </div>
</template>

<style scoped>
.template-selected {
  border: 2px solid #1677ff;
}
</style>
