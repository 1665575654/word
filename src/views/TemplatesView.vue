<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { UploadOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { BUILTIN_TEMPLATES } from '@/templates/builtin'
import LessonSummaryStylePanel from '@/components/template/LessonSummaryStylePanel.vue'
import * as storage from '@/utils/storage'
import type { CustomTemplate } from '@/types'

const customTemplates = ref<CustomTemplate[]>([])
const styleModalOpen = ref(false)
const stylePanelRef = ref<InstanceType<typeof LessonSummaryStylePanel> | null>(null)

async function openStyleModal() {
  styleModalOpen.value = true
  await nextTick()
  stylePanelRef.value?.reloadFromStore()
}

function handleStyleSave() {
  stylePanelRef.value?.save()
  styleModalOpen.value = false
}

function handleStyleReset() {
  stylePanelRef.value?.reset()
}

async function handleStyleCancel() {
  styleModalOpen.value = false
  await nextTick()
  stylePanelRef.value?.reloadFromStore()
}

onMounted(async () => {
  customTemplates.value = await storage.getAllCustomTemplates()
})

async function handleUploadTemplate(file: File) {
  const buffer = await file.arrayBuffer()
  const placeholders = await scanPlaceholders(buffer)
  const tpl: CustomTemplate = {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.xlsx?$/i, ''),
    fileName: file.name,
    fileData: buffer,
    placeholders,
    createdAt: new Date().toISOString(),
  }
  await storage.saveCustomTemplate(tpl)
  customTemplates.value.unshift(tpl)
  message.success(`模板已上传，发现 ${placeholders.length} 个占位符`)
  return false
}

async function scanPlaceholders(buffer: ArrayBuffer): Promise<string[]> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const found = new Set<string>()
  const regex = /\{\{[^}]+\}\}/g
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const val = String(cell.value ?? '')
        const matches = val.match(regex)
        if (matches) matches.forEach((m) => found.add(m))
      })
    })
  })
  return [...found]
}

async function handleDelete(id: string) {
  await storage.deleteCustomTemplate(id)
  customTemplates.value = customTemplates.value.filter((t) => t.id !== id)
  message.success('已删除')
}
</script>

<template>
  <div class="page-container">
    <a-typography-title :level="3">模板管理</a-typography-title>

    <div class="card-section">
      <a-typography-title :level="5">内置模板</a-typography-title>
      <a-row :gutter="[16, 16]" style="margin-top: 16px">
        <a-col v-for="tpl in BUILTIN_TEMPLATES" :key="tpl.id" :xs="24" :sm="8">
          <a-card>
            <a-typography-title :level="5">{{ tpl.name }}</a-typography-title>
            <p style="color: #666">{{ tpl.description }}</p>
            <div class="tpl-card-footer">
              <a-tag>{{ tpl.category }}</a-tag>
              <a-button
                v-if="tpl.id === 'lesson-summary-table'"
                type="link"
                size="small"
                @click="openStyleModal"
              >
                <SettingOutlined /> 配置样式
              </a-button>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <a-modal
        v-model:open="styleModalOpen"
        title="综合课表 - 样式配置"
        width="720px"
        :mask-closable="false"
        @cancel="handleStyleCancel"
      >
        <LessonSummaryStylePanel ref="stylePanelRef" />
        <template #footer>
          <a-button @click="handleStyleCancel">取消</a-button>
          <a-button @click="handleStyleReset">恢复默认</a-button>
          <a-button type="primary" @click="handleStyleSave">保存</a-button>
        </template>
      </a-modal>
    </div>

    <div class="card-section">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <a-typography-title :level="5" style="margin: 0">自定义模板</a-typography-title>
        <a-upload :before-upload="handleUploadTemplate" :show-upload-list="false" accept=".xlsx,.xls">
          <a-button type="primary">
            <UploadOutlined /> 上传模板
          </a-button>
        </a-upload>
      </div>
      <a-alert
        style="margin-top: 12px"
        type="info"
        show-icon
        message="在 Excel 单元格中使用占位符，如 {{char}}、{{char:red}}、{{word1}}、{{sentence:green}}"
      />
      <a-empty v-if="customTemplates.length === 0" style="margin-top: 24px" description="暂无自定义模板" />
      <a-list v-else style="margin-top: 16px" :data-source="customTemplates">
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta :title="item.name" :description="`占位符: ${item.placeholders.join(', ') || '无'}`" />
            <template #actions>
              <a-popconfirm title="确定删除？" @confirm="handleDelete(item.id)">
                <a-button type="text" danger><DeleteOutlined /></a-button>
              </a-popconfirm>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </div>
  </div>
</template>

<style scoped>
.tpl-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
</style>
